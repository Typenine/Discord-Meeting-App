// Cloudflare Worker + Durable Object backend for Discord Agenda Activity
// Supports both Discord Activity mode and standalone room + hostKey mode

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

function createMeetingSession({ sessionId, hostKey = null }) {
  return {
    sessionId,
    hostUserId: null,
    hostKey, // For standalone room mode (null for Discord Activity mode)
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
      options: [],
      votesByUserId: {}, // { [userId]: optionIndex }
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

  const item = getActiveItem(session);
  if (!session.timer.running && item) {
    // When switching items, set the duration for the new item
    session.timer.durationSec = item.durationSec || 0;
    session.timer.pausedRemainingSec = null;
    session.timer.endsAtMs = null;
    session.timer.updatedAtMs = Date.now();
  }

  return true;
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
  session.vote.options = options;
  session.vote.votesByUserId = {};
}

function castVote(session, { userId, optionIndex }) {
  if (!session.vote.open) return false;
  if (optionIndex < 0 || optionIndex >= session.vote.options.length) return false;
  session.vote.votesByUserId[userId] = optionIndex;
  return true;
}

function closeVote(session) {
  if (!session.vote.open) return null;

  const tally = new Array(session.vote.options.length).fill(0);
  for (const idx of Object.values(session.vote.votesByUserId)) {
    tally[idx] += 1;
  }

  const result = {
    ts: Date.now(),
    agendaId: session.activeAgendaId,
    question: session.vote.question,
    options: session.vote.options,
    tally,
    totalVotes: Object.keys(session.vote.votesByUserId).length,
  };

  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = "";
  session.vote.options = [];
  session.vote.votesByUserId = {};

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

    if (pathname === "/health" || pathname === "/api/health") {
      const hostConfig = parseHostConfig(env.HOST_USER_IDS);
      return jsonResponse({
        ok: true,
        clientId: env.DISCORD_CLIENT_ID || null,
        redirectUri: env.DISCORD_REDIRECT_URI || null,
        hostAllowAll: hostConfig.allowAll,
        hostIdsCount: hostConfig.ids.size,
      });
    }

    if (pathname === "/api/token" && request.method === "POST") {
      return handleToken(request, env);
    }

    // Create new standalone room
    if (pathname === "/api/room/create" && request.method === "POST") {
      const roomId = generateRoomId();
      const hostKey = generateHostKey();
      
      return jsonResponse({
        roomId,
        hostKey,
        viewerUrl: `${url.origin}/?room=${roomId}`,
        hostUrl: `${url.origin}/?room=${roomId}&hostKey=${hostKey}`,
      });
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

    return jsonResponse({ error: "not_found", path: pathname }, 404);
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

  getOrCreateSession(sessionId, hostKey = null) {
    if (!this.session) {
      const id = sessionId || "default";
      this.session = createMeetingSession({ sessionId: id, hostKey });
    }
    return this.session;
  }

  // Validate host access: either Discord Activity mode (userId check) or standalone mode (hostKey check)
  validateHostAccess(clientId, providedHostKey) {
    if (!this.session) return false;
    
    // Standalone room mode: check hostKey
    if (this.session.hostKey) {
      return providedHostKey === this.session.hostKey;
    }
    
    // Discord Activity mode: check userId/clientId
    return this.session.hostUserId === clientId;
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
        let displayName = msg.displayName || msg.username || "Guest";
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

        // For Discord Activity mode, check if user is allowed to be host
        const allowed = discordUserId ? isAllowedHost(discordUserId, this.hostConfig) : false;
        const session = this.getOrCreateSession(roomId, hostKey);

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
            // Discord Activity mode: host is first allowed user
            session.hostUserId = discordUserId;
            session.log.push({ ts: Date.now(), type: "HOST_SET", userId: discordUserId, mode: "discord" });
            console.log("[HOST_SET] discord mode", { sessionId: roomId, hostUserId: session.hostUserId });
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

        const isHost = session.hostKey 
          ? (hostKey === session.hostKey)
          : (session.hostUserId === identifier);

        this.metadata.set(ws, { sessionId: roomId, clientId: identifier, userId: discordUserId, hostKey, clientTimeOffset: 0 });

        console.log("[WS HELLO resolved]", {
          sessionId: roomId,
          clientId: identifier,
          discordUserId,
          isHost,
          mode: session.hostKey ? "standalone" : "discord",
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
          const ok = castVote(session, { userId: meta.clientId, optionIndex: msg.optionIndex });
          if (ok) this.broadcastState();
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
