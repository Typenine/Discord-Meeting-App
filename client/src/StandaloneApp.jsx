import React, { useState, useEffect, useRef } from "react";

// Standalone Meeting App - connects to Cloudflare Worker via WebSocket
// Supports room + hostKey authentication model

export default function StandaloneApp() {
  const [mode, setMode] = useState("init"); // 'init', 'creating', 'joining', 'connected'
  const [roomId, setRoomId] = useState("");
  const [hostKey, setHostKey] = useState("");
  const [username, setUsername] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [localTimer, setLocalTimer] = useState(0);
  
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const timePingIntervalRef = useRef(null);
  const localTimerIntervalRef = useRef(null);

  // Determine WebSocket URL
  const WS_URL = (() => {
    if (typeof window === "undefined") return null;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // For local dev, connect to Cloudflare Worker
    if (window.location.hostname === "localhost") {
      return "ws://localhost:8787/api/ws";
    }
    // For production, use same origin
    return `${proto}//${window.location.host}/api/ws`;
  })();

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get("room");
    const urlHostKey = params.get("hostKey");
    
    if (urlRoomId) {
      setRoomId(urlRoomId);
      if (urlHostKey) {
        setHostKey(urlHostKey);
        setMode("joining");
      } else {
        setMode("joining");
      }
    }
  }, []);

  // Create new room
  const createRoom = async () => {
    if (!username.trim()) {
      setError("Please enter your name");
      return;
    }
    
    setMode("creating");
    setError(null);
    
    try {
      const res = await fetch("/api/room/create", { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to create room");
        setMode("init");
        return;
      }
      
      setRoomId(data.roomId);
      setHostKey(data.hostKey);
      
      // Show the links to user before connecting
      alert(`Room created!\n\nViewer link: ${data.viewerUrl}\n\nHost link: ${data.hostUrl}\n\nSave the host link to control the meeting!`);
      
      // Connect as host
      connectToRoom(data.roomId, data.hostKey);
    } catch (err) {
      console.error("Failed to create room:", err);
      setError("Network error. Please try again.");
      setMode("init");
    }
  };

  // Join existing room
  const joinRoom = () => {
    if (!username.trim()) {
      setError("Please enter your name");
      return;
    }
    
    if (!roomId.trim()) {
      setError("Please enter a room ID");
      return;
    }
    
    connectToRoom(roomId, hostKey || null);
  };

  // Connect to WebSocket
  const connectToRoom = (room, key) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setError(null);
    
    const url = `${WS_URL}?room=${room}`;
    console.log("[WS] Connecting to", url);
    
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.addEventListener("open", () => {
      console.log("[WS] Connected");
      
      // Send HELLO message
      ws.send(JSON.stringify({
        type: "HELLO",
        sessionId: room,
        hostKey: key,
        displayName: username,
      }));
      
      // Start TIME_PING for clock synchronization
      if (timePingIntervalRef.current) {
        clearInterval(timePingIntervalRef.current);
      }
      timePingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "TIME_PING",
            clientSentAt: Date.now(),
          }));
        }
      }, 10000); // Every 10 seconds
    });
    
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === "HELLO_ACK") {
          setIsHost(msg.isHost);
          setMode("connected");
          
          // Calculate initial time offset
          if (msg.serverNow) {
            const offset = msg.serverNow - Date.now();
            setServerTimeOffset(offset);
          }
        } else if (msg.type === "TIME_PONG") {
          // Calculate round-trip time and server offset
          const now = Date.now();
          const rtt = now - msg.clientSentAt;
          const serverNow = msg.serverNow + (rtt / 2);
          const offset = serverNow - now;
          setServerTimeOffset(offset);
        } else if (msg.type === "STATE") {
          setState(msg.state);
          
          // Update server time offset if provided
          if (msg.serverNow) {
            const offset = msg.serverNow - Date.now();
            setServerTimeOffset(offset);
          }
        } else if (msg.type === "ERROR") {
          console.error("[WS] Error:", msg.error);
          setError(`Server error: ${msg.error}`);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    });
    
    ws.addEventListener("close", () => {
      console.log("[WS] Disconnected");
      setMode("init");
      
      // Clear intervals
      if (timePingIntervalRef.current) {
        clearInterval(timePingIntervalRef.current);
        timePingIntervalRef.current = null;
      }
      
      // Try to reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        if (room && username) {
          console.log("[WS] Attempting to reconnect...");
          connectToRoom(room, key);
        }
      }, 3000);
    });
    
    ws.addEventListener("error", (err) => {
      console.error("[WS] Error:", err);
      setError("Connection error. Retrying...");
    });
  };

  // Local timer tick (updates every second)
  useEffect(() => {
    if (!state || !state.timer) return;
    
    if (localTimerIntervalRef.current) {
      clearInterval(localTimerIntervalRef.current);
    }
    
    if (state.timer.running && state.timer.endsAtMs) {
      // Calculate initial local timer value with server offset
      const serverNow = Date.now() + serverTimeOffset;
      const remaining = Math.max(0, Math.ceil((state.timer.endsAtMs - serverNow) / 1000));
      setLocalTimer(remaining);
      
      // Update every second
      localTimerIntervalRef.current = setInterval(() => {
        const serverNow = Date.now() + serverTimeOffset;
        const remaining = Math.max(0, Math.ceil((state.timer.endsAtMs - serverNow) / 1000));
        setLocalTimer(remaining);
      }, 1000);
    } else {
      setLocalTimer(state.timer.remainingSec || 0);
    }
    
    return () => {
      if (localTimerIntervalRef.current) {
        clearInterval(localTimerIntervalRef.current);
      }
    };
  }, [state?.timer?.running, state?.timer?.endsAtMs, state?.timer?.remainingSec, serverTimeOffset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (timePingIntervalRef.current) {
        clearInterval(timePingIntervalRef.current);
      }
      if (localTimerIntervalRef.current) {
        clearInterval(localTimerIntervalRef.current);
      }
    };
  }, []);

  // Send WebSocket message
  const sendMessage = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // Host actions
  const addAgenda = (title, durationSec) => {
    sendMessage({ type: "AGENDA_ADD", title, durationSec });
  };

  const deleteAgenda = (agendaId) => {
    sendMessage({ type: "AGENDA_DELETE", agendaId });
  };

  const setActiveAgenda = (agendaId) => {
    sendMessage({ type: "AGENDA_SET_ACTIVE", agendaId });
  };

  const startTimer = () => {
    sendMessage({ type: "TIMER_START" });
  };

  const pauseTimer = () => {
    sendMessage({ type: "TIMER_PAUSE" });
  };

  const extendTimer = (seconds) => {
    sendMessage({ type: "TIMER_EXTEND", seconds });
  };

  const openVote = (question, options) => {
    sendMessage({ type: "VOTE_OPEN", question, options });
  };

  const closeVote = () => {
    sendMessage({ type: "VOTE_CLOSE" });
  };

  // Attendee actions
  const castVote = (optionIndex) => {
    sendMessage({ type: "VOTE_CAST", optionIndex });
  };

  // Local form states
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaDuration, setNewAgendaDuration] = useState("");
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h1>🎯 Synced Meeting App</h1>
      
      {error && (
        <div style={{
          padding: "0.75rem",
          marginBottom: "1rem",
          backgroundColor: "#f8d7da",
          border: "1px solid #dc3545",
          borderRadius: "4px",
          color: "#721c24"
        }}>
          <strong>❌ Error:</strong> {error}
          <button
            onClick={() => setError(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem" }}
          >×</button>
        </div>
      )}
      
      {mode === "init" && (
        <div>
          <h2>Join or Create Meeting</h2>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Your Name:</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              style={{ padding: "0.5rem", width: "100%", maxWidth: "400px" }}
            />
          </div>
          
          <div style={{ marginBottom: "2rem" }}>
            <button
              onClick={createRoom}
              disabled={!username}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: username ? "pointer" : "not-allowed",
                fontSize: "1rem",
                fontWeight: "bold"
              }}
            >
              Create New Meeting Room
            </button>
          </div>
          
          <hr />
          
          <h3>Join Existing Room</h3>
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Room ID:</label>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
              style={{ padding: "0.5rem", width: "100%", maxWidth: "400px" }}
            />
          </div>
          
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>Host Key (optional):</label>
            <input
              value={hostKey}
              onChange={(e) => setHostKey(e.target.value)}
              placeholder="Enter host key to control meeting"
              style={{ padding: "0.5rem", width: "100%", maxWidth: "400px" }}
            />
          </div>
          
          <button
            onClick={joinRoom}
            disabled={!username || !roomId}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: (username && roomId) ? "pointer" : "not-allowed",
              fontSize: "1rem"
            }}
          >
            Join Room
          </button>
        </div>
      )}
      
      {(mode === "creating" || mode === "joining") && (
        <div>
          <p>Connecting to room...</p>
        </div>
      )}
      
      {mode === "connected" && state && (
        <div>
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
              <strong>Room:</strong> {roomId}
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
                  ✓ HOST
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
          
          <h2>Meeting Controls</h2>
          <p>You are <strong>{username}</strong> {isHost && "(Host)"}</p>
          
          <h3>Attendance ({Object.keys(state.attendance || {}).length})</h3>
          <ul>
            {Object.values(state.attendance || {}).map((att) => (
              <li key={att.userId}>{att.displayName || att.userId}</li>
            ))}
          </ul>
          
          <h3>Agenda ({state.agenda.length} items)</h3>
          {state.agenda.length === 0 && <p style={{ color: "#666" }}>No agenda items yet. {isHost && "Add one below!"}</p>}
          <ul>
            {state.agenda.map((item) => (
              <li key={item.id} style={{ marginBottom: '0.5rem' }}>
                <strong>{item.title}</strong> ({item.durationSec}s)
                {state.activeAgendaId === item.id && (
                  <span style={{
                    marginLeft: "0.5rem",
                    padding: "0.1rem 0.3rem",
                    backgroundColor: "#ffc107",
                    borderRadius: "3px",
                    fontSize: "0.8rem"
                  }}>ACTIVE</span>
                )}
                {isHost && (
                  <>
                    <button
                      onClick={() => setActiveAgenda(item.id)}
                      style={{ marginLeft: '0.5rem', padding: "0.25rem 0.5rem" }}
                    >
                      Set Active
                    </button>
                    <button
                      onClick={() => deleteAgenda(item.id)}
                      style={{ marginLeft: '0.25rem', padding: "0.25rem 0.5rem" }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          
          {isHost && (
            <div style={{ marginBottom: '1rem', padding: "1rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <strong>Add Agenda Item:</strong>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <input
                  placeholder="Agenda title"
                  value={newAgendaTitle}
                  onChange={(e) => setNewAgendaTitle(e.target.value)}
                  style={{ padding: "0.5rem", flex: "1", minWidth: "200px" }}
                />
                <input
                  placeholder="Duration (sec)"
                  type="number"
                  value={newAgendaDuration}
                  onChange={(e) => setNewAgendaDuration(e.target.value)}
                  style={{ padding: "0.5rem", width: "120px" }}
                />
                <button
                  onClick={() => {
                    if (newAgendaTitle) {
                      addAgenda(newAgendaTitle, Number(newAgendaDuration) || 0);
                      setNewAgendaTitle('');
                      setNewAgendaDuration('');
                    }
                  }}
                  style={{ padding: "0.5rem 1rem" }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
          
          <h3>Timer</h3>
          <div style={{
            padding: "1.5rem",
            backgroundColor: state.timer.running ? "#d1ecf1" : "#f8f9fa",
            border: `2px solid ${state.timer.running ? "#0c5460" : "#dee2e6"}`,
            borderRadius: "8px",
            marginBottom: "1rem",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "3rem", fontWeight: "bold", fontFamily: "monospace" }}>
              {formatTime(localTimer)}
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "1rem", color: "#666" }}>
              {state.timer.running ? '⏸ Running' : '⏹ Paused'}
            </div>
          </div>
          
          {isHost && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={startTimer}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                ▶️ Start
              </button>
              <button
                onClick={pauseTimer}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#ffc107",
                  color: "black",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                ⏸ Pause
              </button>
              <button
                onClick={() => extendTimer(60)}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                +60s
              </button>
              <button
                onClick={() => extendTimer(-30)}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                -30s
              </button>
            </div>
          )}
          
          <h3>Voting</h3>
          {state.vote.open ? (
            <div style={{
              padding: "1rem",
              backgroundColor: "#fff3cd",
              border: "1px solid #ffc107",
              borderRadius: "4px",
              marginBottom: "1rem"
            }}>
              <strong style={{ fontSize: "1.1rem" }}>{state.vote.question}</strong>
              <ul style={{ marginTop: "1rem" }}>
                {state.vote.options.map((opt, idx) => (
                  <li key={idx} style={{ marginBottom: "0.5rem" }}>
                    {opt}
                    {!isHost && (
                      <button
                        onClick={() => castVote(idx)}
                        disabled={state.vote.votesByUserId && state.vote.votesByUserId[username] !== undefined}
                        style={{
                          marginLeft: "1rem",
                          padding: "0.25rem 0.75rem",
                          backgroundColor: "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer"
                        }}
                      >
                        Vote
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
                Votes cast: {Object.keys(state.vote.votesByUserId || {}).length}
              </div>
              {isHost && (
                <button
                  onClick={closeVote}
                  style={{
                    marginTop: "1rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Close Vote
                </button>
              )}
            </div>
          ) : (
            <>
              {state.vote.closedResults && state.vote.closedResults.length > 0 && (
                <details style={{ marginBottom: "1rem" }}>
                  <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
                    Past Votes ({state.vote.closedResults.length})
                  </summary>
                  <ul style={{ marginTop: "0.5rem" }}>
                    {state.vote.closedResults.map((result, idx) => (
                      <li key={idx} style={{ marginBottom: "1rem" }}>
                        <strong>{result.question}</strong>
                        <ul style={{ marginTop: "0.25rem" }}>
                          {result.options.map((opt, optIdx) => (
                            <li key={optIdx}>
                              {opt}: {result.tally[optIdx]} votes
                              ({result.totalVotes > 0 ? Math.round((result.tally[optIdx] / result.totalVotes) * 100) : 0}%)
                            </li>
                          ))}
                        </ul>
                        <div style={{ fontSize: "0.9rem", color: "#666" }}>
                          Total votes: {result.totalVotes}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              
              {isHost && (
                <div style={{
                  padding: "1rem",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "4px"
                }}>
                  <strong>Open New Vote:</strong>
                  <div style={{ marginTop: "0.5rem" }}>
                    <input
                      placeholder="Vote question"
                      value={voteQuestion}
                      onChange={(e) => setVoteQuestion(e.target.value)}
                      style={{ padding: "0.5rem", width: "100%", marginBottom: "0.5rem" }}
                    />
                    <input
                      placeholder="Options (comma separated)"
                      value={voteOptions}
                      onChange={(e) => setVoteOptions(e.target.value)}
                      style={{ padding: "0.5rem", width: "100%", marginBottom: "0.5rem" }}
                    />
                    <button
                      onClick={() => {
                        if (voteQuestion && voteOptions) {
                          const opts = voteOptions.split(',').map(s => s.trim()).filter(Boolean);
                          if (opts.length >= 2) {
                            openVote(voteQuestion, opts);
                            setVoteQuestion('');
                            setVoteOptions('Yes,No,Abstain');
                          }
                        }
                      }}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    >
                      Open Vote
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
