// Cloudflare Worker + Durable Object backend for Discord Agenda Activity
// Supports both Discord Activity mode and standalone room + hostKey mode

// ---- CORS helpers ----

// Check if origin is allowed
function isAllowedOrigin(origin) {
  if (!origin) return false;
  
  // Allow Vercel deployments (must match https://*.vercel.app pattern)
  // This regex allows any reasonable subdomain including complex preview deployment names
  // Examples: app.vercel.app, my-app-git-main-user.vercel.app, project-hash-team.vercel.app
  if (origin.match(/^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.vercel\.app$/)) return true;
  
  // Allow localhost for development (common Vite/React/Node ports)
  const allowedLocalOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8787',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8787'
  ];
  if (allowedLocalOrigins.includes(origin)) return true;
  
  return false;
}

// Get CORS headers for a given request
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  
  // If no origin header, don't set CORS headers
  if (!origin) {
    console.log('[CORS] No Origin header in request');
    return {};
  }
  
  // Check if origin is allowed
  const allowed = isAllowedOrigin(origin);
  console.log('[CORS] Origin:', origin, '| Allowed:', allowed);
  
  if (!allowed) return {};
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Wrap a response with CORS headers
function withCors(response, request) {
  const corsHeaders = getCorsHeaders(request);
  
  // If no CORS headers needed, return response as-is
  if (Object.keys(corsHeaders).length === 0) return response;
  
  // Clone the response and add CORS headers
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// Generate a random room ID (6 characters, alphanumeric)
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate a secure hostKey (16 characters, base64-like)
function generateHostKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parseHostConfig(raw) {
  const parts = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowAll = parts.includes("*");
  const ids = new Set(parts.filter((id) => id !== "*"));

  return { allowAll, ids };
}

function isAllowedHost(userId, hostConfig) {
  if (!userId) return false;
  if (!hostConfig) return false;
  if (hostConfig.allowAll) return true;
  const u = String(userId).trim();
  return hostConfig.ids.has(u);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

// ---- Meeting state helpers (ported from server/src/meeting.js) ----

function createMeetingSession({ sessionId, hostKey = null, hostKeyFallback = null }) {
  return {
    sessionId,
    hostUserId: null,
    hostKey, // For standalone room mode (null for Discord Activity mode)
    hostKeyFallback, // For Discord Activity mode: optional hostKey for testing without Discord OAuth
    agenda: [],
    activeAgendaId: null,
    timer: {
      running: false,
      endsAtMs: null, // Authoritative absolute end time (when running)
      durationSec: 0, // Duration for current agenda item
      pausedRemainingSec: null, // Remaining seconds when paused
      updatedAtMs: Date.now(), // Server timestamp of last timer state change
    },
    vote: {
      open: false,
      question: "",
      options: [], // Array<{ id, label }>
      votesByClientId: {}, // { [clientId]: optionId }
      closedResults: [], // history
    },
    attendance: {}, // { [userId]: { displayName, joinedAt } }
    log: [],
  };
}

function snapshot(session) {
  return JSON.parse(JSON.stringify(session));
}

function getActiveItem(session) {
  return session.agenda.find((a) => a.id === session.activeAgendaId) ?? null;
}

function setActiveItem(session, agendaId) {
  const exists = session.agenda.some((a) => a.id === agendaId);
  if (!exists) return false;
  session.activeAgendaId = agendaId;

  // ALWAYS reset timer when changing active item (per requirements)
  const item = getActiveItem(session);
  if (item) {
    session.timer.running = false;
    session.timer.endsAtMs = null;
    session.timer.pausedRemainingSec = null;
    session.timer.durationSec = item.durationSec || 0;
    session.timer.updatedAtMs = Date.now();
  }

  return true;
}

function nextAgendaItem(session) {
  if (session.agenda.length === 0) return false;
  
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const nextIndex = (currentIndex + 1) % session.agenda.length;
  const nextItem = session.agenda[nextIndex];
  
  if (nextItem) {
    return setActiveItem(session, nextItem.id);
  }
  return false;
}

function prevAgendaItem(session) {
  if (session.agenda.length === 0) return false;
  
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const prevIndex = currentIndex <= 0 ? session.agenda.length - 1 : currentIndex - 1;
  const prevItem = session.agenda[prevIndex];
  
  if (prevItem) {
    return setActiveItem(session, prevItem.id);
  }
  return false;
}

function timerStart(session) {
  if (session.timer.running) return;
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.durationSec * 1000;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}

function timerPause(session) {
  if (!session.timer.running) return;
  const serverNowMs = Date.now();
  const remainingMs = Math.max(0, session.timer.endsAtMs - serverNowMs);
  session.timer.pausedRemainingSec = Math.ceil(remainingMs / 1000);
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.updatedAtMs = serverNowMs;
}

function timerResume(session) {
  if (session.timer.running) return;
  if (session.timer.pausedRemainingSec === null) return;
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.pausedRemainingSec * 1000;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}

function timerReset(session) {
  const serverNowMs = Date.now();
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.pausedRemainingSec = null;
  // Keep durationSec as is (from active agenda item)
  session.timer.updatedAtMs = serverNowMs;
}

function timerResetToActiveItem(session) {
  const item = getActiveItem(session);
  const sec = item ? (item.durationSec || 0) : 0;
  const serverNowMs = Date.now();
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.pausedRemainingSec = null;
  session.timer.durationSec = sec;
  session.timer.updatedAtMs = serverNowMs;
}

function openVote(session, { question, options }) {
  session.vote.open = true;
  session.vote.question = question;
  // Convert options to structured format: [{ id, label }]
  // If options are already objects with id, keep them; otherwise generate ids
  session.vote.options = options.map((opt, idx) => {
    if (typeof opt === 'object' && opt.id && opt.label) {
      return opt;
    }
    // Convert string to object with generated id
    const label = typeof opt === 'string' ? opt : String(opt);
    return { id: `opt${idx + 1}`, label };
  });
  session.vote.votesByClientId = {};
}

function castVote(session, { userId, optionId }) {
  if (!session.vote.open) return false;
  // Find option by id
  const optionExists = session.vote.options.some(opt => opt.id === optionId);
  if (!optionExists) return false;
  session.vote.votesByClientId[userId] = optionId;
  return true;
}

function closeVote(session) {
  if (!session.vote.open) return null;

  // Count votes by option id
  const tally = {};
  session.vote.options.forEach(opt => {
    tally[opt.id] = 0;
  });
  
  for (const optionId of Object.values(session.vote.votesByClientId)) {
    if (tally[optionId] !== undefined) {
      tally[optionId] += 1;
    }
  }

  const result = {
    ts: Date.now(),
    agendaId: session.activeAgendaId,
    question: session.vote.question,
    options: session.vote.options, // Keep structured options
    tally, // { [optionId]: count }
    totalVotes: Object.keys(session.vote.votesByClientId).length,
  };

  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = "";
  session.vote.options = [];
  session.vote.votesByClientId = {};

  session.log.push({ ts: Date.now(), type: "VOTE_CLOSED", result });
  return result;
}

async function handleToken(request, env) {
  const url = new URL(request.url);
  let status = 500;

  console.log("[/api/token] request", { path: url.pathname, search: url.search });

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[/api/token] JSON parse error", String(err));
    status = 400;
    const resp = jsonResponse({ error: "invalid_json", details: "Request body must be JSON with { code }" }, status);
    console.log("[/api/token] response", { path: url.pathname, status });
    return resp;
  }

  const code = body?.code;
  if (!code) {
    status = 400;
    const resp = jsonResponse({ error: "missing_code" }, status);
    console.log("[/api/token] response", { path: url.pathname, status });
    return resp;
  }

  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    status = 500;
    const resp = jsonResponse({ error: "server_misconfigured" }, status);
    console.log("[/api/token] response", { path: url.pathname, status });
    return resp;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    // Must match EXACTLY what Discord uses for the OAuth redirect.
    redirect_uri: redirectUri,
  });

  try {
    const discordResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const text = await discordResp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error("[/api/token] Discord JSON parse error", String(err));
      data = { raw: text ?? null };
    }

    status = discordResp.status;

    if (discordResp.ok && data && data.access_token) {
      console.log("[/api/token] success", { status });
      const resp = jsonResponse({ access_token: data.access_token }, 200);
      console.log("[/api/token] response", { path: url.pathname, status: 200 });
      return resp;
    }

    console.warn("[/api/token] failure", { status, data });
    const errorStatus = discordResp.status === 400 ? 400 : 502;
    const resp = jsonResponse(
      {
        error: "token_exchange_failed",
        details: { status: discordResp.status, body: data },
      },
      errorStatus,
    );
    console.log("[/api/token] response", { path: url.pathname, status: errorStatus });
    return resp;
  } catch (err) {
    console.error("[/api/token] exception", String(err));
    status = 500;
    const resp = jsonResponse({ error: "token_exchange_exception", details: String(err) }, status);
    console.log("[/api/token] response", { path: url.pathname, status });
    return resp;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle OPTIONS preflight requests for all /api/* endpoints
    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return withCors(
        new Response(null, { 
          status: 204,
          headers: {
            'Content-Length': '0',
          },
        }),
        request
      );
    }

    if (pathname === "/health" || pathname === "/api/health") {
      const hostConfig = parseHostConfig(env.HOST_USER_IDS);
      return withCors(
        jsonResponse({
          ok: true,
          clientId: env.DISCORD_CLIENT_ID || null,
          redirectUri: env.DISCORD_REDIRECT_URI || null,
          hostAllowAll: hostConfig.allowAll,
          hostIdsCount: hostConfig.ids.size,
        }),
        request
      );
    }

    if (pathname === "/api/token" && request.method === "POST") {
      const response = await handleToken(request, env);
      return withCors(response, request);
    }

    // Create new standalone room
    if (pathname === "/api/room/create" && request.method === "POST") {
      const roomId = generateRoomId();
      const hostKey = generateHostKey();
      
      return withCors(
        jsonResponse({
          roomId,
          hostKey,
          viewerUrl: `${url.origin}/?room=${roomId}`,
          hostUrl: `${url.origin}/?room=${roomId}&hostKey=${hostKey}`,
        }),
        request
      );
    }

    if (pathname === "/api/ws" && request.headers.get("Upgrade") === "websocket") {
      const room = url.searchParams.get("room") || "default";
      const id = env.MEETING_ROOM.idFromName(room);
      const stub = env.MEETING_ROOM.get(id);

      const wsRequest = new Request(request, {
        headers: new Headers([
          ...request.headers,
          ["X-Room-Id", room],
        ]),
      });

      return stub.fetch(wsRequest);
    }

    return withCors(
      jsonResponse({ error: "not_found", path: pathname }, 404),
      request
    );
  },
};

export class MeetingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    this.metadata = new Map(); // ws -> { sessionId, clientId, userId, hostKey, clientTimeOffset }
    this.session = null;
    this.hostConfig = parseHostConfig(env.HOST_USER_IDS);
    // Vote batching to prevent broadcast storms with 10-15 users
    this.voteBatchTimer = null;
    this.voteBatchPending = false;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleWebSocket(server, request);
      return new Response(null, { status: 101, webSocket: client });
    }

    return jsonResponse({ error: "not_found_in_durable_object" }, 404);
  }

  getOrCreateSession(sessionId, hostKey = null, hostKeyFallback = null) {
    if (!this.session) {
      const id = sessionId || "default";
      this.session = createMeetingSession({ sessionId: id, hostKey, hostKeyFallback });
    }
    return this.session;
  }

  // Validate host access: supports both standalone (hostKey) and Discord Activity mode (userId/allowlist)
  // For Discord Activity mode, also accepts hostKey as fallback (for testing without Discord OAuth)
  validateHostAccess(clientId, providedHostKey) {
    if (!this.session) return false;
    
    // Standalone room mode: check hostKey
    if (this.session.hostKey) {
      return providedHostKey === this.session.hostKey;
    }
    
    // Discord Activity mode: check userId/clientId match
    if (this.session.hostUserId === clientId) {
      return true;
    }
    
    // Discord Activity mode fallback: if hostKey was provided, check against stored hostKey
    // This allows testing Discord Activity UI without Discord OAuth by using hostKey
    if (providedHostKey && this.session.hostKeyFallback) {
      return providedHostKey === this.session.hostKeyFallback;
    }
    
    return false;
  }

  // Timer loop removed - no server-side ticking needed
  // Clients render countdown locally using endsAtMs and serverOffset

  broadcastState() {
    if (!this.session) return;
    const state = snapshot(this.session);
    // Remove hostKey from broadcast for security
    const safeState = { ...state };
    delete safeState.hostKey;
    const payload = JSON.stringify({ 
      type: "STATE", 
      state: safeState,
      serverNow: Date.now(),
    });
    for (const ws of this.sockets) {
      try {
        ws.send(payload);
      } catch (e) {
        console.warn("[WS] broadcast send failed", String(e));
      }
    }
  }

  // Batched broadcast for vote casts to prevent storms with 10-15 users
  // Aggregates multiple vote casts over 500ms window into single broadcast
  batchedBroadcastState() {
    // Clear any existing timer
    if (this.voteBatchTimer) {
      clearTimeout(this.voteBatchTimer);
    }
    
    this.voteBatchPending = true;
    
    // Batch for 500ms - aggregates multiple votes into one broadcast
    this.voteBatchTimer = setTimeout(() => {
      this.voteBatchPending = false;
      this.voteBatchTimer = null;
      this.broadcastState();
    }, 500);
  }

  handleWebSocket(ws, request) {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || request.headers.get("X-Room-Id") || "default";

    ws.accept();
    this.sockets.add(ws);

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.warn("[WS] invalid JSON", String(err));
        return;
      }

      // Handle TIME_PING for clock offset calibration
      if (msg && msg.type === "TIME_PING") {
        const serverNow = Date.now();
        ws.send(JSON.stringify({ 
          type: "TIME_PONG", 
          clientSentAt: msg.clientSentAt,
          serverNow,
        }));
        return;
      }

      if (msg && msg.type === "HELLO") {
        console.log("[WS HELLO payload]", JSON.stringify(msg, null, 2));

        // New structure: { type:"HELLO", roomId, clientId, hostKey?, displayName }
        // Also support old structure for Discord Activity mode
        let clientId = msg.clientId;
        let hostKey = msg.hostKey || null;
        // Extract displayName - prefer explicit displayName, fall back to username
        // Only use "Guest" as last resort if nothing was provided
        let displayName = msg.displayName || msg.username || null;
        let roomId = msg.roomId || msg.sessionId || room;

        // Discord Activity mode: extract userId from SDK payload (for backward compatibility)
        let discordUserId = null;
        if (msg.userId != null) {
          discordUserId = msg.userId;
        } else if (msg.user && msg.user.id != null) {
          discordUserId = msg.user.id;
        } else if (msg.user && msg.user.user && msg.user.user.id != null) {
          discordUserId = msg.user.user.id;
        }

        // Determine the identifier to use (prefer clientId, fall back to discordUserId)
        const identifier = clientId || discordUserId;
        
        if (!identifier || !roomId) {
          console.warn("[WS HELLO] missing clientId/userId or roomId", { clientId, discordUserId, roomId });
          return;
        }
        
        // Validate displayName is present - reject connection if empty
        if (!displayName || !displayName.trim()) {
          console.warn("[WS HELLO] missing displayName", { clientId, roomId });
          ws.send(JSON.stringify({ 
            type: "ERROR", 
            error: "missing_display_name",
            message: "Display name is required to join the meeting"
          }));
          return;
        }
        
        // Use trimmed displayName
        displayName = displayName.trim();

        // For Discord Activity mode, check if user is allowed to be host
        const allowed = discordUserId ? isAllowedHost(discordUserId, this.hostConfig) : false;
        
        // If not standalone mode (no hostKey in URL) but hostKey provided, use it as fallback
        // This allows testing Discord Activity mode without Discord OAuth
        const hostKeyFallback = (!hostKey && msg.hostKey) ? msg.hostKey : null;
        
        const session = this.getOrCreateSession(roomId, hostKey, hostKeyFallback);

        // Set host based on mode
        if (!session.hostUserId) {
          if (session.hostKey) {
            // Standalone mode: host is whoever has the hostKey
            if (hostKey === session.hostKey) {
              session.hostUserId = identifier;
              session.log.push({ ts: Date.now(), type: "HOST_SET", clientId: identifier, mode: "standalone" });
              console.log("[HOST_SET] standalone mode", { sessionId: roomId, hostUserId: session.hostUserId });
            }
          } else if (allowed && discordUserId) {
            // Discord Activity mode: host is first allowed user (via allowlist)
            session.hostUserId = discordUserId;
            session.log.push({ ts: Date.now(), type: "HOST_SET", userId: discordUserId, mode: "discord_allowlist" });
            console.log("[HOST_SET] discord mode via allowlist", { sessionId: roomId, hostUserId: session.hostUserId });
          } else if (!allowed && hostKeyFallback) {
            // Discord Activity mode fallback: if allowlist doesn't match but hostKey provided, set hostKeyFallback
            // This enables testing Discord Activity UI without Discord OAuth
            if (!session.hostKeyFallback) {
              session.hostKeyFallback = hostKeyFallback;
              session.hostUserId = identifier;
              session.log.push({ ts: Date.now(), type: "HOST_SET", clientId: identifier, mode: "discord_hostkey_fallback" });
              console.log("[HOST_SET] discord mode via hostKey fallback", { sessionId: roomId, hostUserId: session.hostUserId });
            }
          }
        }

        // Add to attendance using clientId
        if (!session.attendance[identifier]) {
          session.attendance[identifier] = {
            clientId: identifier,
            userId: discordUserId, // Keep discordUserId for backward compatibility
            displayName,
            joinedAt: Date.now(),
          };
        }

        // Determine isHost: check standalone hostKey, Discord Activity userId, or hostKeyFallback
        const isHost = session.hostKey 
          ? (hostKey === session.hostKey)
          : (session.hostUserId === identifier || 
             (hostKeyFallback && session.hostKeyFallback === hostKeyFallback));

        this.metadata.set(ws, { 
          sessionId: roomId, 
          clientId: identifier, 
          userId: discordUserId, 
          hostKey: hostKey || hostKeyFallback, 
          clientTimeOffset: 0 
        });

        console.log("[WS HELLO resolved]", {
          sessionId: roomId,
          clientId: identifier,
          discordUserId,
          isHost,
          mode: session.hostKey ? "standalone" : "discord",
          hostKeyFallback: !!session.hostKeyFallback,
        });

        ws.send(JSON.stringify({ 
          type: "HELLO_ACK", 
          isHost,
          serverNow: Date.now(),
        }));
        this.broadcastState();
        return;
      }

      const meta = this.metadata.get(ws);
      if (!meta) return;

      const session = this.getOrCreateSession(meta.sessionId);
      const isHost = this.validateHostAccess(meta.clientId, meta.hostKey);

      // Non-host actions
      if (!isHost) {
        if (msg.type === "VOTE_CAST") {
          const ok = castVote(session, { userId: meta.clientId, optionId: msg.optionId });
          // Use batched broadcast to prevent storms with 10-15 users voting simultaneously
          if (ok) this.batchedBroadcastState();
        } else {
          ws.send(
            JSON.stringify({ type: "ERROR", error: "not_host", attempted: msg.type ?? null }),
          );
        }
        return;
      }

      // Host-only actions
      switch (msg.type) {
        case "AGENDA_ADD":
          if (typeof msg.title === "string") {
            const id = `a${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const durationSec = Number(msg.durationSec) || 0;
            session.agenda.push({
              id,
              title: msg.title,
              durationSec: durationSec,
              notes: msg.notes || "",
            });
            // If first item, make it active and set timer duration
            if (session.agenda.length === 1) {
              session.activeAgendaId = id;
              session.timer.durationSec = durationSec;
              session.timer.updatedAtMs = Date.now();
            }
            this.broadcastState();
          }
          break;
        case "AGENDA_UPDATE":
          {
            const item = session.agenda.find((a) => a.id === msg.agendaId);
            if (item) {
              if (msg.title !== undefined) item.title = msg.title;
              if (msg.durationSec !== undefined) item.durationSec = Number(msg.durationSec) || 0;
              if (msg.notes !== undefined) item.notes = msg.notes;
              this.broadcastState();
            }
          }
          break;
        case "AGENDA_DELETE":
          {
            const idx = session.agenda.findIndex((a) => a.id === msg.agendaId);
            if (idx >= 0) {
              session.agenda.splice(idx, 1);
              if (session.activeAgendaId === msg.agendaId) {
                session.activeAgendaId = session.agenda.length ? session.agenda[0].id : null;
                const serverNowMs = Date.now();
                session.timer.running = false;
                session.timer.endsAtMs = null;
                session.timer.pausedRemainingSec = null;
                session.timer.durationSec = 0;
                session.timer.updatedAtMs = serverNowMs;
              }
              this.broadcastState();
            }
          }
          break;
        case "AGENDA_SET_ACTIVE":
          if (setActiveItem(session, msg.agendaId)) this.broadcastState();
          break;
        case "AGENDA_NEXT":
          if (nextAgendaItem(session)) this.broadcastState();
          break;
        case "AGENDA_PREV":
          if (prevAgendaItem(session)) this.broadcastState();
          break;
        case "TIMER_START":
          timerStart(session);
          this.broadcastState();
          break;
        case "TIMER_PAUSE":
          timerPause(session);
          this.broadcastState();
          break;
        case "TIMER_RESUME":
          timerResume(session);
          this.broadcastState();
          break;
        case "TIMER_RESET":
          timerResetToActiveItem(session);
          this.broadcastState();
          break;
        case "TIMER_EXTEND":
          if (typeof msg.seconds === "number") {
            const serverNowMs = Date.now();
            if (session.timer.running && session.timer.endsAtMs != null) {
              // Extend running timer
              session.timer.endsAtMs += msg.seconds * 1000;
              session.timer.updatedAtMs = serverNowMs;
            } else if (session.timer.pausedRemainingSec !== null) {
              // Extend paused timer
              session.timer.pausedRemainingSec = Math.max(0, session.timer.pausedRemainingSec + msg.seconds);
              session.timer.updatedAtMs = serverNowMs;
            } else {
              // Extend duration for stopped timer
              session.timer.durationSec = Math.max(0, session.timer.durationSec + msg.seconds);
              session.timer.updatedAtMs = serverNowMs;
            }
            this.broadcastState();
          }
          break;
        case "VOTE_OPEN":
          if (
            typeof msg.question === "string" &&
            Array.isArray(msg.options) &&
            msg.options.length >= 2
          ) {
            openVote(session, { question: msg.question, options: msg.options });
            this.broadcastState();
          }
          break;
        case "VOTE_CLOSE":
          closeVote(session);
          this.broadcastState();
          break;
        default:
          break;
      }
    });

    ws.addEventListener("close", (event) => {
      console.log("[WS] closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.sockets.delete(ws);
      this.metadata.delete(ws);
    });

    ws.addEventListener("error", (event) => {
      console.warn("[WS] error", event?.message || String(event));
    });
  }
}
