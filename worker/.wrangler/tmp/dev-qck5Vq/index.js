var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-sPLjJr/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.mjs
function isAllowedOrigin(origin) {
  if (!origin)
    return false;
  if (origin.endsWith(".vercel.app"))
    return true;
  if (origin === "http://localhost:5173")
    return true;
  if (origin === "http://localhost:3000")
    return true;
  if (origin === "http://localhost:8787")
    return true;
  return false;
}
__name(isAllowedOrigin, "isAllowedOrigin");
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin)
    return {};
  if (!isAllowedOrigin(origin))
    return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
__name(getCorsHeaders, "getCorsHeaders");
function withCors(response, request) {
  const corsHeaders = getCorsHeaders(request);
  if (Object.keys(corsHeaders).length === 0)
    return response;
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
__name(withCors, "withCors");
function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
__name(generateRoomId, "generateRoomId");
function generateHostKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
__name(generateHostKey, "generateHostKey");
function parseHostConfig(raw) {
  const parts = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowAll = parts.includes("*");
  const ids = new Set(parts.filter((id) => id !== "*"));
  return { allowAll, ids };
}
__name(parseHostConfig, "parseHostConfig");
function isAllowedHost(userId, hostConfig) {
  if (!userId)
    return false;
  if (!hostConfig)
    return false;
  if (hostConfig.allowAll)
    return true;
  const u = String(userId).trim();
  return hostConfig.ids.has(u);
}
__name(isAllowedHost, "isAllowedHost");
function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(jsonResponse, "jsonResponse");
function createMeetingSession({ sessionId, hostKey = null, hostKeyFallback = null }) {
  return {
    sessionId,
    hostUserId: null,
    hostKey,
    // For standalone room mode (null for Discord Activity mode)
    hostKeyFallback,
    // For Discord Activity mode: optional hostKey for testing without Discord OAuth
    agenda: [],
    activeAgendaId: null,
    timer: {
      running: false,
      endsAtMs: null,
      // Authoritative absolute end time (when running)
      durationSec: 0,
      // Duration for current agenda item
      pausedRemainingSec: null,
      // Remaining seconds when paused
      updatedAtMs: Date.now()
      // Server timestamp of last timer state change
    },
    vote: {
      open: false,
      question: "",
      options: [],
      // Array<{ id, label }>
      votesByClientId: {},
      // { [clientId]: optionId }
      closedResults: []
      // history
    },
    attendance: {},
    // { [userId]: { displayName, joinedAt } }
    log: []
  };
}
__name(createMeetingSession, "createMeetingSession");
function snapshot(session) {
  return JSON.parse(JSON.stringify(session));
}
__name(snapshot, "snapshot");
function getActiveItem(session) {
  return session.agenda.find((a) => a.id === session.activeAgendaId) ?? null;
}
__name(getActiveItem, "getActiveItem");
function setActiveItem(session, agendaId) {
  const exists = session.agenda.some((a) => a.id === agendaId);
  if (!exists)
    return false;
  session.activeAgendaId = agendaId;
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
__name(setActiveItem, "setActiveItem");
function nextAgendaItem(session) {
  if (session.agenda.length === 0)
    return false;
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const nextIndex = (currentIndex + 1) % session.agenda.length;
  const nextItem = session.agenda[nextIndex];
  if (nextItem) {
    return setActiveItem(session, nextItem.id);
  }
  return false;
}
__name(nextAgendaItem, "nextAgendaItem");
function prevAgendaItem(session) {
  if (session.agenda.length === 0)
    return false;
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const prevIndex = currentIndex <= 0 ? session.agenda.length - 1 : currentIndex - 1;
  const prevItem = session.agenda[prevIndex];
  if (prevItem) {
    return setActiveItem(session, prevItem.id);
  }
  return false;
}
__name(prevAgendaItem, "prevAgendaItem");
function timerStart(session) {
  if (session.timer.running)
    return;
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.durationSec * 1e3;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}
__name(timerStart, "timerStart");
function timerPause(session) {
  if (!session.timer.running)
    return;
  const serverNowMs = Date.now();
  const remainingMs = Math.max(0, session.timer.endsAtMs - serverNowMs);
  session.timer.pausedRemainingSec = Math.ceil(remainingMs / 1e3);
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.updatedAtMs = serverNowMs;
}
__name(timerPause, "timerPause");
function timerResume(session) {
  if (session.timer.running)
    return;
  if (session.timer.pausedRemainingSec === null)
    return;
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.pausedRemainingSec * 1e3;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}
__name(timerResume, "timerResume");
function timerResetToActiveItem(session) {
  const item = getActiveItem(session);
  const sec = item ? item.durationSec || 0 : 0;
  const serverNowMs = Date.now();
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.pausedRemainingSec = null;
  session.timer.durationSec = sec;
  session.timer.updatedAtMs = serverNowMs;
}
__name(timerResetToActiveItem, "timerResetToActiveItem");
function openVote(session, { question, options }) {
  session.vote.open = true;
  session.vote.question = question;
  session.vote.options = options.map((opt, idx) => {
    if (typeof opt === "object" && opt.id && opt.label) {
      return opt;
    }
    const label = typeof opt === "string" ? opt : String(opt);
    return { id: `opt${idx + 1}`, label };
  });
  session.vote.votesByClientId = {};
}
__name(openVote, "openVote");
function castVote(session, { userId, optionId }) {
  if (!session.vote.open)
    return false;
  const optionExists = session.vote.options.some((opt) => opt.id === optionId);
  if (!optionExists)
    return false;
  session.vote.votesByClientId[userId] = optionId;
  return true;
}
__name(castVote, "castVote");
function closeVote(session) {
  if (!session.vote.open)
    return null;
  const tally = {};
  session.vote.options.forEach((opt) => {
    tally[opt.id] = 0;
  });
  for (const optionId of Object.values(session.vote.votesByClientId)) {
    if (tally[optionId] !== void 0) {
      tally[optionId] += 1;
    }
  }
  const result = {
    ts: Date.now(),
    agendaId: session.activeAgendaId,
    question: session.vote.question,
    options: session.vote.options,
    // Keep structured options
    tally,
    // { [optionId]: count }
    totalVotes: Object.keys(session.vote.votesByClientId).length
  };
  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = "";
  session.vote.options = [];
  session.vote.votesByClientId = {};
  session.log.push({ ts: Date.now(), type: "VOTE_CLOSED", result });
  return result;
}
__name(closeVote, "closeVote");
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
    redirect_uri: redirectUri
  });
  try {
    const discordResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
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
      const resp2 = jsonResponse({ access_token: data.access_token }, 200);
      console.log("[/api/token] response", { path: url.pathname, status: 200 });
      return resp2;
    }
    console.warn("[/api/token] failure", { status, data });
    const errorStatus = discordResp.status === 400 ? 400 : 502;
    const resp = jsonResponse(
      {
        error: "token_exchange_failed",
        details: { status: discordResp.status, body: data }
      },
      errorStatus
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
__name(handleToken, "handleToken");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "Content-Length": "0"
          }
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
          hostIdsCount: hostConfig.ids.size
        }),
        request
      );
    }
    if (pathname === "/api/token" && request.method === "POST") {
      const response = await handleToken(request, env);
      return withCors(response, request);
    }
    if (pathname === "/api/room/create" && request.method === "POST") {
      const roomId = generateRoomId();
      const hostKey = generateHostKey();
      return withCors(
        jsonResponse({
          roomId,
          hostKey,
          viewerUrl: `${url.origin}/?room=${roomId}`,
          hostUrl: `${url.origin}/?room=${roomId}&hostKey=${hostKey}`
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
          ["X-Room-Id", room]
        ])
      });
      return stub.fetch(wsRequest);
    }
    return withCors(
      jsonResponse({ error: "not_found", path: pathname }, 404),
      request
    );
  }
};
var MeetingRoom = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = /* @__PURE__ */ new Set();
    this.metadata = /* @__PURE__ */ new Map();
    this.session = null;
    this.hostConfig = parseHostConfig(env.HOST_USER_IDS);
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
    if (!this.session)
      return false;
    if (this.session.hostKey) {
      return providedHostKey === this.session.hostKey;
    }
    if (this.session.hostUserId === clientId) {
      return true;
    }
    if (providedHostKey && this.session.hostKeyFallback) {
      return providedHostKey === this.session.hostKeyFallback;
    }
    return false;
  }
  // Timer loop removed - no server-side ticking needed
  // Clients render countdown locally using endsAtMs and serverOffset
  broadcastState() {
    if (!this.session)
      return;
    const state = snapshot(this.session);
    const safeState = { ...state };
    delete safeState.hostKey;
    const payload = JSON.stringify({
      type: "STATE",
      state: safeState,
      serverNow: Date.now()
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
    if (this.voteBatchTimer) {
      clearTimeout(this.voteBatchTimer);
    }
    this.voteBatchPending = true;
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
      if (msg && msg.type === "TIME_PING") {
        const serverNow = Date.now();
        ws.send(JSON.stringify({
          type: "TIME_PONG",
          clientSentAt: msg.clientSentAt,
          serverNow
        }));
        return;
      }
      if (msg && msg.type === "HELLO") {
        console.log("[WS HELLO payload]", JSON.stringify(msg, null, 2));
        let clientId = msg.clientId;
        let hostKey = msg.hostKey || null;
        let displayName = msg.displayName || msg.username || "Guest";
        let roomId = msg.roomId || msg.sessionId || room;
        let discordUserId = null;
        if (msg.userId != null) {
          discordUserId = msg.userId;
        } else if (msg.user && msg.user.id != null) {
          discordUserId = msg.user.id;
        } else if (msg.user && msg.user.user && msg.user.user.id != null) {
          discordUserId = msg.user.user.id;
        }
        const identifier = clientId || discordUserId;
        if (!identifier || !roomId) {
          console.warn("[WS HELLO] missing clientId/userId or roomId", { clientId, discordUserId, roomId });
          return;
        }
        const allowed = discordUserId ? isAllowedHost(discordUserId, this.hostConfig) : false;
        const hostKeyFallback = !hostKey && msg.hostKey ? msg.hostKey : null;
        const session2 = this.getOrCreateSession(roomId, hostKey, hostKeyFallback);
        if (!session2.hostUserId) {
          if (session2.hostKey) {
            if (hostKey === session2.hostKey) {
              session2.hostUserId = identifier;
              session2.log.push({ ts: Date.now(), type: "HOST_SET", clientId: identifier, mode: "standalone" });
              console.log("[HOST_SET] standalone mode", { sessionId: roomId, hostUserId: session2.hostUserId });
            }
          } else if (allowed && discordUserId) {
            session2.hostUserId = discordUserId;
            session2.log.push({ ts: Date.now(), type: "HOST_SET", userId: discordUserId, mode: "discord_allowlist" });
            console.log("[HOST_SET] discord mode via allowlist", { sessionId: roomId, hostUserId: session2.hostUserId });
          } else if (!allowed && hostKeyFallback) {
            if (!session2.hostKeyFallback) {
              session2.hostKeyFallback = hostKeyFallback;
              session2.hostUserId = identifier;
              session2.log.push({ ts: Date.now(), type: "HOST_SET", clientId: identifier, mode: "discord_hostkey_fallback" });
              console.log("[HOST_SET] discord mode via hostKey fallback", { sessionId: roomId, hostUserId: session2.hostUserId });
            }
          }
        }
        if (!session2.attendance[identifier]) {
          session2.attendance[identifier] = {
            clientId: identifier,
            userId: discordUserId,
            // Keep discordUserId for backward compatibility
            displayName,
            joinedAt: Date.now()
          };
        }
        const isHost2 = session2.hostKey ? hostKey === session2.hostKey : session2.hostUserId === identifier || hostKeyFallback && session2.hostKeyFallback === hostKeyFallback;
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
          isHost: isHost2,
          mode: session2.hostKey ? "standalone" : "discord",
          hostKeyFallback: !!session2.hostKeyFallback
        });
        ws.send(JSON.stringify({
          type: "HELLO_ACK",
          isHost: isHost2,
          serverNow: Date.now()
        }));
        this.broadcastState();
        return;
      }
      const meta = this.metadata.get(ws);
      if (!meta)
        return;
      const session = this.getOrCreateSession(meta.sessionId);
      const isHost = this.validateHostAccess(meta.clientId, meta.hostKey);
      if (!isHost) {
        if (msg.type === "VOTE_CAST") {
          const ok = castVote(session, { userId: meta.clientId, optionId: msg.optionId });
          if (ok)
            this.batchedBroadcastState();
        } else {
          ws.send(
            JSON.stringify({ type: "ERROR", error: "not_host", attempted: msg.type ?? null })
          );
        }
        return;
      }
      switch (msg.type) {
        case "AGENDA_ADD":
          if (typeof msg.title === "string") {
            const id = `a${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const durationSec = Number(msg.durationSec) || 0;
            session.agenda.push({
              id,
              title: msg.title,
              durationSec,
              notes: msg.notes || ""
            });
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
              if (msg.title !== void 0)
                item.title = msg.title;
              if (msg.durationSec !== void 0)
                item.durationSec = Number(msg.durationSec) || 0;
              if (msg.notes !== void 0)
                item.notes = msg.notes;
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
          if (setActiveItem(session, msg.agendaId))
            this.broadcastState();
          break;
        case "AGENDA_NEXT":
          if (nextAgendaItem(session))
            this.broadcastState();
          break;
        case "AGENDA_PREV":
          if (prevAgendaItem(session))
            this.broadcastState();
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
              session.timer.endsAtMs += msg.seconds * 1e3;
              session.timer.updatedAtMs = serverNowMs;
            } else if (session.timer.pausedRemainingSec !== null) {
              session.timer.pausedRemainingSec = Math.max(0, session.timer.pausedRemainingSec + msg.seconds);
              session.timer.updatedAtMs = serverNowMs;
            } else {
              session.timer.durationSec = Math.max(0, session.timer.durationSec + msg.seconds);
              session.timer.updatedAtMs = serverNowMs;
            }
            this.broadcastState();
          }
          break;
        case "VOTE_OPEN":
          if (typeof msg.question === "string" && Array.isArray(msg.options) && msg.options.length >= 2) {
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
        wasClean: event.wasClean
      });
      this.sockets.delete(ws);
      this.metadata.delete(ws);
    });
    ws.addEventListener("error", (event) => {
      console.warn("[WS] error", event?.message || String(event));
    });
  }
};
__name(MeetingRoom, "MeetingRoom");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-sPLjJr/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-sPLjJr/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MeetingRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
