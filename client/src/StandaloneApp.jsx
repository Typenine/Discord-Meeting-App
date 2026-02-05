import React, { useState, useEffect, useRef } from "react";
import TopBar from "./components/TopBar.jsx";
import RoomLayout from "./components/RoomLayout.jsx";
import HostPanel from "./components/HostPanel.jsx";
import BrandHeader from "./components/BrandHeader.jsx";
import { formatTime } from "./utils/timeFormat.js";
import logo from "./assets/league-meeting-logo.png";

const UI_VERSION = "STYLE-REDO-PROOF-001";

// Standalone Meeting App - connects to Cloudflare Worker via WebSocket
// Supports room + hostKey authentication model

// Validation helper
function validateUrl(url, source) {
  if (!url) return url;
  const urlStr = String(url);
  // Check for asterisks (both raw and URL-encoded)
  if (urlStr.includes("*") || urlStr.includes("%2A")) {
    throw new Error(`Invalid Worker domain; remove placeholder. (Source: ${source}, Value: ${urlStr})`);
  }
  return urlStr;
}

// Log configuration at module load time
const RAW_VITE_WORKER_DOMAIN = import.meta.env.VITE_WORKER_DOMAIN;
const RAW_VITE_API_BASE = import.meta.env.VITE_API_BASE;
console.log("=== StandaloneApp.jsx Configuration ===");
console.log("CONFIG VITE_API_BASE=" + (RAW_VITE_API_BASE || "(not set)"));
console.log("CONFIG VITE_WORKER_DOMAIN=" + (RAW_VITE_WORKER_DOMAIN || "(not set)"));

// Compute API_BASE and WS_URL with proper configuration rules
const CONFIG_ERROR = { message: null, showBanner: false };

const API_BASE = (() => {
  if (typeof window === "undefined") return null;
  
  // Option 1: Check for explicit VITE_API_BASE configuration
  const envBase = RAW_VITE_API_BASE && String(RAW_VITE_API_BASE).trim();
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
  const workerDomain = RAW_VITE_WORKER_DOMAIN && String(RAW_VITE_WORKER_DOMAIN).trim();
  if (workerDomain) {
    // VITE_WORKER_DOMAIN must be a full host like xxx.workers.dev (not xxx.workers)
    const validated = validateUrl(workerDomain, "VITE_WORKER_DOMAIN");
    if (!validated.endsWith(".workers.dev")) {
      const errorMsg = `VITE_WORKER_DOMAIN must end with .workers.dev (got: ${validated})`;
      console.error(errorMsg);
      CONFIG_ERROR.message = errorMsg;
      CONFIG_ERROR.showBanner = true;
      return null;
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
  const errorMsg = "Production deployment requires VITE_API_BASE or VITE_WORKER_DOMAIN environment variable.";
  console.error(errorMsg);
  CONFIG_ERROR.message = errorMsg;
  CONFIG_ERROR.showBanner = true;
  return null;
})();

// Derive WS_URL from API_BASE
const WS_URL = (() => {
  if (typeof window === "undefined") return null;
  
  if (API_BASE) {
    // Derive wsUrl from apiBase by replacing http(s):// with ws(s):// and appending /ws
    const wsUrl = API_BASE.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") + "/ws";
    console.log("CONFIG Final wsUrl=" + wsUrl);
    return wsUrl;
  }
  
  return null;
})();

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
  
  // View as attendee toggle
  const [viewAsAttendee, setViewAsAttendee] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const timePingIntervalRef = useRef(null);
  const localTimerIntervalRef = useRef(null);

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
      // Use the global API_BASE configuration
      if (!API_BASE) {
        throw new Error("API base URL not configured");
      }
      
      const res = await fetch(`${API_BASE}/room/create`, { method: "POST" });
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

  // Start meeting after showing links - navigate to room URL
  const startMeeting = () => {
    setShowLinks(false);
    // Update URL to room path with hostKey
    const newUrl = `${window.location.origin}/${roomId}?hostKey=${hostKey}`;
    window.history.pushState({}, '', newUrl);
    // Connect to room
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
      // Only update state if this WebSocket is still the current one
      // This prevents stale close events from old connections from overwriting the state
      if (wsRef.current === ws) {
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
      } else {
        console.log("[WS] Ignoring close event from old connection");
      }
    });
    
    ws.addEventListener("error", (err) => {
      // Only update state if this WebSocket is still the current one
      if (wsRef.current === ws) {
        console.error("[WS] Error:", err);
        setError("Connection error. Retrying...");
      }
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

  // Update document title dynamically based on active agenda item and timer
  useEffect(() => {
    if (!state || mode !== "connected") {
      // Reset to default when not in a meeting
      document.title = "East v. West League Meeting";
      return;
    }

    if (state.activeAgendaId && state.timer.running) {
      // Find active agenda item
      const activeItem = state.agenda.find(item => item.id === state.activeAgendaId);
      if (activeItem) {
        // Format timer as MM:SS using shared utility
        const timeStr = formatTime(localTimer);
        document.title = `${timeStr} – ${activeItem.title}`;
        return;
      }
    }
    
    // Default title when not running or no active item
    document.title = "East v. West League Meeting";
  }, [state, localTimer, mode]);

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

  return (
    <div style={{ fontFamily: "sans-serif", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Connection Status Banners - only show when connected mode */}
      {mode === "connected" && connectionStatus === "disconnected" && (
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

      {mode === "connected" && connectionStatus === "reconnecting" && (
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

      {mode === "connected" && connectionStatus === "connected" && showConnectedBanner && (
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

      {/* Configuration Error Banner */}
      {CONFIG_ERROR.showBanner && CONFIG_ERROR.message && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#dc3545",
          color: "white",
          padding: "10px",
          textAlign: "center",
          zIndex: 1000,
          fontWeight: "bold",
        }}>
          ❌ Configuration Error: {CONFIG_ERROR.message}
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
              backgroundColor: "#050505",
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
      
      {error && mode !== "connected" && (
        <div style={{
          padding: "0.75rem",
          margin: "1rem",
          backgroundColor: "#1a1a1a",
          border: "1px solid #dc3545",
          borderRadius: "4px",
          color: "#fcfcfc"
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
            backgroundColor: "#050505",
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
                backgroundColor: "#1a1a1a",
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
                  backgroundColor: "#0b5f98",
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
                  backgroundColor: "var(--color-accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                📋 Copy Host Link
              </button>
            </div>
            
            <p style={{ fontSize: "0.9rem", color: "#fcfcfc" }}>
              <strong>Important:</strong> Save the host link to control the meeting. 
              The viewer link is safe to share publicly.
            </p>
            
            <button
              onClick={startMeeting}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--color-primary)",
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
        <div className="homeContainer">
          <BrandHeader />
          
          <div className="badge badgeGold" style={{ 
            fontSize: "var(--font-size-sm)",
            fontWeight: "700",
            marginTop: "var(--spacing-lg)"
          }}>
            UI: {UI_VERSION}
          </div>
          
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
                  onClick={createRoom}
                  disabled={!username}
                >
                  Create New Meeting Room
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
                <label className="label">Room ID</label>
                <input
                  className="input"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID"
                  style={{ marginBottom: "var(--spacing-lg)" }}
                />
                <label className="label">Host Key (optional)</label>
                <input
                  className="input"
                  value={hostKey}
                  onChange={(e) => setHostKey(e.target.value)}
                  placeholder="Enter host key to control meeting"
                />
                <span className="helper">Leave blank to join as attendee</span>
                <button
                  className="btn btnAccent btnLarge btnFull"
                  style={{ marginTop: "var(--spacing-xl)" }}
                  onClick={joinRoom}
                  disabled={!username || !roomId}
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>
          
          {/* Footer with logo watermark */}
          <div className="footer">
            <img src={logo} alt="League Meeting App" className="footerLogo" />
            <div>East v. West League Meeting</div>
          </div>
        </div>
      )}
      
      {(mode === "creating" || mode === "joining") && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: "1rem"
        }}>
          <div style={{
            width: "50px",
            height: "50px",
            border: "4px solid #1a1a1a",
            borderTop: "4px solid #0b5f98",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
          <p style={{ fontSize: "1.2rem", color: "#fcfcfc" }}>Connecting to room...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      
      {mode === "connected" && state && (
        <>
          <TopBar 
            roomId={roomId}
            isHost={isHost}
            connectionStatus={connectionStatus}
            viewAsAttendee={viewAsAttendee}
            onToggleViewAsAttendee={() => setViewAsAttendee(!viewAsAttendee)}
            showViewToggle={isHost}
            uiVersion={UI_VERSION}
          />
          
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <RoomLayout 
              state={state}
              username={username}
              clientId={clientId}
              localTimer={localTimer}
              formatTime={formatTime}
              isHost={isHost}
              viewAsAttendee={viewAsAttendee}
              onCastVote={castVote}
            />
            
            {isHost && !viewAsAttendee && (
              <HostPanel 
                state={state}
                onAddAgenda={addAgenda}
                onUpdateAgenda={updateAgenda}
                onDeleteAgenda={deleteAgenda}
                onSetActiveAgenda={setActiveAgenda}
                onNextAgendaItem={nextAgendaItem}
                onPrevAgendaItem={prevAgendaItem}
                onStartTimer={startTimer}
                onPauseTimer={pauseTimer}
                onResumeTimer={resumeTimer}
                onResetTimer={resetTimer}
                onExtendTimer={extendTimer}
                onOpenVote={openVote}
                onCloseVote={closeVote}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
