import React, { useEffect, useMemo, useRef, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

// Only true when Discord actually launches your Activity
const IN_DISCORD =
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("discordsays.com");

// Raw API base from environment for non-Discord deploys (for example, Vercel)
const RAW_ENV_API_BASE = import.meta.env.VITE_API_BASE;

function normalizeApiBase(base) {
  if (!base) return base;
  return String(base).replace(/\/+$/, "");
}

// 3-mode routing for HTTP API:
// 1) Inside Discord: use Activity proxy (/proxy/api)
// 2) Deployed (non-Discord) with VITE_API_BASE: use that
// 3) Local dev fallback: http://127.0.0.1:8787/api
const API_BASE = (() => {
  if (IN_DISCORD) return "/proxy/api";

  const envBase = RAW_ENV_API_BASE && String(RAW_ENV_API_BASE).trim();
  if (envBase) return normalizeApiBase(envBase);

  return "http://127.0.0.1:8787/api";
})();

function formatMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const [status, setStatus] = useState("booting");
  const [authUser, setAuthUser] = useState(null);
  const [state, setState] = useState(null);

  const wsRef = useRef(null);

  // IMPORTANT:
  // DiscordSDK MUST NOT be constructed outside Discord, or it throws "frame_id query param is not defined"
  const discordSdk = useMemo(() => {
    if (!IN_DISCORD) return null;
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) return null;
    return new DiscordSDK(clientId);
  }, []);

  const sessionId = useMemo(() => {
    const qs = new URLSearchParams(window.location.search);
    return (
      qs.get("channel_id") ||
      qs.get("instance_id") ||
      qs.get("guild_id") ||
      "local-dev"
    );
  }, []);

  // --- 1) Authenticate inside Discord (skip entirely in non-Discord) ---
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!IN_DISCORD) {
          setStatus("local-dev");
          setAuthUser({ id: "local-host", username: "Local Dev" });
          return;
        }

        if (!discordSdk) {
          setStatus("missing_client_id");
          return;
        }

        setStatus("discord_ready");
        await discordSdk.ready();

        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

        const { code } = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });

        const tokenResp = await fetch(`${API_BASE}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const tokenJson = await tokenResp.json();
        if (!tokenResp.ok) throw new Error(JSON.stringify(tokenJson));

        const auth = await discordSdk.commands.authenticate({
          access_token: tokenJson.access_token,
        });

        if (cancelled) return;

        setAuthUser(auth?.user ?? null);
        setStatus("authed");
      } catch (e) {
        console.error(e);
        setStatus("auth_failed");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [discordSdk]);

  const userId = authUser?.id || "local-host";

  // --- 2) Connect to WS and sync state ---
  useEffect(() => {
    if (!userId) return;

    let wsUrl;

    if (IN_DISCORD) {
      wsUrl = `${window.location.origin.replace(
        /^http/,
        "ws"
      )}/proxy/api/ws?room=${encodeURIComponent(sessionId)}`;
    } else {
      // Derive WS base from API_BASE by converting scheme:
      // https:// -> wss://, http:// -> ws://
      let wsBase = API_BASE;
      if (wsBase.startsWith("https://")) {
        wsBase = "wss://" + wsBase.slice("https://".length);
      } else if (wsBase.startsWith("http://")) {
        wsBase = "ws://" + wsBase.slice("http://".length);
      }

      wsUrl = `${wsBase}/ws?room=${encodeURIComponent(sessionId)}`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "HELLO", sessionId, userId }));
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "STATE") setState(msg.state);
      } catch {
        // ignore
      }
    });

    ws.addEventListener("error", (e) => {
      console.error("[ws] error", e);
    });

    ws.addEventListener("close", (e) => {
      console.warn("[ws] closed", e);
    });

    return () => ws.close();
  }, [sessionId, userId]);

  const isHost = !!state?.hostUserId && state.hostUserId === userId;

  function send(msg) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  if (status === "missing_client_id") {
    return (
      <div style={{ padding: 16 }}>
        <h2>Missing VITE_DISCORD_CLIENT_ID</h2>
        <p>
          Create <code>client\.env.local</code> with:
        </p>
        <pre style={{ background: "#111827", padding: 12, borderRadius: 8 }}>
VITE_DISCORD_CLIENT_ID=YOUR_APP_ID
        </pre>
      </div>
    );
  }

  if (status === "auth_failed") {
    return (
      <div style={{ padding: 16 }}>
        <h2>Auth failed</h2>
        <p>
          Most common cause is OAuth Redirect URI mismatch. We’ll fix this once local is working.
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Connecting…</h2>
        <p>Status: {status}</p>
      </div>
    );
  }

  const active = state.agenda.find((a) => a.id === state.activeAgendaId);
  const voteOpen = state.vote.open;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr 420px",
        height: "100vh",
        background: "#0b0d12",
        color: "#e9eefc",
        fontFamily: "system-ui, Segoe UI, Roboto, Arial",
      }}
    >
      {/* Left: Agenda */}
      <div style={{ borderRight: "1px solid #1c2233", padding: 16, overflow: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>League Meeting</div>
        <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 12 }}>
          Session: <code>{state.sessionId}</code>
          <br />
          You: <b>{authUser?.username || "Local Dev"}</b> {isHost ? "(Host)" : ""}
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>Agenda</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.agenda.map((item) => {
            const isActive = item.id === state.activeAgendaId;
            return (
              <button
                key={item.id}
                onClick={() => isHost && send({ type: "AGENDA_SET_ACTIVE", agendaId: item.id })}
                disabled={!isHost}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 10,
                  border: isActive ? "1px solid #5b7cfa" : "1px solid #1c2233",
                  background: isActive ? "#121a33" : "#0f1422",
                  color: "#e9eefc",
                  cursor: isHost ? "pointer" : "default",
                }}
              >
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{item.minutes} min</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Timer + Host controls */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ border: "1px solid #1c2233", borderRadius: 14, padding: 16, background: "#0f1422" }}>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Current Item</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
            {active?.title || "—"}
          </div>

          <div style={{ marginTop: 14, fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>
            {formatMMSS(state.timer.remainingSec)}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => send({ type: "TIMER_START" })}
              disabled={!isHost}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #1c2233",
                background: isHost ? "#1a2a5a" : "#101629",
                color: "#e9eefc",
              }}
            >
              Start
            </button>
            <button
              onClick={() => send({ type: "TIMER_PAUSE" })}
              disabled={!isHost}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #1c2233",
                background: isHost ? "#2a1a5a" : "#101629",
                color: "#e9eefc",
              }}
            >
              Pause
            </button>
            <button
              onClick={() => send({ type: "TIMER_RESET" })}
              disabled={!isHost}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #1c2233",
                background: isHost ? "#3a2a1a" : "#101629",
                color: "#e9eefc",
              }}
            >
              Reset
            </button>
          </div>

          {!isHost && (
            <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
              Host controls are commissioner-only.
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid #1c2233",
            borderRadius: 14,
            padding: 16,
            background: "#0f1422",
            flex: 1,
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Meeting Log</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, opacity: 0.9 }}>
            {state.log
              .slice()
              .reverse()
              .map((e, idx) => (
                <div key={idx}>
                  <code>{new Date(e.ts).toLocaleTimeString()}</code> — {e.type}
                </div>
              ))}
            {state.log.length === 0 && <div style={{ opacity: 0.7 }}>No events yet.</div>}
          </div>
        </div>
      </div>

      {/* Right: Voting */}
      <div style={{ borderLeft: "1px solid #1c2233", padding: 16, overflow: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Voting</div>

        {voteOpen ? (
          <div style={{ border: "1px solid #1c2233", borderRadius: 14, padding: 16, background: "#0f1422" }}>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Open Vote</div>
            <div style={{ fontWeight: 900, marginTop: 6 }}>{state.vote.question}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {state.vote.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => send({ type: "VOTE_CAST", optionIndex: i })}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #1c2233",
                    background: "#101629",
                    color: "#e9eefc",
                    textAlign: "left",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            {isHost && (
              <button
                onClick={() => send({ type: "VOTE_CLOSE" })}
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #1c2233",
                  background: "#5a1a1a",
                  color: "#e9eefc",
                }}
              >
                Close Vote
              </button>
            )}
          </div>
        ) : (
          <HostVoteControls isHost={isHost} send={send} />
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Recent Results</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {state.vote.closedResults
              .slice()
              .reverse()
              .map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #1c2233",
                    borderRadius: 14,
                    padding: 12,
                    background: "#0f1422",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{r.question}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    Total votes: {r.totalVotes}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    {r.options.map((opt, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{opt}</span>
                        <b>{r.tally[i]}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            {state.vote.closedResults.length === 0 && (
              <div style={{ opacity: 0.7, fontSize: 12 }}>No votes yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HostVoteControls({ isHost, send }) {
  const [question, setQuestion] = useState("Approve proposal?");
  const [optionsText, setOptionsText] = useState("Yes\nNo\nTable");

  if (!isHost) {
    return (
      <div style={{ border: "1px solid #1c2233", borderRadius: 14, padding: 16, background: "#0f1422", opacity: 0.9 }}>
        <div style={{ opacity: 0.8, fontSize: 12 }}>No open vote</div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          The host can open votes here. When a vote opens, you’ll get buttons to cast your vote.
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #1c2233", borderRadius: 14, padding: 16, background: "#0f1422" }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>Create Vote (Host)</div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Question</div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #1c2233", background: "#101629", color: "#e9eefc" }}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Options (one per line)</div>
      <textarea
        value={optionsText}
        onChange={(e) => setOptionsText(e.target.value)}
        rows={4}
        style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #1c2233", background: "#101629", color: "#e9eefc", resize: "vertical" }}
      />

      <button
        onClick={() => {
          const options = optionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          if (options.length < 2) return;
          send({ type: "VOTE_OPEN", question, options });
        }}
        style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid #1c2233", background: "#1a5a2a", color: "#e9eefc" }}
      >
        Open Vote
      </button>
    </div>
  );
}
