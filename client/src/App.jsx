import React, { useState, useEffect } from "react";
import BrandHeader from "./components/BrandHeader.jsx";

// Determine API base for HTTP polling.
const IN_DISCORD = typeof window !== "undefined" && window.location.hostname.endsWith("discordsays.com");
const RAW_ENV_API_BASE = import.meta.env.VITE_API_BASE;
const RAW_ENV_WORKER_DOMAIN = import.meta.env.VITE_WORKER_DOMAIN;

// Startup configuration logging
console.log("=== App.jsx Configuration ===");
console.log("CONFIG VITE_API_BASE=" + (RAW_ENV_API_BASE || "(not set)"));
console.log("CONFIG VITE_WORKER_DOMAIN=" + (RAW_ENV_WORKER_DOMAIN || "(not set)"));

function validateUrl(url, source) {
  if (!url) return url;
  const urlStr = String(url);
  // Check for asterisks (both raw and URL-encoded)
  if (urlStr.includes("*") || urlStr.includes("%2A")) {
    throw new Error(`Invalid Worker domain; remove placeholder. (Source: ${source}, Value: ${urlStr})`);
  }
  return urlStr;
}

const API_BASE = (() => {
  // Discord Activity mode: use proxy path
  if (IN_DISCORD) return "/proxy/api";
  
  // Option 1: Check for explicit VITE_API_BASE configuration
  const envBase = RAW_ENV_API_BASE && String(RAW_ENV_API_BASE).trim();
  if (envBase) {
    // Use VITE_API_BASE exactly as provided, no string replacements or domain manipulation
    const validated = validateUrl(envBase, "VITE_API_BASE");
    // Ensure it ends with /api (add it only if missing)
    let apiBase = validated;
    if (!apiBase.endsWith("/api")) {
      apiBase = apiBase + "/api";
    }
    console.log("CONFIG Final apiBase=" + apiBase);
    return apiBase;
  }
  
  // Option 2: Fall back to VITE_WORKER_DOMAIN only if VITE_API_BASE is missing
  const workerDomain = RAW_ENV_WORKER_DOMAIN && String(RAW_ENV_WORKER_DOMAIN).trim();
  if (workerDomain) {
    // VITE_WORKER_DOMAIN must be a full host like xxx.workers.dev (not xxx.workers)
    const validated = validateUrl(workerDomain, "VITE_WORKER_DOMAIN");
    if (!validated.endsWith(".workers.dev")) {
      const errorMsg = `VITE_WORKER_DOMAIN must end with .workers.dev (got: ${validated})`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    const apiBase = `https://${validated}/api`;
    console.log("CONFIG Final apiBase=" + apiBase);
    return apiBase;
  }
  
  // In development, fall back to localhost
  if (import.meta.env.DEV) {
    const devBase = "http://localhost:8787/api";
    console.log("CONFIG Final apiBase=" + devBase);
    return devBase;
  }
  
  // Production without configuration: fail with clear error
  console.error(
    "Production deployment requires VITE_API_BASE or VITE_WORKER_DOMAIN environment variable. " +
    "Set VITE_WORKER_DOMAIN to your Cloudflare Worker domain (e.g., your-worker.workers.dev) " +
    "or VITE_API_BASE to the full API URL (e.g., https://your-worker.workers.dev/api)"
  );
  return null; // Will cause fetch to fail with clear error
})();

export default function App() {
  // Persist a random userId in localStorage so the same browser retains identity.
  const [userId] = useState(() => {
    let id = null;
    if (typeof window !== "undefined") {
      id = localStorage.getItem("userId");
      if (!id) {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          id = crypto.randomUUID();
        } else {
          id = String(Math.random()).slice(2);
        }
        localStorage.setItem("userId", id);
      }
    }
    return id || String(Math.random()).slice(2);
  });
  
  // Track last active session for auto-rejoin
  const [lastSession, setLastSession] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("lastActiveSession");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });
  
  const [showRejoinPrompt, setShowRejoinPrompt] = useState(false);
  const [username, setUsername] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(null);
  const [status, setStatus] = useState("init"); // 'init', 'joined', 'ended'
  const [healthStatus, setHealthStatus] = useState(null);
  const [error, setError] = useState(null);
  const isHost = state && state.hostUserId === String(userId);

  // Check for rejoin opportunity on mount
  useEffect(() => {
    if (lastSession && status === "init" && !sessionId) {
      // Check if the session is still active
      const checkSession = async () => {
        try {
          const res = await fetch(`${API_BASE}/session/${lastSession.sessionId}/state?userId=${userId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.state && data.state.status === 'active') {
              setShowRejoinPrompt(true);
            } else {
              // Session ended, clear localStorage
              localStorage.removeItem("lastActiveSession");
              setLastSession(null);
            }
          } else {
            // Session not found, clear localStorage
            localStorage.removeItem("lastActiveSession");
            setLastSession(null);
          }
        } catch (err) {
          console.error('Failed to check last session:', err);
        }
      };
      checkSession();
    }
  }, [lastSession, status, sessionId, userId]);

  // Poll health status on mount and periodically during meetings
  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Health endpoint is at root level, not under /api
        const healthUrl = IN_DISCORD ? '/proxy/health' : '/health';
        const res = await fetch(healthUrl);
        const data = await res.json();
        setHealthStatus(data);
        
        // Show warning if health check fails
        if (!data.ok && status === "joined") {
          console.warn('[Health Check] System health degraded:', data.warnings);
        }
      } catch (err) {
        console.error('Health check failed:', err);
      }
    };
    
    checkHealth();
    
    // Re-check health every 30 seconds during active meetings
    let interval;
    if (status === "joined") {
      interval = setInterval(checkHealth, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  // Polling effect: fetch session state every second
  useEffect(() => {
    if (status !== "joined" || !sessionId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const params = new URLSearchParams();
        if (revision != null) params.set("sinceRevision", revision);
        params.set("userId", userId);
        const res = await fetch(`${API_BASE}/session/${sessionId}/state?${params.toString()}`);
        const data = await res.json();
        if (!stopped) {
          if (!data.unchanged) {
            if (data.state) setState(data.state);
            if (data.revision != null) setRevision(data.revision);
          } else {
            if (data.revision != null) setRevision(data.revision);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    const interval = setInterval(poll, 1000);
    poll();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [status, sessionId, revision, userId]);

  // Update document title dynamically (note: App.jsx doesn't have timer support like StandaloneApp)
  useEffect(() => {
    // Just set default title for now - full timer support would need more state
    document.title = "East v. West League Meeting";
  }, []);

  const startMeeting = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, username }),
      });
      const data = await res.json();
      
      if (res.status === 403 && data.error === 'unauthorized_host') {
        setError({ 
          type: 'unauthorized', 
          message: 'You are not authorized to host meetings. Please contact an administrator.' 
        });
        return;
      }
      
      if (!res.ok) {
        setError({ type: 'error', message: data.error || 'Failed to start meeting' });
        return;
      }
      
      if (data.sessionId) {
        setSessionId(data.sessionId);
        setState(data.state);
        setRevision(data.revision);
        setStatus("joined");
        
        // Save to localStorage for auto-rejoin
        const sessionInfo = {
          sessionId: data.sessionId,
          joinedAt: Date.now(),
          isHost: true,
        };
        localStorage.setItem("lastActiveSession", JSON.stringify(sessionInfo));
        setLastSession(sessionInfo);
        setShowRejoinPrompt(false);
      }
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please try again.' });
    }
  };

  const joinMeeting = async (id) => {
    const targetId = id || sessionInput.trim();
    if (!targetId) return;
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/session/${targetId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, username }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError({ type: 'error', message: data.error === 'not_found' ? 'Meeting not found' : 'Failed to join meeting' });
        return;
      }
      
      if (data.state) {
        setSessionId(targetId);
        setState(data.state);
        setRevision(data.revision);
        setStatus("joined");
        
        // Save to localStorage for auto-rejoin
        const sessionInfo = {
          sessionId: targetId,
          joinedAt: Date.now(),
          isHost: data.state.hostUserId === String(userId),
        };
        localStorage.setItem("lastActiveSession", JSON.stringify(sessionInfo));
        setLastSession(sessionInfo);
        setShowRejoinPrompt(false);
      }
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please try again.' });
    }
  };
  
  const handleRejoin = () => {
    if (lastSession) {
      joinMeeting(lastSession.sessionId);
    }
  };
  
  const dismissRejoin = () => {
    setShowRejoinPrompt(false);
    localStorage.removeItem("lastActiveSession");
    setLastSession(null);
  };

  // Helper functions for HTTP actions with error handling
  const post = async (path, body) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 403) {
          setError({ 
            type: 'forbidden', 
            message: 'Host access required for this operation. You may have lost host privileges.' 
          });
        } else {
          setError({ type: 'error', message: data.error || 'Operation failed' });
        }
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please check your connection.' });
      return null;
    }
  };

  const put = async (path, body) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 403) {
          setError({ 
            type: 'forbidden', 
            message: 'Host access required for this operation.' 
          });
        } else {
          setError({ type: 'error', message: data.error || 'Operation failed' });
        }
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please check your connection.' });
      return null;
    }
  };

  const del = async (path, body) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 403) {
          setError({ 
            type: 'forbidden', 
            message: 'Host access required for this operation.' 
          });
        } else {
          setError({ type: 'error', message: data.error || 'Operation failed' });
        }
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please check your connection.' });
      return null;
    }
  };

  // Agenda operations
  const addAgenda = async (title, durationSec) => {
    const data = await post(`/session/${sessionId}/agenda`, { userId, title, durationSec });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  const deleteAgendaItem = async (agendaId) => {
    const data = await del(`/session/${sessionId}/agenda/${agendaId}`, { userId });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  const setActiveAgenda = async (agendaId) => {
    const data = await post(`/session/${sessionId}/agenda/${agendaId}/active`, { userId });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  // Timer controls
  const startTimer = async () => {
    const data = await post(`/session/${sessionId}/timer/start`, { userId });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };
  const pauseTimer = async () => {
    const data = await post(`/session/${sessionId}/timer/pause`, { userId });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };
  const extendTimer = async (seconds) => {
    const data = await post(`/session/${sessionId}/timer/extend`, { userId, seconds });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  // Voting
  const openVote = async (question, options) => {
    const data = await post(`/session/${sessionId}/vote/open`, { userId, question, options });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };
  const castVote = async (optionIndex) => {
    const data = await post(`/session/${sessionId}/vote/cast`, { userId, optionIndex });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };
  const closeVote = async () => {
    const data = await post(`/session/${sessionId}/vote/close`, { userId });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  // End meeting
  const endMeeting = async () => {
    const data = await post(`/session/${sessionId}/end`, { userId });
    if (data && data.minutes) {
      setStatus("ended");
      // Clear last session from localStorage
      localStorage.removeItem("lastActiveSession");
      setLastSession(null);
    }
  };

  // Local form states
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaDuration, setNewAgendaDuration] = useState("");
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      {/* Health Status Banner */}
      {healthStatus && healthStatus.warnings && healthStatus.warnings.length > 0 && (
        <div style={{ 
          padding: "0.75rem", 
          marginBottom: "1rem", 
          backgroundColor: "#fff3cd", 
          border: "1px solid #ffc107", 
          borderRadius: "4px",
          color: "#856404"
        }}>
          <strong>⚠️ System Warnings:</strong>
          <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.5rem" }}>
            {healthStatus.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      
      {/* Auto-rejoin Prompt */}
      {showRejoinPrompt && lastSession && status === "init" && (
        <div style={{ 
          padding: "1rem", 
          marginBottom: "1rem", 
          backgroundColor: "#d1ecf1", 
          border: "1px solid #0c5460", 
          borderRadius: "4px",
          color: "#0c5460"
        }}>
          <strong>🔄 Resume Meeting?</strong>
          <p style={{ margin: "0.5rem 0" }}>
            You were in a meeting. Would you like to rejoin?
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={handleRejoin} style={{ 
              padding: "0.5rem 1rem", 
              backgroundColor: "#0c5460", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: "pointer"
            }}>
              Rejoin Meeting
            </button>
            <button onClick={dismissRejoin} style={{ 
              padding: "0.5rem 1rem", 
              backgroundColor: "transparent", 
              color: "#0c5460", 
              border: "1px solid #0c5460", 
              borderRadius: "4px",
              cursor: "pointer"
            }}>
              Start Fresh
            </button>
          </div>
        </div>
      )}
      
      {/* Error Banner */}
      {error && (
        <div style={{ 
          padding: "0.75rem", 
          marginBottom: "1rem", 
          backgroundColor: error.type === 'unauthorized' ? "#f8d7da" : "#f8d7da", 
          border: "1px solid #dc3545", 
          borderRadius: "4px",
          color: "#721c24"
        }}>
          <strong>{error.type === 'unauthorized' ? '🔒 Authorization Error' : '❌ Error'}:</strong> {error.message}
          <button 
            onClick={() => setError(null)} 
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem" }}
          >×</button>
        </div>
      )}
      
      {/* Mode and Identity Indicator (shown when in meeting) */}
      {status === "joined" && state && (
        <div style={{
          padding: "0.5rem 1rem",
          marginBottom: "1rem",
          backgroundColor: "#f0e6ff",
          border: "1px solid #7c3aed",
          borderRadius: "4px",
          fontSize: "0.85rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <span style={{ fontWeight: "bold", color: "#7c3aed" }}>Mode: Discord Activity</span>
            {" | "}
            <span style={{ color: "#555" }}>
              Role: {state.hostUserId === userId ? "🔑 Host" : "👥 Viewer"}
            </span>
          </div>
          <div style={{ color: "#666", fontSize: "0.75rem" }}>
            ID: {userId ? (userId.length > 20 ? userId.substring(0, 20) + "..." : userId) : "unknown"}
          </div>
        </div>
      )}
      
      {status === "init" && (
        <div className="homeContainer">
          <BrandHeader />
          <h2 style={{ 
            margin: "var(--spacing-2xl) 0 0 0",
            color: "var(--color-muted)",
            fontWeight: "normal",
            textAlign: "center"
          }}>
            Join or Create Meeting
          </h2>
          
          <div className="homeCards">
            {/* Card 1: Create Meeting */}
            <div className="card">
              <div className="cardHeader">
                <h3>Create New Meeting</h3>
              </div>
              <div className="cardBody">
                <label className="label">Your Name</label>
                <input 
                  className="input"
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="Enter your name"
                />
                <button 
                  className="btn btnPrimary btnLarge btnFull"
                  style={{ marginTop: "var(--spacing-xl)" }}
                  onClick={startMeeting} 
                  disabled={!username}
                >
                  Start New Meeting
                </button>
              </div>
            </div>
            
            {/* Card 2: Join Meeting */}
            <div className="card">
              <div className="cardHeader">
                <h3>Join Existing Meeting</h3>
              </div>
              <div className="cardBody">
                <label className="label">Your Name</label>
                <input 
                  className="input"
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="Enter your name"
                  style={{ marginBottom: "var(--spacing-lg)" }}
                />
                <label className="label">Meeting ID</label>
                <input 
                  className="input"
                  value={sessionInput} 
                  onChange={(e) => setSessionInput(e.target.value)}
                  placeholder="Enter meeting ID"
                />
                <button 
                  className="btn btnAccent btnLarge btnFull"
                  style={{ marginTop: "var(--spacing-xl)" }}
                  onClick={joinMeeting} 
                  disabled={!username || !sessionInput}
                >
                  Join Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {status === "joined" && state && (
        <div>
          {/* Channel Context Header */}
          {(state.channelId || state.guildId) && (
            <div style={{ 
              padding: "0.75rem", 
              marginBottom: "1rem", 
              backgroundColor: "#5865F2", 
              color: "white", 
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}>
              <span style={{ fontSize: "1.2rem" }}>💬</span>
              <div>
                {state.channelId && <div style={{ fontWeight: "bold" }}>Channel: #{state.channelId}</div>}
                {state.guildId && <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>Server: {state.guildId}</div>}
              </div>
            </div>
          )}
          
          {/* Connection & Host Status Bar */}
          <div style={{ 
            padding: "0.5rem 0.75rem", 
            marginBottom: "1rem", 
            backgroundColor: "#e7f3ff", 
            border: "1px solid #0066cc", 
            borderRadius: "4px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <strong>Meeting ID:</strong> {sessionId}
            </div>
            <div>
              {isHost ? (
                <span style={{ 
                  padding: "0.25rem 0.5rem", 
                  backgroundColor: "#28a745", 
                  color: "white", 
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  fontWeight: "bold"
                }}>
                  ✓ HOST ACCESS
                </span>
              ) : (
                <span style={{ 
                  padding: "0.25rem 0.5rem", 
                  backgroundColor: "#6c757d", 
                  color: "white", 
                  borderRadius: "4px",
                  fontSize: "0.85rem"
                }}>
                  ATTENDEE
                </span>
              )}
            </div>
          </div>
          
          {/* System Health Panel for Hosts */}
          {isHost && healthStatus && (
            <details style={{ 
              marginBottom: "1rem", 
              padding: "0.75rem",
              backgroundColor: "#f8f9fa",
              border: "1px solid #dee2e6",
              borderRadius: "4px"
            }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "0.5rem" }}>
                📊 System Diagnostics {healthStatus.ok ? "✅" : "⚠️"}
              </summary>
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Configuration:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>
                    <li>Client ID: {healthStatus.config?.clientId ? "✓ Configured" : "❌ Missing"}</li>
                    <li>Client Secret: {healthStatus.config?.secretConfigured ? "✓ Configured" : "❌ Missing"}</li>
                    <li>Redirect URI: {healthStatus.config?.redirectUri ? "✓ Configured" : "❌ Missing"}</li>
                  </ul>
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Host Authorization:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>
                    <li>Allow All: {healthStatus.hostAuth?.allowAll ? "Yes" : "No"}</li>
                    <li>Authorized Hosts: {healthStatus.hostAuth?.hostIdsCount || 0}</li>
                  </ul>
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Persistence:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>
                    <li>Total Saves: {healthStatus.store?.persistence?.totalSaves || 0}</li>
                    <li>Total Failures: {healthStatus.store?.persistence?.totalFailures || 0}</li>
                    <li>Consecutive Failures: {healthStatus.store?.persistence?.consecutiveFailures || 0}</li>
                    <li>Data Directory: {healthStatus.store?.persistence?.dataDirWritable ? "✓ Writable" : "⚠️ Not Writable"}</li>
                  </ul>
                </div>
                <div>
                  <strong>Sessions:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>
                    <li>Active: {healthStatus.store?.sessions?.active || 0}</li>
                    <li>Ended: {healthStatus.store?.sessions?.ended || 0}</li>
                    <li>Total: {healthStatus.store?.sessions?.total || 0}</li>
                  </ul>
                </div>
              </div>
            </details>
          )}
          
          <h2>Meeting Controls</h2>
          <p>You are <strong>{username}</strong> {isHost && "(with host privileges)"}</p>
          <h3>Attendance</h3>
          <ul>
            {Object.values(state.attendance || {}).map((att) => (
              <li key={att.userId}>{att.displayName || att.userId}</li>
            ))}
          </ul>
          <h3>Agenda</h3>
          <ul>
            {state.agenda.map((item) => (
              <li key={item.id} style={{ marginBottom: '0.5rem' }}>
                <strong>{item.title}</strong> ({item.durationSec || 0}s) {state.currentAgendaItemId === item.id && <span>[Active]</span>}
                {isHost && (
                  <>
                    <button onClick={() => setActiveAgenda(item.id)} style={{ marginLeft: '0.25rem' }}>Set Active</button>
                    <button onClick={() => deleteAgendaItem(item.id)} style={{ marginLeft: '0.25rem' }}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <div style={{ marginBottom: '1rem' }}>
              <input placeholder="Agenda title" value={newAgendaTitle} onChange={(e) => setNewAgendaTitle(e.target.value)} />
              <input placeholder="Duration (sec)" type="number" value={newAgendaDuration} onChange={(e) => setNewAgendaDuration(e.target.value)} style={{ marginLeft: '0.25rem' }} />
              <button onClick={() => { addAgenda(newAgendaTitle, Number(newAgendaDuration) || 0); setNewAgendaTitle(''); setNewAgendaDuration(''); }} style={{ marginLeft: '0.25rem' }}>Add Agenda</button>
            </div>
          )}
          <h3>Timer</h3>
          <p>{state.timer.running ? 'Running' : 'Paused'} - Remaining: {state.timer.remainingSec}s</p>
          {isHost && (
            <div>
              <button onClick={startTimer}>Start</button>
              <button onClick={pauseTimer} style={{ marginLeft: '0.25rem' }}>Pause</button>
              <button onClick={() => extendTimer(60)} style={{ marginLeft: '0.25rem' }}>+60s</button>
            </div>
          )}
          <h3>Voting</h3>
          {state.vote.open ? (
            <div>
              <p>{state.vote.question}</p>
              <ul>
                {state.vote.options.map((opt, idx) => (
                  <li key={idx}>
                    {opt}{' '}
                    {!isHost && (
                      <button onClick={() => castVote(idx)} disabled={state.vote.votesByUserId && state.vote.votesByUserId[userId] !== undefined}>Vote</button>
                    )}
                  </li>
                ))}
              </ul>
              {isHost && <button onClick={closeVote}>Close vote</button>}
            </div>
          ) : (
            isHost && (
              <div>
                <input placeholder="Vote question" value={voteQuestion} onChange={(e) => setVoteQuestion(e.target.value)} />
                <input placeholder="Options comma separated" value={voteOptions} onChange={(e) => setVoteOptions(e.target.value)} style={{ marginLeft: '0.25rem' }} />
                <button onClick={() => { openVote(voteQuestion, voteOptions.split(',').map((s) => s.trim()).filter(Boolean)); setVoteQuestion(''); }} style={{ marginLeft: '0.25rem' }}>Open vote</button>
              </div>
            )
          )}
          {isHost && (
            <div style={{ marginTop: '1rem' }}>
              <button onClick={endMeeting}>End meeting</button>
            </div>
          )}
        </div>
      )}
      {status === 'ended' && (
        <div>
          <h2>Meeting ended</h2>
          <p>Minutes have been generated and stored.</p>
        </div>
      )}
    </div>
  );
}
