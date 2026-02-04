import React, { useState, useEffect, useRef } from "react";

// Standalone Meeting App - connects to Cloudflare Worker via WebSocket
// Supports room + hostKey authentication model

export default function StandaloneApp() {
  const [mode, setMode] = useState("init"); // 'init', 'creating', 'joining', 'connected'
  const [roomId, setRoomId] = useState("");
  const [hostKey, setHostKey] = useState("");
  const [username, setUsername] = useState("");
  const [clientId, setClientId] = useState(() => {
    // Generate and persist clientId in localStorage
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("evw_client_id");
      if (!id) {
        id = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem("evw_client_id", id);
      }
      return id;
    }
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  });
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [localTimer, setLocalTimer] = useState(0);
  const [showLinks, setShowLinks] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [hostUrl, setHostUrl] = useState("");
  
  // Connection status and reconnection tracking
  const [connectionStatus, setConnectionStatus] = useState("disconnected"); // 'connected', 'disconnected', 'reconnecting'
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectDelay, setReconnectDelay] = useState(0);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  
  // Host privileges tracking
  const [wasHost, setWasHost] = useState(false);
  const [showHostLostWarning, setShowHostLostWarning] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const timePingIntervalRef = useRef(null);
  const localTimerIntervalRef = useRef(null);

  // Determine WebSocket URL
  const WS_URL = (() => {
    if (typeof window === "undefined") return null;
    
    // For production, connect to Cloudflare Worker directly
    // WebSocket cannot be proxied through Vercel
    if (import.meta.env.PROD) {
      // In production, use environment variable or fail with clear error
      const workerDomain = import.meta.env.VITE_WORKER_DOMAIN;
      if (!workerDomain) {
        console.error("VITE_WORKER_DOMAIN not configured. Set this in Vercel environment variables.");
        return null;
      }
      return `wss://${workerDomain}/api/ws`;
    }
    
    // For local dev, connect to local Cloudflare Worker
    return "ws://localhost:8787/api/ws";
  })();

  // Parse URL on mount - support both /:roomId and /room/:roomId patterns
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Extract roomId from path: /:roomId or /room/:roomId
    let urlRoomId = null;
    if (path && path !== '/') {
      const pathParts = path.split('/').filter(Boolean);
      if (pathParts.length === 1) {
        // Pattern: /:roomId
        urlRoomId = pathParts[0];
      } else if (pathParts.length === 2 && pathParts[0] === 'room') {
        // Pattern: /room/:roomId
        urlRoomId = pathParts[1];
      }
    }
    
    // Also check query param for backward compatibility
    if (!urlRoomId) {
      urlRoomId = params.get("room");
    }
    
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

  // Track host privileges changes
  useEffect(() => {
    if (wasHost && !isHost && connectionStatus === "connected") {
      // Lost host privileges
      setShowHostLostWarning(true);
    }
    if (isHost) {
      setWasHost(true);
    }
  }, [isHost, wasHost, connectionStatus]);

  // Auto-hide connected banner after 3 seconds
  useEffect(() => {
    if (showConnectedBanner) {
      const timer = setTimeout(() => {
        setShowConnectedBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showConnectedBanner]);

  // Create new room
  const createRoom = async () => {
    if (!username.trim()) {
      setError("Please enter your name");
      return;
    }
    
    setMode("creating");
    setError(null);
    
    try {
      // API endpoint for room creation
      const apiBase = import.meta.env.PROD 
        ? (() => {
            const workerDomain = import.meta.env.VITE_WORKER_DOMAIN;
            if (!workerDomain) {
              throw new Error("VITE_WORKER_DOMAIN not configured");
            }
            return `https://${workerDomain}`;
          })()
        : "http://localhost:8787";
      
      const res = await fetch(`${apiBase}/api/room/create`, { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to create room");
        setMode("init");
        return;
      }
      
      setRoomId(data.roomId);
      setHostKey(data.hostKey);
      
      // Update URLs to use path-based routing
      const frontendUrl = window.location.origin;
      const viewer = `${frontendUrl}/${data.roomId}`;
      const host = `${frontendUrl}/${data.roomId}?hostKey=${data.hostKey}`;
      
      setViewerUrl(viewer);
      setHostUrl(host);
      setShowLinks(true);
    } catch (err) {
      console.error("Failed to create room:", err);
      setError(err.message || "Network error. Please try again.");
      setMode("init");
    }
  };

  // Start meeting after showing links
  const startMeeting = () => {
    setShowLinks(false);
    connectToRoom(roomId, hostKey);
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

  // Calculate exponential backoff delay
  const calculateBackoff = (attempts) => {
    // 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(Math.pow(2, attempts) * 1000, 30000);
    return delay;
  };

  // Connect to WebSocket
  const connectToRoom = (room, key) => {
    if (!WS_URL) {
      setError("WebSocket URL not configured. Check VITE_WORKER_DOMAIN environment variable.");
      setMode("init");
      setConnectionStatus("disconnected");
      return;
    }
    
    // Clear any existing reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setError(null);
    setConnectionStatus("reconnecting");
    
    const url = `${WS_URL}?room=${room}`;
    console.log("[WS] Connecting to", url);
    
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.addEventListener("open", () => {
      console.log("[WS] Connected");
      
      // Reset reconnection state on successful connection
      setReconnectAttempts(0);
      setReconnectDelay(0);
      setConnectionStatus("connected");
      setShowConnectedBanner(true);
      
      // Send HELLO message with new structure
      ws.send(JSON.stringify({
        type: "HELLO",
        roomId: room,
        clientId: clientId,
        hostKey: key || undefined,  // Only include if provided
        displayName: username,
      }));
      
      // Send initial TIME_PING for clock synchronization
      ws.send(JSON.stringify({
        type: "TIME_PING",
        clientSentAt: Date.now(),
      }));
      
      // Start TIME_PING interval for clock synchronization (every 30 seconds)
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
      }, 30000); // Every 30 seconds
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
          
          // Extract userId from attendance or generate one
          // The server should send back the resolved userId in a future enhancement
          // For now, we'll track it when we receive the first STATE update
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
      setConnectionStatus("disconnected");
      
      // Clear intervals
      if (timePingIntervalRef.current) {
        clearInterval(timePingIntervalRef.current);
        timePingIntervalRef.current = null;
      }
      
      // Exponential backoff reconnection
      // Calculate delay: 1s, 2s, 4s, 8s, 16s, 30s (max)
      const delay = calculateBackoff(reconnectAttempts);
      setReconnectDelay(delay);
      
      console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts + 1})`);
      
      // Try to reconnect after calculated delay
      reconnectTimerRef.current = setTimeout(() => {
        if (room && username) {
          console.log("[WS] Attempting to reconnect...");
          setReconnectAttempts(prev => prev + 1);
          connectToRoom(room, key);
        }
      }, delay);
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
      // Timer is running - calculate remaining time using endsAtMs and server offset
      const updateTimer = () => {
        const serverNow = Date.now() + serverTimeOffset;
        const remaining = Math.max(0, Math.ceil((state.timer.endsAtMs - serverNow) / 1000));
        setLocalTimer(remaining);
      };
      
      // Set initial value
      updateTimer();
      
      // Update every second
      localTimerIntervalRef.current = setInterval(updateTimer, 1000);
    } else if (state.timer.pausedRemainingSec !== null) {
      // Timer is paused - show paused remaining seconds
      setLocalTimer(state.timer.pausedRemainingSec);
    } else {
      // Timer is stopped - show duration
      setLocalTimer(state.timer.durationSec || 0);
    }
    
    return () => {
      if (localTimerIntervalRef.current) {
        clearInterval(localTimerIntervalRef.current);
      }
    };
  }, [state?.timer?.running, state?.timer?.endsAtMs, state?.timer?.pausedRemainingSec, state?.timer?.durationSec, serverTimeOffset]);

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
  const addAgenda = (title, durationSec, notes) => {
    sendMessage({ type: "AGENDA_ADD", title, durationSec, notes });
  };

  const updateAgenda = (agendaId, updates) => {
    sendMessage({ type: "AGENDA_UPDATE", agendaId, ...updates });
  };

  const deleteAgenda = (agendaId) => {
    sendMessage({ type: "AGENDA_DELETE", agendaId });
  };

  const setActiveAgenda = (agendaId) => {
    sendMessage({ type: "AGENDA_SET_ACTIVE", agendaId });
  };

  const nextAgendaItem = () => {
    sendMessage({ type: "AGENDA_NEXT" });
  };

  const prevAgendaItem = () => {
    sendMessage({ type: "AGENDA_PREV" });
  };

  const startEditingAgenda = (item) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditDuration(String(item.durationSec));
    setEditNotes(item.notes || "");
  };

  const saveEditingAgenda = () => {
    if (editingItemId && editTitle) {
      updateAgenda(editingItemId, {
        title: editTitle,
        durationSec: Number(editDuration) || 0,
        notes: editNotes
      });
      setEditingItemId(null);
      setEditTitle("");
      setEditDuration("");
      setEditNotes("");
    }
  };

  const cancelEditingAgenda = () => {
    setEditingItemId(null);
    setEditTitle("");
    setEditDuration("");
    setEditNotes("");
  };

  const startTimer = () => {
    sendMessage({ type: "TIMER_START" });
  };

  const pauseTimer = () => {
    sendMessage({ type: "TIMER_PAUSE" });
  };

  const resumeTimer = () => {
    sendMessage({ type: "TIMER_RESUME" });
  };

  const resetTimer = () => {
    sendMessage({ type: "TIMER_RESET" });
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
  const castVote = (optionId) => {
    sendMessage({ type: "VOTE_CAST", optionId });
  };

  // Local form states
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaDuration, setNewAgendaDuration] = useState("");
  const [newAgendaNotes, setNewAgendaNotes] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editNotes, setEditNotes] = useState("");
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
      {/* Connection Status Banners */}
      {connectionStatus === "disconnected" && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#ff4444",
          color: "white",
          padding: "10px",
          textAlign: "center",
          zIndex: 1000,
          fontWeight: "bold",
        }}>
          ⚠️ Disconnected - Reconnecting in {Math.ceil(reconnectDelay / 1000)}s (attempt {reconnectAttempts})
        </div>
      )}

      {connectionStatus === "reconnecting" && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#ff9800",
          color: "white",
          padding: "10px",
          textAlign: "center",
          zIndex: 1000,
          fontWeight: "bold",
        }}>
          🔄 Reconnecting... (attempt {reconnectAttempts})
        </div>
      )}

      {connectionStatus === "connected" && showConnectedBanner && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#4caf50",
          color: "white",
          padding: "10px",
          textAlign: "center",
          zIndex: 1000,
          fontWeight: "bold",
        }}>
          ✓ Connected
        </div>
      )}

      {/* Host Privileges Lost Warning */}
      {showHostLostWarning && (
        <div style={{
          position: "fixed",
          top: connectionStatus === "connected" && showConnectedBanner ? "50px" : "10px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#ff9800",
          color: "white",
          padding: "15px 20px",
          borderRadius: "5px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
          zIndex: 1001,
          maxWidth: "400px",
          width: "90%",
        }}>
          <div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: "8px" }}>
            ⚠️ Host Privileges Lost
          </div>
          <div style={{ fontSize: "0.9rem", marginBottom: "12px" }}>
            You are now a viewer. You can no longer control the meeting.
          </div>
          <button
            onClick={() => setShowHostLostWarning(false)}
            style={{
              padding: "6px 16px",
              backgroundColor: "white",
              color: "#ff9800",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>🎯 Synced Meeting App</h1>
        
        {/* Mode and Identity Indicator */}
        {mode === "connected" && (
          <div style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#e7f3ff",
            border: "1px solid #0066cc",
            borderRadius: "4px",
            fontSize: "0.85rem",
            textAlign: "right"
          }}>
            <div style={{ fontWeight: "bold", color: "#0066cc" }}>
              Mode: Standalone
            </div>
            <div style={{ color: "#555" }}>
              Role: {isHost ? "🔑 Host" : "👥 Viewer"}
            </div>
            <div style={{ color: "#666", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              ID: {clientId.substring(0, 20)}...
            </div>
          </div>
        )}
      </div>
      
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
      
      {showLinks && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "2rem",
            borderRadius: "8px",
            maxWidth: "600px",
            width: "90%"
          }}>
            <h2 style={{ marginTop: 0 }}>🎉 Room Created!</h2>
            <p>Room ID: <strong>{roomId}</strong></p>
            
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>👥 Viewer Link (share with attendees):</h3>
              <div style={{
                padding: "0.75rem",
                backgroundColor: "#f8f9fa",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                wordBreak: "break-all",
                fontSize: "0.9rem"
              }}>
                {viewerUrl}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(viewerUrl)}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                📋 Copy Viewer Link
              </button>
            </div>
            
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>🔑 Host Link (keep this secret!):</h3>
              <div style={{
                padding: "0.75rem",
                backgroundColor: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "4px",
                wordBreak: "break-all",
                fontSize: "0.9rem"
              }}>
                {hostUrl}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(hostUrl)}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#ffc107",
                  color: "black",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                📋 Copy Host Link
              </button>
            </div>
            
            <p style={{ fontSize: "0.9rem", color: "#666" }}>
              <strong>Important:</strong> Save the host link to control the meeting. 
              The viewer link is safe to share publicly.
            </p>
            
            <button
              onClick={startMeeting}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "bold",
                width: "100%"
              }}
            >
              Start Meeting
            </button>
          </div>
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
          
          {/* Next/Prev navigation buttons */}
          {isHost && state.agenda.length > 1 && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={prevAgendaItem}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                ◀ Previous Item
              </button>
              <button
                onClick={nextAgendaItem}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Next Item ▶
              </button>
            </div>
          )}
          
          <ul style={{ listStyle: "none", padding: 0 }}>
            {state.agenda.map((item) => (
              <li key={item.id} style={{ 
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: state.activeAgendaId === item.id ? '#fff3cd' : '#f8f9fa',
                border: `2px solid ${state.activeAgendaId === item.id ? '#ffc107' : '#dee2e6'}`,
                borderRadius: '4px'
              }}>
                {editingItemId === item.id ? (
                  // Edit mode
                  <div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <input
                        placeholder="Title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{ 
                          padding: "0.5rem", 
                          width: "100%", 
                          marginBottom: "0.5rem",
                          fontSize: "1rem"
                        }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          placeholder="Duration (sec)"
                          type="number"
                          value={editDuration}
                          onChange={(e) => setEditDuration(e.target.value)}
                          style={{ padding: "0.5rem", width: "150px" }}
                        />
                      </div>
                      <textarea
                        placeholder="Notes (optional)"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        style={{ 
                          padding: "0.5rem", 
                          width: "100%", 
                          marginTop: "0.5rem",
                          minHeight: "60px",
                          fontFamily: "inherit"
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={saveEditingAgenda}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#28a745",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer"
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditingAgenda}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#6c757d",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer"
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem' }}>{item.title}</strong>
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        color: '#666',
                        fontSize: '0.9rem'
                      }}>
                        ({item.durationSec}s)
                      </span>
                      {state.activeAgendaId === item.id && (
                        <span style={{
                          marginLeft: "0.5rem",
                          padding: "0.2rem 0.5rem",
                          backgroundColor: "#ffc107",
                          borderRadius: "3px",
                          fontSize: "0.8rem",
                          fontWeight: "bold"
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <div style={{ 
                        fontSize: '0.9rem', 
                        color: '#666',
                        marginBottom: '0.5rem',
                        fontStyle: 'italic'
                      }}>
                        {item.notes}
                      </div>
                    )}
                    {isHost && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {state.activeAgendaId !== item.id && (
                          <button
                            onClick={() => setActiveAgenda(item.id)}
                            style={{ 
                              padding: "0.25rem 0.5rem",
                              fontSize: "0.9rem"
                            }}
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => startEditingAgenda(item)}
                          style={{ 
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.9rem"
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAgenda(item.id)}
                          style={{ 
                            padding: "0.25rem 0.5rem",
                            backgroundColor: "#dc3545",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: "pointer",
                            fontSize: "0.9rem"
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          
          {isHost && (
            <div style={{ marginBottom: '1rem', padding: "1rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <strong>Add Agenda Item:</strong>
              <div style={{ marginTop: "0.5rem" }}>
                <input
                  placeholder="Agenda title"
                  value={newAgendaTitle}
                  onChange={(e) => setNewAgendaTitle(e.target.value)}
                  style={{ padding: "0.5rem", width: "100%", marginBottom: "0.5rem" }}
                />
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    placeholder="Duration (sec)"
                    type="number"
                    value={newAgendaDuration}
                    onChange={(e) => setNewAgendaDuration(e.target.value)}
                    style={{ padding: "0.5rem", width: "150px" }}
                  />
                </div>
                <textarea
                  placeholder="Notes (optional)"
                  value={newAgendaNotes}
                  onChange={(e) => setNewAgendaNotes(e.target.value)}
                  style={{ 
                    padding: "0.5rem", 
                    width: "100%", 
                    marginBottom: "0.5rem",
                    minHeight: "60px",
                    fontFamily: "inherit"
                  }}
                />
                <button
                  onClick={() => {
                    if (newAgendaTitle) {
                      addAgenda(newAgendaTitle, Number(newAgendaDuration) || 0, newAgendaNotes);
                      setNewAgendaTitle('');
                      setNewAgendaDuration('');
                      setNewAgendaNotes('');
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
              {state.timer.running ? '▶️ Running' : state.timer.pausedRemainingSec !== null ? '⏸ Paused' : '⏹ Stopped'}
            </div>
          </div>
          
          {isHost && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {!state.timer.running && state.timer.pausedRemainingSec === null && (
                <button
                  onClick={startTimer}
                  disabled={state.timer.durationSec <= 0}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: state.timer.durationSec > 0 ? "pointer" : "not-allowed",
                    opacity: state.timer.durationSec > 0 ? 1 : 0.5
                  }}
                >
                  ▶️ Start
                </button>
              )}
              {state.timer.running && (
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
              )}
              {!state.timer.running && state.timer.pausedRemainingSec !== null && (
                <button
                  onClick={resumeTimer}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  ▶️ Resume
                </button>
              )}
              <button
                onClick={resetTimer}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                🔄 Reset
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
                {state.vote.options.map((opt) => {
                  // Support both old format (string) and new format (object)
                  const optionId = opt.id || opt;
                  const optionLabel = opt.label || opt;
                  const voteCount = state.vote.votesByClientId 
                    ? Object.values(state.vote.votesByClientId).filter(v => v === optionId).length 
                    : 0;
                  
                  return (
                    <li key={optionId} style={{ marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>
                          {optionLabel}
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
                            ({voteCount} vote{voteCount !== 1 ? 's' : ''})
                          </span>
                        </span>
                        {!isHost && (
                          <button
                            onClick={() => castVote(optionId)}
                            disabled={state.vote.votesByClientId && clientId && state.vote.votesByClientId[clientId] !== undefined}
                            style={{
                              marginLeft: "1rem",
                              padding: "0.25rem 0.75rem",
                              backgroundColor: state.vote.votesByClientId?.[clientId] === optionId ? "#28a745" : "#007bff",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: state.vote.votesByClientId?.[clientId] !== undefined ? "not-allowed" : "pointer",
                              opacity: state.vote.votesByClientId?.[clientId] !== undefined ? 0.6 : 1
                            }}
                          >
                            {state.vote.votesByClientId?.[clientId] === optionId ? "✓ Voted" : "Vote"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
                Votes cast: {Object.keys(state.vote.votesByClientId || {}).length}
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
                          {result.options.map((opt) => {
                            // Support both old format (string with array tally) and new format (object with tally map)
                            const optionId = opt.id || opt;
                            const optionLabel = opt.label || opt;
                            const voteCount = typeof result.tally === 'object' 
                              ? (result.tally[optionId] || 0) 
                              : (result.tally[result.options.indexOf(opt)] || 0);
                            const percentage = result.totalVotes > 0 
                              ? Math.round((voteCount / result.totalVotes) * 100) 
                              : 0;
                            
                            return (
                              <li key={optionId}>
                                {optionLabel}: {voteCount} vote{voteCount !== 1 ? 's' : ''} ({percentage}%)
                              </li>
                            );
                          })}
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
