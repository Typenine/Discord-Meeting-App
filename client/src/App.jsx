import React, { useState, useEffect } from "react";
import AgendaItemDetailsModal from "./components/AgendaItemDetailsModal.jsx";
import { formatTime } from "./utils/timeFormat.js";
import logo from "./assets/league-meeting-logo.png";

const UI_VERSION = "WAR-ROOM-001";

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
  const [status, setStatus] = useState("init"); // 'init', 'setup', 'joined', 'ended'
  const [healthStatus, setHealthStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(false); // Loading state for start meeting
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

  // Polling effect: fetch session state every second (only when status is 'joined')
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
        setStatus("setup"); // Go to setup screen instead of directly to joined
        
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
        // If meeting has started, go to joined state; otherwise go to setup (only for host)
        const isHost = data.state.hostUserId === String(userId);
        if (data.state.meetingStarted || !isHost) {
          setStatus("joined");
        } else {
          setStatus("setup");
        }
        
        // Save to localStorage for auto-rejoin
        const sessionInfo = {
          sessionId: targetId,
          joinedAt: Date.now(),
          isHost: isHost,
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

  // Update meeting setup (name and agenda)
  const updateSetup = async (meetingName, agenda) => {
    const data = await post(`/session/${sessionId}/setup`, { userId, meetingName, agenda });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
    }
  };

  // Start the meeting (after setup)
  const startMeetingAfterSetup = async () => {
    const data = await post(`/session/${sessionId}/start-meeting`, { userId, startTimer: true });
    if (data && data.state) {
      setState(data.state);
      setRevision(data.revision);
      setStatus("joined"); // Now move to joined state
    } else {
      // If post returned null, it means the API call failed
      // The post() function already set an error message
      // So we just need to make sure we don't leave the UI in a broken state
      console.error('Failed to start meeting - post() returned null');
      throw new Error('Failed to start meeting');
    }
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
  const addAgenda = async (title, durationSec, notes, type, description, link, category, imageUrl, imageDataUrl) => {
    const data = await post(`/session/${sessionId}/agenda`, { userId, title, durationSec, notes, type, description, link, category, imageUrl, imageDataUrl });
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
  const [selectedAgendaItem, setSelectedAgendaItem] = useState(null);
  
  // Setup form states
  const [setupMeetingName, setSetupMeetingName] = useState("East v. West League Meeting");
  const [setupAgenda, setSetupAgenda] = useState([]);
  const [setupAgendaTitle, setSetupAgendaTitle] = useState("");
  const [setupAgendaMinutes, setSetupAgendaMinutes] = useState("");
  const [setupAgendaSeconds, setSetupAgendaSeconds] = useState("");
  const [setupAgendaNotes, setSetupAgendaNotes] = useState("");
  const [setupAgendaType, setSetupAgendaType] = useState("normal");
  const [setupAgendaDescription, setSetupAgendaDescription] = useState("");
  const [setupAgendaLink, setSetupAgendaLink] = useState("");
  const [setupAgendaCategory, setSetupAgendaCategory] = useState("");

  return (
    <div className="appShell">
      {/* Dev Badge - Only in dev mode */}
      {import.meta.env.DEV && (
        <div className="devBadge">UI: {UI_VERSION}</div>
      )}
      
      {/* Health Status Banner */}
      {healthStatus && healthStatus.warnings && healthStatus.warnings.length > 0 && (
        <div className="banner banner-warning">
          <strong>⚠️ System Warnings:</strong>
          <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.5rem" }}>
            {healthStatus.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      
      {/* Auto-rejoin Prompt */}
      {showRejoinPrompt && lastSession && status === "init" && (
        <div className="container" style={{ paddingTop: "var(--spacing-xl)" }}>
          <div className="banner banner-info">
            <strong>🔄 Resume Meeting?</strong>
            <p style={{ margin: "0.5rem 0" }}>
              You were in a meeting. Would you like to rejoin?
            </p>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "var(--spacing-md)" }}>
              <button 
                className="btn btnPrimary"
                onClick={handleRejoin}
              >
                Rejoin Meeting
              </button>
              <button 
                className="btn btnSecondary"
                onClick={dismissRejoin}
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Error Banner */}
      {error && (
        <div className="container" style={{ paddingTop: status === "init" ? "var(--spacing-xl)" : "0" }}>
          <div className="banner banner-danger">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <strong>{error.type === 'unauthorized' ? '🔒 Authorization Error' : '❌ Error'}:</strong> {error.message}
              </div>
              <button 
                onClick={() => setError(null)} 
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "inherit", lineHeight: 1, padding: 0, marginLeft: "var(--spacing-md)" }}
              >×</button>
            </div>
          </div>
        </div>
      )}
      
      {status === "init" && (
        <div className="container container-narrow" style={{ paddingTop: "var(--spacing-2xl)", paddingBottom: "var(--spacing-4xl)" }}>
          {/* Brand Header */}
          <div className="brandHeader">
            <img src={logo} alt="League Meeting App" className="brandLogo" />
            <h1 className="brandTitle">East v. West</h1>
            <div className="brandSubtitle">League Meeting</div>
          </div>
          
          {/* Two-Card Layout */}
          <div className="grid2">
            {/* Card 1: Create Meeting */}
            <div className="card">
              <div className="cardHeader">
                <h3 className="cardTitle">Create New Meeting</h3>
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
                <h3 className="cardTitle">Join Existing Meeting</h3>
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
                  onClick={() => joinMeeting()} 
                  disabled={!username || !sessionInput}
                >
                  Join Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Setup Screen - Host configures meeting before starting */}
      {status === "setup" && state && isHost && (
        <div className="container container-narrow" style={{ paddingTop: "var(--spacing-2xl)", paddingBottom: "var(--spacing-4xl)" }}>
          <div className="brandHeader">
            <img src={logo} alt="League Meeting App" className="brandLogo" />
            <h1 className="brandTitle">Meeting Setup</h1>
            <div className="brandSubtitle">Configure your meeting before starting</div>
          </div>
          
          <div className="card" style={{ marginBottom: "var(--spacing-xl)" }}>
            <div className="cardHeader">
              <h3 className="cardTitle">Meeting Name</h3>
            </div>
            <div className="cardBody">
              <input 
                className="input"
                value={setupMeetingName}
                onChange={(e) => setSetupMeetingName(e.target.value)}
                placeholder="Enter meeting name"
              />
            </div>
          </div>
          
          <div className="card" style={{ marginBottom: "var(--spacing-xl)" }}>
            <div className="cardHeader">
              <h3 className="cardTitle">Agenda Builder</h3>
              <p style={{ fontSize: "var(--font-size-sm)", opacity: 0.8, marginTop: "var(--spacing-xs)" }}>
                Add items to your meeting agenda
              </p>
            </div>
            <div className="cardBody">
              {/* Existing Agenda Items */}
              {setupAgenda.length > 0 && (
                <div style={{ marginBottom: "var(--spacing-lg)" }}>
                  {setupAgenda.map((item, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        gap: "var(--spacing-md)", 
                        alignItems: "start",
                        marginBottom: "var(--spacing-md)",
                        padding: "var(--spacing-md)",
                        backgroundColor: "var(--color-bg-secondary)",
                        borderRadius: "var(--radius-md)"
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "var(--font-weight-semibold)" }}>
                          {item.title}
                          {item.type === "proposal" && <span className="pill pill-accent" style={{ marginLeft: "var(--spacing-xs)" }}>📋 Proposal</span>}
                          {item.category && <span className="pill pill-neutral" style={{ marginLeft: "var(--spacing-xs)" }}>🏷️ {item.category}</span>}
                        </div>
                        <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7 }}>
                          Duration: {Math.floor(item.durationSec / 60)}m {item.durationSec % 60}s
                        </div>
                        {item.notes && (
                          <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: "var(--spacing-xs)" }}>
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <button 
                        className="btn btnSmall btnDanger"
                        onClick={() => {
                          setSetupAgenda(setupAgenda.filter((_, i) => i !== idx));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add New Agenda Item Form */}
              <div style={{ 
                padding: "var(--spacing-md)", 
                backgroundColor: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-md)"
              }}>
                <label className="label">Item Title</label>
                <input 
                  className="input"
                  value={setupAgendaTitle}
                  onChange={(e) => setSetupAgendaTitle(e.target.value)}
                  placeholder="e.g., Opening remarks"
                  style={{ marginBottom: "var(--spacing-md)" }}
                />
                
                <label className="label">Duration</label>
                <div style={{ display: "flex", gap: "var(--spacing-md)", marginBottom: "var(--spacing-md)" }}>
                  <div style={{ flex: 1 }}>
                    <input 
                      type="number"
                      className="input"
                      value={setupAgendaMinutes}
                      onChange={(e) => setSetupAgendaMinutes(e.target.value)}
                      placeholder="Minutes"
                      min="0"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input 
                      type="number"
                      className="input"
                      value={setupAgendaSeconds}
                      onChange={(e) => setSetupAgendaSeconds(e.target.value)}
                      placeholder="Seconds"
                      min="0"
                      max="59"
                    />
                  </div>
                </div>
                
                <label className="label">Notes (optional)</label>
                <textarea 
                  className="input"
                  value={setupAgendaNotes}
                  onChange={(e) => setSetupAgendaNotes(e.target.value)}
                  placeholder="Additional notes or context"
                  rows="2"
                  style={{ marginBottom: "var(--spacing-md)" }}
                />
                
                <label className="label">Type</label>
                <select
                  className="input"
                  value={setupAgendaType}
                  onChange={(e) => setSetupAgendaType(e.target.value)}
                  style={{ marginBottom: "var(--spacing-md)" }}
                >
                  <option value="normal">Normal</option>
                  <option value="proposal">Proposal</option>
                </select>
                
                {setupAgendaType === "proposal" && (
                  <>
                    <label className="label">Description</label>
                    <textarea 
                      className="input"
                      value={setupAgendaDescription}
                      onChange={(e) => setSetupAgendaDescription(e.target.value)}
                      placeholder="Proposal description"
                      rows="3"
                      style={{ marginBottom: "var(--spacing-md)" }}
                    />
                    
                    <label className="label">Link</label>
                    <input 
                      className="input"
                      value={setupAgendaLink}
                      onChange={(e) => setSetupAgendaLink(e.target.value)}
                      placeholder="https://example.com/proposal"
                      style={{ marginBottom: "var(--spacing-md)" }}
                    />
                  </>
                )}
                
                <label className="label">Category (optional)</label>
                <input 
                  className="input"
                  value={setupAgendaCategory}
                  onChange={(e) => setSetupAgendaCategory(e.target.value)}
                  placeholder="e.g., Budget, Rules, Planning"
                  style={{ marginBottom: "var(--spacing-md)" }}
                />
                
                <button 
                  className="btn btnSecondary btnFull"
                  onClick={() => {
                    if (!setupAgendaTitle) return;
                    const mins = parseInt(setupAgendaMinutes) || 0;
                    const secs = parseInt(setupAgendaSeconds) || 0;
                    const validSecs = Math.max(0, Math.min(59, secs));
                    const totalSeconds = mins * 60 + validSecs;
                    
                    setSetupAgenda([
                      ...setupAgenda,
                      {
                        title: setupAgendaTitle,
                        durationSec: totalSeconds,
                        notes: setupAgendaNotes,
                        type: setupAgendaType,
                        description: setupAgendaType === "proposal" ? setupAgendaDescription : "",
                        link: setupAgendaType === "proposal" ? setupAgendaLink : "",
                        category: setupAgendaCategory
                      }
                    ]);
                    
                    // Clear form
                    setSetupAgendaTitle("");
                    setSetupAgendaMinutes("");
                    setSetupAgendaSeconds("");
                    setSetupAgendaNotes("");
                    setSetupAgendaType("normal");
                    setSetupAgendaDescription("");
                    setSetupAgendaLink("");
                    setSetupAgendaCategory("");
                  }}
                  disabled={!setupAgendaTitle}
                >
                  + Add to Agenda
                </button>
              </div>
            </div>
          </div>
          
          {/* Start Meeting Button */}
          <button 
            className="btn btnPrimary btnLarge btnFull"
            disabled={isStarting}
            onClick={async () => {
              setIsStarting(true);
              setError(null);
              try {
                // First update the setup
                await updateSetup(setupMeetingName, setupAgenda);
                // Then start the meeting
                await startMeetingAfterSetup();
              } catch (err) {
                console.error('Failed to start meeting:', err);
                // Error message already set by post() function
                // Just make sure we don't leave UI in broken state
              } finally {
                setIsStarting(false);
              }
            }}
          >
            {isStarting ? '⏳ Starting...' : '🚀 Start Meeting'}
          </button>
          
          {setupAgenda.length === 0 && (
            <p style={{ 
              textAlign: "center", 
              fontSize: "var(--font-size-sm)", 
              opacity: 0.7,
              marginTop: "var(--spacing-md)"
            }}>
              Tip: Add agenda items to help structure your meeting
            </p>
          )}
        </div>
      )}
      
      {status === "joined" && state && (
        <div className="container" style={{ paddingTop: "var(--spacing-xl)", paddingBottom: "var(--spacing-4xl)" }}>
          {/* Channel Context */}
          {(state.channelId || state.guildId) && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "var(--spacing-md)", 
              marginBottom: "var(--spacing-xl)" 
            }}>
              <span className="pill pill-primary">
                💬 Channel: #{state.channelId || 'Unknown'}
              </span>
              {state.guildId && (
                <span className="pill pill-neutral">
                  Server: {state.guildId}
                </span>
              )}
            </div>
          )}
          
          {/* Connection & Host Status */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: "var(--spacing-xl)"
          }}>
            <div>
              <span className="pill pill-accent">
                Meeting ID: {sessionId}
              </span>
            </div>
            <div>
              {isHost ? (
                <span className="pill pill-success">
                  ✓ HOST ACCESS
                </span>
              ) : (
                <span className="pill pill-neutral">
                  ATTENDEE
                </span>
              )}
            </div>
          </div>
          
          {/* Mode and Identity Indicator */}
          <div style={{ 
            display: "flex", 
            gap: "var(--spacing-md)", 
            marginBottom: "var(--spacing-xl)",
            flexWrap: "wrap"
          }}>
            <span className="pill pill-primary">
              Mode: Discord Activity
            </span>
            <span className="pill pill-neutral">
              Role: {state.hostUserId === userId ? "🔑 Host" : "👥 Viewer"}
            </span>
            <span className="pill pill-neutral" style={{ fontSize: "var(--font-size-xs)" }}>
              ID: {userId ? (userId.length > 20 ? userId.substring(0, 20) + "..." : userId) : "unknown"}
            </span>
          </div>
          
          {/* System Health Panel for Hosts */}
          {isHost && healthStatus && (
            <details className="card" style={{ marginBottom: "var(--spacing-xl)" }}>
              <summary style={{ 
                cursor: "pointer", 
                fontWeight: "var(--font-weight-semibold)", 
                padding: "var(--spacing-lg)",
                listStyle: "none"
              }}>
                📊 System Diagnostics {healthStatus.ok ? "✅" : "⚠️"}
              </summary>
              <div className="cardBody" style={{ paddingTop: 0 }}>
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  <strong>Configuration:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "var(--spacing-xs)" }}>
                    <li>Client ID: {healthStatus.config?.clientId ? "✓ Configured" : "❌ Missing"}</li>
                    <li>Client Secret: {healthStatus.config?.secretConfigured ? "✓ Configured" : "❌ Missing"}</li>
                    <li>Redirect URI: {healthStatus.config?.redirectUri ? "✓ Configured" : "❌ Missing"}</li>
                  </ul>
                </div>
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  <strong>Host Authorization:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "var(--spacing-xs)" }}>
                    <li>Allow All: {healthStatus.hostAuth?.allowAll ? "Yes" : "No"}</li>
                    <li>Authorized Hosts: {healthStatus.hostAuth?.hostIdsCount || 0}</li>
                  </ul>
                </div>
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  <strong>Persistence:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "var(--spacing-xs)" }}>
                    <li>Total Saves: {healthStatus.store?.persistence?.totalSaves || 0}</li>
                    <li>Total Failures: {healthStatus.store?.persistence?.totalFailures || 0}</li>
                    <li>Consecutive Failures: {healthStatus.store?.persistence?.consecutiveFailures || 0}</li>
                    <li>Data Directory: {healthStatus.store?.persistence?.dataDirWritable ? "✓ Writable" : "⚠️ Not Writable"}</li>
                  </ul>
                </div>
                <div>
                  <strong>Sessions:</strong>
                  <ul style={{ marginLeft: "1.5rem", marginTop: "var(--spacing-xs)" }}>
                    <li>Active: {healthStatus.store?.sessions?.active || 0}</li>
                    <li>Ended: {healthStatus.store?.sessions?.ended || 0}</li>
                    <li>Total: {healthStatus.store?.sessions?.total || 0}</li>
                  </ul>
                </div>
              </div>
            </details>
          )}
          
          <h2 style={{ marginBottom: "var(--spacing-lg)" }}>Meeting Controls</h2>
          <p style={{ marginBottom: "var(--spacing-xl)" }}>
            You are <strong>{username}</strong> {isHost && "(with host privileges)"}
          </p>
          
          <h3 style={{ marginBottom: "var(--spacing-md)" }}>Attendance</h3>
          <ul style={{ marginBottom: "var(--spacing-xl)", paddingLeft: "var(--spacing-xl)" }}>
            {Object.values(state.attendance || {}).map((att) => (
              <li key={att.userId}>{att.displayName || att.userId}</li>
            ))}
          </ul>
          
          <h3 style={{ marginBottom: "var(--spacing-md)" }}>Agenda</h3>
          <ul style={{ marginBottom: "var(--spacing-lg)", paddingLeft: "var(--spacing-xl)" }}>
            {state.agenda.map((item) => (
              <li key={item.id} style={{ marginBottom: "var(--spacing-md)", cursor: "pointer" }}>
                <span onClick={() => setSelectedAgendaItem(item)} title="Click to view details">
                  <strong>{item.title}</strong> ({formatTime(item.durationSec || 0)}) {state.currentAgendaItemId === item.id && <span>[Active]</span>}
                  {item.type === "proposal" && <span className="pill pill-accent" style={{ marginLeft: "var(--spacing-xs)" }}>📋 Proposal</span>}
                  {item.category && <span className="pill pill-neutral" style={{ marginLeft: "var(--spacing-xs)" }}>🏷️ {item.category}</span>}
                </span>
                {isHost && (
                  <>
                    <button className="btn btnSmall btnSecondary" onClick={() => setActiveAgenda(item.id)} style={{ marginLeft: "var(--spacing-sm)" }}>Set Active</button>
                    <button className="btn btnSmall btnDanger" onClick={() => deleteAgendaItem(item.id)} style={{ marginLeft: "var(--spacing-sm)" }}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          
          {isHost && (
            <div style={{ marginBottom: "var(--spacing-xl)", display: "flex", gap: "var(--spacing-md)" }}>
              <input 
                className="input" 
                placeholder="Agenda title" 
                value={newAgendaTitle} 
                onChange={(e) => setNewAgendaTitle(e.target.value)} 
              />
              <input 
                className="input" 
                placeholder="Duration (sec)" 
                type="number" 
                value={newAgendaDuration} 
                onChange={(e) => setNewAgendaDuration(e.target.value)} 
                style={{ width: "150px" }}
              />
              <button 
                className="btn btnPrimary" 
                onClick={() => { addAgenda(newAgendaTitle, Number(newAgendaDuration) || 0); setNewAgendaTitle(''); setNewAgendaDuration(''); }}
              >
                Add Agenda
              </button>
            </div>
          )}
          
          <h3 style={{ marginBottom: "var(--spacing-md)" }}>Timer</h3>
          <p style={{ marginBottom: "var(--spacing-md)" }}>
            {state.timer.running ? (
              <span className="pill pill-success">Running</span>
            ) : (
              <span className="pill pill-neutral">Paused</span>
            )}
            {" "}
            <span className="pill pill-accent">Remaining: {state.timer.remainingSec}s</span>
          </p>
          
          {isHost && (
            <div style={{ marginBottom: "var(--spacing-xl)", display: "flex", gap: "var(--spacing-md)" }}>
              <button className="btn btnPrimary" onClick={startTimer}>Start</button>
              <button className="btn btnSecondary" onClick={pauseTimer}>Pause</button>
              <button className="btn btnAccent" onClick={() => extendTimer(60)}>+60s</button>
            </div>
          )}
          
          <h3 style={{ marginBottom: "var(--spacing-md)" }}>Voting</h3>
          {state.vote.open ? (
            <div style={{ marginBottom: "var(--spacing-xl)" }}>
              <p style={{ marginBottom: "var(--spacing-md)", fontWeight: "var(--font-weight-semibold)" }}>
                {state.vote.question}
              </p>
              <ul style={{ marginBottom: "var(--spacing-md)", paddingLeft: "var(--spacing-xl)" }}>
                {state.vote.options.map((opt, idx) => (
                  <li key={idx} style={{ marginBottom: "var(--spacing-sm)" }}>
                    {opt}{' '}
                    {!isHost && (
                      <button 
                        className="btn btnSmall btnPrimary"
                        onClick={() => castVote(idx)} 
                        disabled={state.vote.votesByUserId && state.vote.votesByUserId[userId] !== undefined}
                        style={{ marginLeft: "var(--spacing-sm)" }}
                      >
                        Vote
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {isHost && (
                <button className="btn btnDanger" onClick={closeVote}>Close vote</button>
              )}
            </div>
          ) : (
            isHost && (
              <div style={{ marginBottom: "var(--spacing-xl)", display: "flex", gap: "var(--spacing-md)" }}>
                <input 
                  className="input"
                  placeholder="Vote question" 
                  value={voteQuestion} 
                  onChange={(e) => setVoteQuestion(e.target.value)} 
                />
                <input 
                  className="input"
                  placeholder="Options comma separated" 
                  value={voteOptions} 
                  onChange={(e) => setVoteOptions(e.target.value)} 
                  style={{ width: "300px" }}
                />
                <button 
                  className="btn btnAccent"
                  onClick={() => { openVote(voteQuestion, voteOptions.split(',').map((s) => s.trim()).filter(Boolean)); setVoteQuestion(''); }}
                >
                  Open vote
                </button>
              </div>
            )
          )}
          
          {isHost && (
            <div style={{ marginTop: "var(--spacing-2xl)" }}>
              <button className="btn btnDanger btnLarge" onClick={endMeeting}>End meeting</button>
            </div>
          )}
          
          {/* Agenda Item Details Modal */}
          {selectedAgendaItem && (
            <AgendaItemDetailsModal
              item={selectedAgendaItem}
              formatTime={formatTime}
              onClose={() => setSelectedAgendaItem(null)}
            />
          )}
        </div>
      )}
      {status === 'ended' && (
        <div className="container container-narrow" style={{ paddingTop: "var(--spacing-4xl)", textAlign: "center" }}>
          <h2 style={{ marginBottom: "var(--spacing-lg)" }}>Meeting ended</h2>
          <p className="text-muted">Minutes have been generated and stored.</p>
        </div>
      )}
    </div>
  );
}
