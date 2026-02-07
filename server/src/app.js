// Server application factory - creates and configures Express app
// This can be used both by standalone server and Vercel serverless functions

import express from "express";
import * as store from "./store.js";

// Create Express app with all routes configured
export function createApp(config = {}) {
  const {
    CLIENT_ID = process.env.DISCORD_CLIENT_ID,
    CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET,
    REDIRECT_URI = process.env.DISCORD_REDIRECT_URI,
    HOST_ALLOW_ALL = false,
    HOST_IDS = new Set(),
    // When true, API routes are mounted at both root (/) and /api for Vercel serverless compatibility
    // Vercel strips the /api prefix before routing to serverless functions
    mountAtRoot = false,
  } = config;

  const app = express();
  app.use(express.json());

  // CORS middleware for local development
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    
    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    
    next();
  });

  // Health endpoint
  app.get("/health", (req, res) => {
    const storeDiagnostics = store.getStoreDiagnostics();
    
    // Determine overall health status
    const hasConfigIssues = !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI;
    const hasPersistenceIssues = storeDiagnostics.persistence.consecutiveFailures > 3;
    
    res.json({
      ok: !hasConfigIssues && !hasPersistenceIssues,
      timestamp: new Date().toISOString(),
      config: {
        redirectUri: REDIRECT_URI,
        clientId: CLIENT_ID,
        secretConfigured: !!(CLIENT_SECRET && CLIENT_SECRET.length > 0),
        secretLength: (CLIENT_SECRET || "").length,
      },
      hostAuth: {
        allowAll: HOST_ALLOW_ALL,
        hostIdsCount: HOST_IDS.size,
        configured: storeDiagnostics.hostAuth.configured,
      },
      store: storeDiagnostics,
      warnings: [
        ...(!CLIENT_ID ? ['DISCORD_CLIENT_ID not configured'] : []),
        ...(!CLIENT_SECRET ? ['DISCORD_CLIENT_SECRET not configured'] : []),
        ...(!REDIRECT_URI ? ['DISCORD_REDIRECT_URI not configured'] : []),
        ...(hasPersistenceIssues ? ['Persistence failures detected'] : []),
        ...(!storeDiagnostics.persistence.dataDirWritable ? ['Data directory not writable'] : []),
      ],
    });
  });

  // ---- OAuth token exchange ----
  async function tokenHandler(req, res) {
    try {
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ error: "missing_code" });

      if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
        return res.status(500).json({ error: "server_misconfigured" });
      }

      // redirect_uri must match EXACTLY what was used to generate the code.
      // Try both slash/no-slash.
      const candidates = [];
      const r0 = String(REDIRECT_URI);
      candidates.push(r0);
      if (r0.endsWith("/")) candidates.push(r0.slice(0, -1));
      else candidates.push(r0 + "/");

      let last = null;

      for (const redirect_uri of Array.from(new Set(candidates))) {
        const body = new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri,
        });

        const r = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        const data = await r.json().catch(() => ({}));
        last = { ok: r.ok, status: r.status, data, redirect_uri };

        if (r.ok) return res.json({ access_token: data.access_token });

        if (data?.error !== "invalid_grant") break;
      }

      return res.status(400).json({
        error: "token_exchange_failed",
        details: last?.data ?? null,
        triedRedirects: candidates,
      });
    } catch (e) {
      return res.status(500).json({ error: "token_exchange_exception", details: String(e) });
    }
  }

  app.post("/api/token", tokenHandler);
  app.post("/token", tokenHandler);

  // Create API router
  const apiRouter = express.Router();

  // Logging middleware for API routes - helps with diagnostics
  apiRouter.use((req, res, next) => {
    const start = Date.now();
    const originalSend = res.json;
    
    res.json = function(data) {
      const duration = Date.now() - start;
      const isError = res.statusCode >= 400;
      const logLevel = isError ? 'warn' : 'info';
      
      console[logLevel](`[API ${req.method} ${req.path}]`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        userId: req.body?.userId || req.query?.userId || 'anonymous',
        error: isError ? data.error : undefined,
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  });

  // Start a new session.  Body must include userId; username is optional.
  apiRouter.post('/session/start', (req, res) => {
    const { userId, username, sessionId, channelId, guildId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const result = store.createSession({ userId, username, sessionId, channelId, guildId });
    
    // Handle unauthorized host error
    if (result && result.error === 'unauthorized_host') {
      return res.status(403).json({ 
        error: 'unauthorized_host',
        message: 'You are not authorized to create meetings. Contact an administrator.',
      });
    }
    
    const raw = store.getSession(result.id);
    return res.json({ sessionId: raw.id, state: result, revision: raw.revision, serverNow: Date.now() });
  });

  // Join an existing session
  apiRouter.post('/session/:id/join', (req, res) => {
    const sessionId = req.params.id;
    const { userId, username } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.joinSession({ sessionId, userId, username });
    if (!state) return res.status(404).json({ error: 'not_found' });
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Poll session state
  apiRouter.get('/session/:id/state', (req, res) => {
    const sessionId = req.params.id;
    const sinceRevision = req.query.sinceRevision != null ? Number(req.query.sinceRevision) : null;
    const userId = req.query.userId || req.query.userid;
    if (userId) store.markSeen({ sessionId, userId });
    const session = store.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'not_found' });
    if (sinceRevision != null && sinceRevision >= session.revision) {
      return res.json({ unchanged: true, revision: session.revision, serverNow: Date.now() });
    }
    const snapshot = store.getSnapshot(sessionId);
    return res.json({ state: snapshot, revision: session.revision, serverNow: Date.now() });
  });

  // Update meeting setup (name and agenda before meeting starts)
  apiRouter.post('/session/:id/setup', (req, res) => {
    const sessionId = req.params.id;
    const { userId, meetingName, agenda } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.updateMeetingSetup({ sessionId, userId, meetingName, agenda });
    if (!state) {
      console.warn('[Authorization] User attempted setup update without host access:', {
        sessionId,
        userId,
        operation: 'updateMeetingSetup',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    if (state.error) {
      return res.status(400).json(state);
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Start the meeting
  apiRouter.post('/session/:id/start-meeting', (req, res) => {
    const sessionId = req.params.id;
    const { userId, startTimer } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.startMeeting({ sessionId, userId, startTimer });
    if (!state) {
      console.warn('[Authorization] User attempted to start meeting without host access:', {
        sessionId,
        userId,
        operation: 'startMeeting',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Add a new agenda item
  apiRouter.post('/session/:id/agenda', (req, res) => {
    const sessionId = req.params.id;
    const { userId, title, durationSec, type, description, link, category } = req.body || {};
    if (!userId || !title) return res.status(400).json({ error: 'missing_fields' });
    const state = store.addAgenda({ sessionId, userId, title, durationSec, type, description, link, category });
    if (!state) {
      console.warn('[Authorization] User attempted agenda operation without host access:', {
        sessionId,
        userId,
        operation: 'addAgenda',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Update an agenda item
  apiRouter.put('/session/:id/agenda/:agendaId', (req, res) => {
    const sessionId = req.params.id;
    const { agendaId } = req.params;
    const { userId, title, durationSec, notes, type, description, link, category, onBallot } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.updateAgenda({ sessionId, userId, agendaId, title, durationSec, notes, type, description, link, category, onBallot });
    if (!state) {
      console.warn('[Authorization] User attempted agenda update without host access:', {
        sessionId,
        userId,
        agendaId,
        operation: 'updateAgenda',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Delete an agenda item
  apiRouter.delete('/session/:id/agenda/:agendaId', (req, res) => {
    const sessionId = req.params.id;
    const { agendaId } = req.params;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.deleteAgenda({ sessionId, userId, agendaId });
    if (!state) {
      console.warn('[Authorization] User attempted agenda delete without host access:', {
        sessionId,
        userId,
        agendaId,
        operation: 'deleteAgenda',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Set active agenda item
  apiRouter.post('/session/:id/agenda/:agendaId/active', (req, res) => {
    const sessionId = req.params.id;
    const { agendaId } = req.params;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.setActiveAgenda({ sessionId, userId, agendaId });
    if (!state) {
      console.warn('[Authorization] User attempted set active agenda without host access:', {
        sessionId,
        userId,
        agendaId,
        operation: 'setActiveAgenda',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Reorder agenda items
  apiRouter.put('/session/:id/agenda/reorder', (req, res) => {
    const sessionId = req.params.id;
    const { userId, orderedIds } = req.body || {};
    if (!userId || !Array.isArray(orderedIds)) return res.status(400).json({ error: 'missing_fields' });
    const state = store.reorderAgenda({ sessionId, userId, orderedIds });
    if (!state) {
      console.warn('[Authorization] User attempted agenda reorder without host access:', {
        sessionId,
        userId,
        operation: 'reorderAgenda',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Timer controls
  apiRouter.post('/session/:id/timer/start', (req, res) => {
    const sessionId = req.params.id;
    const { userId, durationMinutes } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.startTimer({ sessionId, userId, durationMinutes });
    if (!state) {
      console.warn('[Authorization] User attempted timer start without host access:', {
        sessionId,
        userId,
        operation: 'startTimer',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/timer/pause', (req, res) => {
    const sessionId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.pauseTimer({ sessionId, userId });
    if (!state) {
      console.warn('[Authorization] User attempted timer pause without host access:', {
        sessionId,
        userId,
        operation: 'pauseTimer',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/timer/extend', (req, res) => {
    const sessionId = req.params.id;
    const { userId, seconds } = req.body || {};
    if (!userId || seconds == null) return res.status(400).json({ error: 'missing_fields' });
    const state = store.extendTimer({ sessionId, userId, seconds });
    if (!state) {
      console.warn('[Authorization] User attempted timer extend without host access:', {
        sessionId,
        userId,
        operation: 'extendTimer',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Time bank controls
  apiRouter.post('/session/:id/timebank/toggle', (req, res) => {
    const sessionId = req.params.id;
    const { userId, enabled } = req.body || {};
    if (!userId || enabled == null) return res.status(400).json({ error: 'missing_fields' });
    const state = store.toggleTimeBank({ sessionId, userId, enabled });
    if (!state) {
      console.warn('[Authorization] User attempted time bank toggle without host access:', {
        sessionId,
        userId,
        operation: 'toggleTimeBank',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/timebank/apply', (req, res) => {
    const sessionId = req.params.id;
    const { userId, seconds } = req.body || {};
    if (!userId || seconds == null) return res.status(400).json({ error: 'missing_fields' });
    const state = store.applyTimeBank({ sessionId, userId, seconds });
    if (!state) {
      console.warn('[Authorization] User attempted time bank apply without host access:', {
        sessionId,
        userId,
        operation: 'applyTimeBank',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    if (state.error) {
      return res.status(400).json(state);
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/agenda/complete', (req, res) => {
    const sessionId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.completeAgendaItem({ sessionId, userId });
    if (!state) {
      console.warn('[Authorization] User attempted complete agenda without host access:', {
        sessionId,
        userId,
        operation: 'completeAgendaItem',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    if (state.error) {
      return res.status(400).json(state);
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });


  // Voting
  apiRouter.post('/session/:id/vote/open', (req, res) => {
    const sessionId = req.params.id;
    const { userId, question, options } = req.body || {};
    if (!userId || !question || !Array.isArray(options)) return res.status(400).json({ error: 'missing_fields' });
    const state = store.openVote({ sessionId, userId, question, options });
    if (!state) {
      console.warn('[Authorization] User attempted vote open without host access:', {
        sessionId,
        userId,
        operation: 'openVote',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/vote/cast', (req, res) => {
    const sessionId = req.params.id;
    const { userId, optionIndex } = req.body || {};
    if (!userId || optionIndex == null) return res.status(400).json({ error: 'missing_fields' });
    const state = store.castVote({ sessionId, userId, optionIndex });
    if (!state) return res.status(403).json({ error: 'forbidden', message: 'Vote not open or invalid option' });
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  apiRouter.post('/session/:id/vote/close', (req, res) => {
    const sessionId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.closeVote({ sessionId, userId });
    if (!state) {
      console.warn('[Authorization] User attempted vote close without host access:', {
        sessionId,
        userId,
        operation: 'closeVote',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Toggle ballot status for proposal agenda items
  apiRouter.post('/session/:id/agenda/:agendaId/ballot', (req, res) => {
    const sessionId = req.params.id;
    const { agendaId } = req.params;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const state = store.toggleBallot({ sessionId, userId, agendaId });
    if (!state) {
      console.warn('[Authorization] User attempted ballot toggle without host access:', {
        sessionId,
        userId,
        agendaId,
        operation: 'toggleBallot',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // Set category time budget
  apiRouter.put('/session/:id/category-budget', (req, res) => {
    const sessionId = req.params.id;
    const { userId, category, seconds } = req.body || {};
    if (!userId || !category) return res.status(400).json({ error: 'missing_fields' });
    const state = store.setCategoryBudget({ sessionId, userId, category, seconds });
    if (!state) {
      console.warn('[Authorization] User attempted category budget update without host access:', {
        sessionId,
        userId,
        category,
        operation: 'setCategoryBudget',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    const raw = store.getSession(sessionId);
    return res.json({ state, revision: raw.revision, serverNow: Date.now() });
  });

  // End meeting and generate minutes
  apiRouter.post('/session/:id/end', (req, res) => {
    const sessionId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'missing_userId' });
    const minutes = store.endMeeting({ sessionId, userId });
    if (!minutes) {
      console.warn('[Authorization] User attempted end meeting without host access:', {
        sessionId,
        userId,
        operation: 'endMeeting',
      });
      return res.status(403).json({ error: 'forbidden', message: 'Host access required' });
    }
    return res.json({ minutes, serverNow: Date.now() });
  });

  // Mount the API router
  // For Vercel serverless functions, also mount at root since /api prefix is stripped
  if (mountAtRoot) {
    app.use('/', apiRouter);
  }
  app.use('/api', apiRouter);
  app.use('/proxy/api', apiRouter);

  return app;
}
