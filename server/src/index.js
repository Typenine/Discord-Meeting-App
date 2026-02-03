import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server/.env.local then server/.env, overriding any existing shell env vars.
const envLocalPath = path.resolve(__dirname, "../.env.local");
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

// ---- config ----
const PORT = Number(process.env.PORT || 8787);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

// Host allowlist: comma-separated user IDs; "*" means allow anyone.
const rawHostIds = String(process.env.HOST_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HOST_ALLOW_ALL = rawHostIds.includes("*");
const HOST_IDS = new Set(rawHostIds.filter((id) => id !== "*"));

console.log("[ENV CHECK]", {
  cwd: process.cwd(),
  envLocalPath,
  envPath,
  envLocalExists: fs.existsSync(envLocalPath),
  envExists: fs.existsSync(envPath),
  port: PORT,
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  secretLength: (CLIENT_SECRET || "").length,
  hostAllowAll: HOST_ALLOW_ALL,
  hostIdsCount: HOST_IDS.size,
});

import express from "express";
// Import our persistent meeting store.  This replaces the old websocket
// meeting implementation with a simple in‑memory + file backed store and
// HTTP endpoints.  See store.js for details.
import * as store from "./store.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    redirectUri: REDIRECT_URI,
    clientId: CLIENT_ID,
    secretLength: (CLIENT_SECRET || "").length,
    hostAllowAll: HOST_ALLOW_ALL,
    hostIdsCount: HOST_IDS.size,
  });
});

function isAllowedHost(userId) {
  if (HOST_ALLOW_ALL) return true;
  return HOST_IDS.has(String(userId));
}

// ---- OAuth token exchange ----
// Support both /api/token and /token because some proxy setups strip the /api prefix.
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

// ---- server + ws ----
// Start the HTTP server.  Note: we no longer attach a WebSocket server because
// this implementation uses polling via HTTP endpoints instead.
const server = app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

// ---------------------------------------------------------------------------
// RESTful API for meetings
//
// The client polls these endpoints approximately once per second using
// sinceRevision and serverNow parameters to stay in sync.  Host‑only actions
// are protected by comparing the supplied userId against the stored
// hostUserId for the session.  The same routes are mounted under both
// `/api` and `/proxy/api` so that running inside Discord (proxied) and
// outside Discord use the same code paths.  See client/src/api.js for
// helpers that construct the correct base URL.

const apiRouter = express.Router();

// Start a new session.  Body must include userId; username is optional.
apiRouter.post('/session/start', (req, res) => {
  const { userId, username, sessionId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.createSession({ userId, username, sessionId });
  const raw = store.getSession(state.id);
  return res.json({ sessionId: raw.id, state, revision: raw.revision, serverNow: Date.now() });
});

// Join an existing session.  Adds user to attendance.  Body must include userId.
apiRouter.post('/session/:id/join', (req, res) => {
  const sessionId = req.params.id;
  const { userId, username } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.joinSession({ sessionId, userId, username });
  if (!state) return res.status(404).json({ error: 'not_found' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Poll session state.  Accepts optional sinceRevision to avoid sending full
// state when nothing has changed.  Accepts optional userId to mark
// lastSeenAt.  Returns either `{ unchanged: true }` or full state.
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

// Add a new agenda item.  Host‑only.  Body must include userId, title, durationSec.
apiRouter.post('/session/:id/agenda', (req, res) => {
  const sessionId = req.params.id;
  const { userId, title, durationSec } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'missing_fields' });
  const state = store.addAgenda({ sessionId, userId, title, durationSec });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Update an agenda item.  Host‑only.  Body may include title, durationSec, notes.
apiRouter.put('/session/:id/agenda/:agendaId', (req, res) => {
  const sessionId = req.params.id;
  const { agendaId } = req.params;
  const { userId, title, durationSec, notes } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.updateAgenda({ sessionId, userId, agendaId, title, durationSec, notes });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Delete an agenda item.  Host‑only.
apiRouter.delete('/session/:id/agenda/:agendaId', (req, res) => {
  const sessionId = req.params.id;
  const { agendaId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.deleteAgenda({ sessionId, userId, agendaId });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Set active agenda item.  Host‑only.
apiRouter.post('/session/:id/agenda/:agendaId/active', (req, res) => {
  const sessionId = req.params.id;
  const { agendaId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.setActiveAgenda({ sessionId, userId, agendaId });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Timer controls.  Host‑only.
apiRouter.post('/session/:id/timer/start', (req, res) => {
  const sessionId = req.params.id;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.startTimer({ sessionId, userId });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

apiRouter.post('/session/:id/timer/pause', (req, res) => {
  const sessionId = req.params.id;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.pauseTimer({ sessionId, userId });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

apiRouter.post('/session/:id/timer/extend', (req, res) => {
  const sessionId = req.params.id;
  const { userId, seconds } = req.body || {};
  if (!userId || seconds == null) return res.status(400).json({ error: 'missing_fields' });
  const state = store.extendTimer({ sessionId, userId, seconds });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// Voting
apiRouter.post('/session/:id/vote/open', (req, res) => {
  const sessionId = req.params.id;
  const { userId, question, options } = req.body || {};
  if (!userId || !question || !Array.isArray(options)) return res.status(400).json({ error: 'missing_fields' });
  const state = store.openVote({ sessionId, userId, question, options });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

apiRouter.post('/session/:id/vote/cast', (req, res) => {
  const sessionId = req.params.id;
  const { userId, optionIndex } = req.body || {};
  if (!userId || optionIndex == null) return res.status(400).json({ error: 'missing_fields' });
  const state = store.castVote({ sessionId, userId, optionIndex });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

apiRouter.post('/session/:id/vote/close', (req, res) => {
  const sessionId = req.params.id;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const state = store.closeVote({ sessionId, userId });
  if (!state) return res.status(403).json({ error: 'forbidden' });
  const raw = store.getSession(sessionId);
  return res.json({ state, revision: raw.revision, serverNow: Date.now() });
});

// End meeting and generate minutes.  Host‑only.  Returns minutes string.
apiRouter.post('/session/:id/end', (req, res) => {
  const sessionId = req.params.id;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  const minutes = store.endMeeting({ sessionId, userId });
  if (!minutes) return res.status(403).json({ error: 'forbidden' });
  return res.json({ minutes, serverNow: Date.now() });
});

// Mount the API router under both /api and /proxy/api.  This dual mount
// allows the client to seamlessly work inside Discord (proxied) and
// outside Discord without changing code.  Additional prefixes could be
// added here as needed.
app.use('/api', apiRouter);
app.use('/proxy/api', apiRouter);
