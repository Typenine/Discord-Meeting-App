// Cloudflare Worker + Durable Object backend for Discord Agenda Activity

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

function createMeetingSession({ sessionId }) {
  return {
    sessionId,
    hostUserId: null,
    agenda: [
      { id: "a1", title: "Opening / Roll Call", minutes: 3 },
      { id: "a2", title: "Rulebook Changes", minutes: 20 },
      { id: "a3", title: "Draft Logistics", minutes: 15 },
      { id: "a4", title: "Votes", minutes: 10 },
    ],
    activeAgendaId: "a1",
    timer: {
      running: false,
      // When running: endsAtMs is authoritative
      endsAtMs: null,
      remainingSec: 3 * 60,
    },
    vote: {
      open: false,
      question: "",
      options: [],
      votesByUserId: {}, // { [userId]: optionIndex }
      closedResults: [], // history
    },
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
    session.timer.remainingSec = Math.max(0, Math.round(item.minutes * 60));
    session.timer.endsAtMs = null;
  }

  return true;
}

function timerStart(session) {
  if (session.timer.running) return;
  session.timer.running = true;
  session.timer.endsAtMs = Date.now() + session.timer.remainingSec * 1000;
}

function timerPause(session) {
  if (!session.timer.running) return;
  const remainingMs = Math.max(0, session.timer.endsAtMs - Date.now());
  session.timer.remainingSec = Math.ceil(remainingMs / 1000);
  session.timer.running = false;
  session.timer.endsAtMs = null;
}

function timerResetToActiveItem(session) {
  const item = getActiveItem(session);
  const sec = item ? Math.max(0, Math.round(item.minutes * 60)) : 0;
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.remainingSec = sec;
}

function tickTimer(session) {
  if (!session.timer.running) return;
  const remainingMs = Math.max(0, session.timer.endsAtMs - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  session.timer.remainingSec = remainingSec;

  if (remainingSec <= 0) {
    session.timer.running = false;
    session.timer.endsAtMs = null;
    session.log.push({ ts: Date.now(), type: "TIMER_DONE", agendaId: session.activeAgendaId });
  }
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
    this.metadata = new Map(); // ws -> { sessionId, userId }
    this.session = null;
    this.timer = null;
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

  getOrCreateSession(sessionId) {
    if (!this.session) {
      const id = sessionId || "default";
      this.session = createMeetingSession({ sessionId: id });
    }
    return this.session;
  }

  startTimerLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.session) return;
      const before = this.session.timer.remainingSec;
      tickTimer(this.session);
      if (this.session.timer.remainingSec !== before) {
        this.broadcastState();
      }
    }, 500);
  }

  stopTimerLoopIfIdle() {
    if (this.sockets.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  broadcastState() {
    if (!this.session) return;
    const payload = JSON.stringify({ type: "STATE", state: snapshot(this.session) });
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

      if (msg && msg.type === "HELLO") {
        console.log("[WS HELLO payload]", JSON.stringify(msg, null, 2));

        let rawUserId = null;
        let userIdSource = null;

        if (msg.userId != null) {
          rawUserId = msg.userId;
          userIdSource = "msg.userId";
        } else if (msg.user && msg.user.id != null) {
          rawUserId = msg.user.id;
          userIdSource = "msg.user.id";
        } else if (msg.user && msg.user.user && msg.user.user.id != null) {
          rawUserId = msg.user.user.id;
          userIdSource = "msg.user.user.id";
        }

        const resolvedUserId = rawUserId != null ? String(rawUserId).trim() : null;
        const sessionId = msg.sessionId || room;

        if (!resolvedUserId || !sessionId) {
          console.warn("[WS HELLO] missing userId or sessionId", { resolvedUserId, userIdSource, sessionId });
          return;
        }

        const allowed = isAllowedHost(resolvedUserId, this.hostConfig);
        const session = this.getOrCreateSession(sessionId);

        if (!session.hostUserId && allowed) {
          session.hostUserId = resolvedUserId;
          session.log.push({ ts: Date.now(), type: "HOST_SET", userId: resolvedUserId });
          console.log("[HOST_SET]", { sessionId, hostUserId: session.hostUserId });
        }

        const isHost = session.hostUserId === resolvedUserId;

        this.metadata.set(ws, { sessionId, userId: resolvedUserId });

        console.log("[WS HELLO resolved]", {
          sessionId,
          userId: resolvedUserId,
          userIdSource,
          isHost,
          hostAllowAll: this.hostConfig.allowAll,
        });

        ws.send(JSON.stringify({ type: "HELLO_ACK", isHost }));
        this.broadcastState();
        this.startTimerLoop();
        return;
      }

      const meta = this.metadata.get(ws);
      if (!meta) return;

      const session = this.getOrCreateSession(meta.sessionId);
      const isHost = session.hostUserId === meta.userId;

      if (!isHost) {
        if (msg.type === "VOTE_CAST") {
          const ok = castVote(session, { userId: meta.userId, optionIndex: msg.optionIndex });
          if (ok) this.broadcastState();
        } else {
          ws.send(
            JSON.stringify({ type: "ERROR", error: "not_host", attempted: msg.type ?? null }),
          );
        }
        return;
      }

      switch (msg.type) {
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
        case "TIMER_RESET":
          timerResetToActiveItem(session);
          this.broadcastState();
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
      this.stopTimerLoopIfIdle();
    });

    ws.addEventListener("error", (event) => {
      console.warn("[WS] error", event?.message || String(event));
    });
  }
}
