import React, { useState, useEffect } from "react";

// Determine API base for HTTP polling.
const IN_DISCORD = typeof window !== "undefined" && window.location.hostname.endsWith("discordsays.com");
const RAW_ENV_API_BASE = import.meta.env.VITE_API_BASE;
function normalizeApiBase(base) {
  if (!base) return base;
  return String(base).replace(/\/+$/, "");
}
const API_BASE = (() => {
  if (IN_DISCORD) return "/proxy/api";
  const envBase = RAW_ENV_API_BASE && String(RAW_ENV_API_BASE).trim();
  if (envBase) return normalizeApiBase(envBase);
  return "http://127.0.0.1:8787/api";
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
  const [username, setUsername] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(null);
  const [status, setStatus] = useState("init"); // 'init', 'joined', 'ended'
  const [healthStatus, setHealthStatus] = useState(null);
  const [error, setError] = useState(null);
  const isHost = state && state.hostUserId === String(userId);

  // Poll health status on mount and periodically during meetings
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE.replace('/api', '')}/health`);
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
      }
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please try again.' });
    }
  };

  const joinMeeting = async () => {
    const id = sessionInput.trim();
    if (!id) return;
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/session/${id}/join`, {
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
        setSessionId(id);
        setState(data.state);
        setRevision(data.revision);
        setStatus("joined");
      }
    } catch (err) {
      console.error(err);
      setError({ type: 'error', message: 'Network error. Please try again.' });
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
      
      {status === "init" && (
        <div>
          <h2>Join or Start Meeting</h2>
          <div>
            <label>Your name:</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <button onClick={startMeeting} disabled={!username}>Start new meeting</button>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <label>Meeting ID:</label>
            <input value={sessionInput} onChange={(e) => setSessionInput(e.target.value)} />
            <button onClick={joinMeeting} disabled={!username || !sessionInput}>Join meeting</button>
          </div>
        </div>
      )}
      {status === "joined" && state && (
        <div>
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
