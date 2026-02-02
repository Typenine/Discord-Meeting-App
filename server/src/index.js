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
import { WebSocketServer } from "ws";
import {
  createMeetingSession,
  snapshot,
  tickTimer,
  setActiveItem,
  timerStart,
  timerPause,
  timerResetToActiveItem,
  openVote,
  castVote,
  closeVote,
} from "./meeting.js";

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
const server = app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/ws" });

const sessions = new Map(); // sessionId -> session
const wsClients = new Map(); // ws -> { sessionId, userId }

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, createMeetingSession({ sessionId }));
  return sessions.get(sessionId);
}

function broadcast(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const payload = JSON.stringify({ type: "STATE", state: snapshot(session) });

  for (const [ws, meta] of wsClients.entries()) {
    if (meta.sessionId === sessionId && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "HELLO") {
      const { sessionId, userId } = msg;
      if (!sessionId || !userId) return;

      wsClients.set(ws, { sessionId, userId: String(userId) });

      const session = getOrCreateSession(sessionId);
      const allowed = isAllowedHost(userId);

      console.log("[HELLO]", { sessionId, userId: String(userId), allowed, hostAllowAll: HOST_ALLOW_ALL });

      if (!session.hostUserId && allowed) {
        session.hostUserId = String(userId);
        session.log.push({ ts: Date.now(), type: "HOST_SET", userId: String(userId) });
        console.log("[HOST_SET]", { sessionId, hostUserId: session.hostUserId });
      }

      ws.send(JSON.stringify({ type: "STATE", state: snapshot(session) }));
      return;
    }

    const meta = wsClients.get(ws);
    if (!meta) return;

    const session = getOrCreateSession(meta.sessionId);
    const isHost = session.hostUserId === meta.userId;

    if (!isHost) {
      if (msg.type === "VOTE_CAST") {
        const ok = castVote(session, { userId: meta.userId, optionIndex: msg.optionIndex });
        if (ok) broadcast(meta.sessionId);
      }
      return;
    }

    switch (msg.type) {
      case "AGENDA_SET_ACTIVE":
        if (setActiveItem(session, msg.agendaId)) broadcast(meta.sessionId);
        break;
      case "TIMER_START":
        timerStart(session);
        broadcast(meta.sessionId);
        break;
      case "TIMER_PAUSE":
        timerPause(session);
        broadcast(meta.sessionId);
        break;
      case "TIMER_RESET":
        timerResetToActiveItem(session);
        broadcast(meta.sessionId);
        break;
      case "VOTE_OPEN":
        if (typeof msg.question === "string" && Array.isArray(msg.options) && msg.options.length >= 2) {
          openVote(session, { question: msg.question, options: msg.options });
          broadcast(meta.sessionId);
        }
        break;
      case "VOTE_CLOSE":
        closeVote(session);
        broadcast(meta.sessionId);
        break;
      default:
        break;
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
  });
});

setInterval(() => {
  for (const [sessionId, session] of sessions.entries()) {
    const before = session.timer.remainingSec;
    tickTimer(session);
    if (session.timer.remainingSec !== before) broadcast(sessionId);
  }
}, 500);
