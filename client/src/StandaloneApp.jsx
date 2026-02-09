import React, { useState, useEffect, useRef } from "react";
import TopBar from "./components/TopBar.jsx";
import RoomLayout from "./components/RoomLayout.jsx";
import HostPanel from "./components/HostPanel.jsx";
import AttendanceRail from "./components/AttendanceRail.jsx";
import ShareModal from "./components/ShareModal.jsx";
import PopoutView from "./components/PopoutView.jsx";
import { formatTime } from "./utils/timeFormat.js";
import { generateViewerLink, generateHostLink, openPopoutWindow, isPopoutMode, isAttendeeViewMode } from "./utils/linkHelpers.js";
import { processImageFile, validateImageUrl } from "./utils/imageProcessing.js";
import logo from "./assets/league-meeting-logo.png";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/hostPanel.css";

const UI_VERSION = "WAR-ROOM-001";

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

// Validate link URL for agenda items
function validateAgendaLink(link) {
  if (!link || link.trim() === "") return { valid: true, error: "" };
  const trimmed = link.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { valid: true, error: "" };
  }
  return { valid: false, error: "Link must start with http:// or https://" };
}

// Log configuration at module load time
const RAW_VITE_WORKER_DOMAIN = import.meta.env.VITE_WORKER_DOMAIN;
const RAW_VITE_API_BASE = import.meta.env.VITE_API_BASE;
const RAW_VITE_WS_URL = import.meta.env.VITE_WS_URL;
console.log("=== StandaloneApp.jsx Configuration ===");
console.log("CONFIG VITE_API_BASE=" + (RAW_VITE_API_BASE || "(not set)"));
console.log("CONFIG VITE_WORKER_DOMAIN=" + (RAW_VITE_WORKER_DOMAIN || "(not set)"));
console.log("CONFIG VITE_WS_URL=" + (RAW_VITE_WS_URL || "(not set)"));

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
  
  // In production, try same-origin as safe default
  if (typeof window !== "undefined" && window.location) {
    const sameOriginBase = `${window.location.protocol}//${window.location.host}/api`;
    console.warn("CONFIG Using same-origin fallback:", sameOriginBase);
    console.warn("CONFIG For production, set VITE_API_BASE or VITE_WORKER_DOMAIN");
    return sameOriginBase;
  }
  
  // Last resort: fail with clear error
  const errorMsg = "Production deployment requires VITE_API_BASE or VITE_WORKER_DOMAIN environment variable.";
  console.error(errorMsg);
  CONFIG_ERROR.message = errorMsg;
  CONFIG_ERROR.showBanner = true;
  return null;
})();

// Derive WS_URL from explicit env or API_BASE
const WS_URL = (() => {
  if (typeof window === "undefined") return null;
  
  // Option 1: Check for explicit VITE_WS_URL override
  const envWsUrl = RAW_VITE_WS_URL && String(RAW_VITE_WS_URL).trim();
  if (envWsUrl) {
    const validated = validateUrl(envWsUrl, "VITE_WS_URL");
    console.log("CONFIG Final wsUrl (explicit)=" + validated);
    return validated;
  }
  
  // Option 2: Derive from API_BASE
  if (API_BASE) {
    // Derive wsUrl from apiBase by replacing http(s):// with ws(s):// and appending /ws
    const wsUrl = API_BASE.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") + "/ws";
    console.log("CONFIG Final wsUrl (derived)=" + wsUrl);
    return wsUrl;
  }
  
  return null;
})();

export default function StandaloneApp() {
  const [mode, setMode] = useState("init"); // 'init', 'setup', 'creating', 'joining', 'connected'
  const [roomId, setRoomId] = useState("");
  const [hostKey, setHostKey] = useState("");
  
  // Setup state
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
  const [setupAgendaLinkError, setSetupAgendaLinkError] = useState("");
  const [setupAgendaImageUrl, setSetupAgendaImageUrl] = useState("");
  const [setupAgendaImageDataUrl, setSetupAgendaImageDataUrl] = useState("");
  const [setupAgendaImageError, setSetupAgendaImageError] = useState("");
  const [setupAgendaImageProcessing, setSetupAgendaImageProcessing] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [savedAgendaTemplates, setSavedAgendaTemplates] = useState(() => {
    // Load saved templates from localStorage on mount
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("agendaTemplates");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Validate structure: must be array of objects with name and items
          if (Array.isArray(parsed)) {
            return parsed.filter(template => 
              template && 
              typeof template.name === 'string' && 
              template.name.length > 0 &&
              Array.isArray(template.items) &&
              template.items.length > 0 &&
              template.items.every(item => 
                item && 
                typeof item.title === 'string' &&
                item.title.length > 0 &&
                typeof item.durationSec === 'number' &&
                !isNaN(item.durationSec) &&
                item.durationSec >= 0 &&
                (item.notes === undefined || typeof item.notes === 'string') &&
                (item.type === undefined || item.type === 'normal' || item.type === 'proposal') &&
                (item.description === undefined || typeof item.description === 'string') &&
                (item.link === undefined || typeof item.link === 'string') &&
                (item.category === undefined || typeof item.category === 'string') &&
                (item.onBallot === undefined || typeof item.onBallot === 'boolean') &&
                (item.imageUrl === undefined || typeof item.imageUrl === 'string') &&
                (item.imageDataUrl === undefined || typeof item.imageDataUrl === 'string')
              )
            );
          }
        } catch (e) {
          console.error("Failed to parse saved templates:", e);
        }
      }
    }
    return [];
  });
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  
  // Agenda Templates - League-specific templates for quick start
  const agendaTemplates = [
    {
      id: "annual-league-meeting",
      name: "Annual League Meeting",
      description: "Full season review and planning",
      agenda: [
        { title: "Call to Order & Roll Call", durationSec: 300, notes: "Welcome owners and confirm quorum" },
        { title: "Review of Last Season", durationSec: 900, notes: "Stats, standings, and highlights" },
        { title: "Financial Report", durationSec: 600, notes: "League finances and dues status" },
        { title: "Rule Changes Discussion", durationSec: 1200, notes: "Proposed amendments and voting" },
        { title: "Schedule & Key Dates", durationSec: 600, notes: "Draft date, playoffs, championship" },
        { title: "Commissioner Report", durationSec: 600, notes: "League updates and announcements" },
        { title: "Open Forum", durationSec: 900, notes: "Owner concerns and suggestions" },
        { title: "Closing Remarks", durationSec: 300, notes: "Next steps and adjournment" }
      ]
    },
    {
      id: "draft-lottery",
      name: "Draft Lottery",
      description: "Determine draft order for upcoming season",
      agenda: [
        { title: "Opening & Rules Overview", durationSec: 300, notes: "Explain lottery process and rules" },
        { title: "Verify Eligible Teams", durationSec: 300, notes: "Confirm teams in lottery pool" },
        { title: "Lottery Drawing", durationSec: 600, notes: "Conduct random drawing for draft positions" },
        { title: "Announce Draft Order", durationSec: 300, notes: "Reveal complete draft order" },
        { title: "Draft Date Confirmation", durationSec: 300, notes: "Finalize draft date and time" },
        { title: "Q&A", durationSec: 300, notes: "Address questions about draft process" }
      ]
    },
    {
      id: "trade-summit",
      name: "Trade Summit",
      description: "Facilitate trades and roster discussions",
      agenda: [
        { title: "Trade Deadline Reminder", durationSec: 180, notes: "Review deadline and rules" },
        { title: "Active Trade Proposals", durationSec: 900, notes: "Review and discuss pending trades" },
        { title: "Trade Block Announcements", durationSec: 600, notes: "Owners share available players" },
        { title: "Open Negotiation Period", durationSec: 1200, notes: "Free-form trade discussions" },
        { title: "Trade Processing", durationSec: 600, notes: "Commissioner reviews and approves trades" },
        { title: "Wrap-up", durationSec: 300, notes: "Final reminders and next steps" }
      ]
    }
  ];
  
  // Combine preset templates with saved templates
  const allAgendaTemplates = [
    ...agendaTemplates,
    ...savedAgendaTemplates.map(t => ({
      id: `saved-${t.name}`,
      name: t.name,
      description: "Custom template",
      agenda: t.items
    }))
  ];
  
  const loadTemplate = (template) => {
    setSetupAgenda(template.agenda.map(item => ({
      // Use crypto.randomUUID if available, otherwise fallback to timestamp-based ID
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `a${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...item
    })));
    setShowTemplateSelector(false);
  };
  
  const saveAsTemplate = () => {
    if (!newTemplateName.trim()) {
      alert("Please enter a template name");
      return;
    }
    
    if (setupAgenda.length === 0) {
      alert("Please add some agenda items before saving");
      return;
    }
    
    const template = {
      name: newTemplateName.trim(),
      items: setupAgenda.map(item => ({
        title: item.title,
        durationSec: item.durationSec,
        notes: item.notes || "",
        type: item.type || "normal",
        description: item.description || "",
        link: item.link || "",
        category: item.category || "",
        onBallot: item.onBallot || false,
        imageUrl: item.imageUrl || "",
        imageDataUrl: item.imageDataUrl || ""
      }))
    };
    
    const updated = [...savedAgendaTemplates, template];
    setSavedAgendaTemplates(updated);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("agendaTemplates", JSON.stringify(updated));
    }
    
    setNewTemplateName("");
    setShowSaveTemplateModal(false);
    alert(`Template "${template.name}" saved successfully!`);
  };
  
  // Name draft vs confirmed name flow:
  // - nameDraft: bound to input field, updates on every keystroke
  // - username: only updates when user confirms (Enter or Join button)
  // - usernameConfirmed: boolean flag that controls auto-connect
  const [nameDraft, setNameDraft] = useState(() => {
    // Load persisted username from localStorage if available
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evw_username");
      // Basic validation: max 100 chars, no control chars, no HTML special chars
      if (stored && stored.length <= 100 && 
          !/[\x00-\x1F\x7F<>"']/.test(stored)) {
        return stored;
      }
    }
    return "";
  });
  const [username, setUsername] = useState(() => {
    // If we have a persisted username, set it as confirmed immediately
    // This enables auto-reconnect for hosts who refresh
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evw_username");
      if (stored && stored.length <= 100 && 
          !/[\x00-\x1F\x7F<>"']/.test(stored)) {
        return stored;
      }
    }
    return "";
  });
  const [usernameConfirmed, setUsernameConfirmed] = useState(() => {
    // If we have a persisted username on load, mark it as confirmed
    // This allows hosts to auto-reconnect without retyping
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evw_username");
      return !!(stored && stored.length <= 100 && !/[\x00-\x1F\x7F<>"']/.test(stored));
    }
    return false;
  });
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
  
  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Connection diagnostics state
  const [connectionDiagnostics, setConnectionDiagnostics] = useState({
    lastAttemptTime: null,
    lastWsUrl: null,
    lastCloseCode: null,
    lastCloseReason: null,
    lastError: null,
    joinSent: false,
    joinAckReceived: false,
    healthCheckStatus: null,
  });
  const [connectionTimeout, setConnectionTimeout] = useState(false);
  
  // Last session tracking for rejoin prompt
  const [lastSession, setLastSession] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evw_last_session");
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
  
  // Detect popout mode from URL
  const inPopoutMode = isPopoutMode();
  
  // Viewer invite mode tracking
  const [isViewerInviteMode, setIsViewerInviteMode] = useState(false);
  
  // Local tick for meeting elapsed timer (updates every second)
  const [localTick, setLocalTick] = useState(Date.now());
  
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const timePingIntervalRef = useRef(null);
  const localTimerIntervalRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const pendingTemplatesRef = useRef(null);

  // Helper: safely update templates in state without creating a partial state from null.
  // If state doesn't exist yet, stores templates in a ref to be merged when STATE arrives.
  const updateTemplatesInState = (templates) => {
    setState(prev => {
      if (!prev) {
        pendingTemplatesRef.current = templates;
        return prev;
      }
      return { ...prev, templates };
    });
  };

  // Parse URL on mount - support multiple URL patterns for flexibility
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // DEBUG: Enhanced logging for Vercel 404 investigation
    console.group('🔍 [URL PARSING DEBUG]');
    console.log('Full URL:', window.location.href);
    console.log('Origin:', window.location.origin);
    console.log('Pathname:', path);
    console.log('Search:', window.location.search);
    console.groupEnd();
    
    // Extract roomId - Priority: query param > path-based
    // This ensures /?room=X works reliably on Vercel
    let urlRoomId = params.get("room");
    
    // Fallback: Extract from path /:roomId or /room/:roomId for backward compatibility
    if (!urlRoomId && path && path !== '/') {
      const pathParts = path.split('/').filter(Boolean);
      if (pathParts.length === 1) {
        // Pattern: /:roomId
        urlRoomId = pathParts[0];
      } else if (pathParts.length === 2 && pathParts[0] === 'room') {
        // Pattern: /room/:roomId
        urlRoomId = pathParts[1];
      }
    }
    
    const urlHostKey = params.get("hostKey");
    const mode = params.get("mode");
    // Support both ?mode=popout and legacy ?popout=1
    const isPopout = mode === 'popout' || params.get("popout") === '1';
    const asMode = params.get("as");
    
    // Check for viewer invite mode
    const isViewerMode = mode === 'viewer';
    
    console.group('🔍 [PARSED URL PARAMS]');
    console.log('Room ID:', urlRoomId || '(none)');
    console.log('Host Key:', urlHostKey ? '***PRESENT***' : '(none)');
    console.log('Mode:', mode || '(none)');
    console.log('Popout Mode:', isPopout);
    console.log('Viewer Mode:', isViewerMode);
    console.log('As Mode:', asMode || '(none)');
    console.groupEnd();
    
    // Set viewer invite mode if mode=viewer and room is present
    if (isViewerMode && urlRoomId) {
      setIsViewerInviteMode(true);
    }
    
    // Check if URL specifies attendee view mode
    const forceAttendeeView = isAttendeeViewMode();
    if (forceAttendeeView) {
      setViewAsAttendee(true);
    }
    
    if (urlRoomId) {
      setRoomId(urlRoomId);
      if (urlHostKey) {
        setHostKey(urlHostKey);
      }
      // Don't set mode to "joining" yet - wait for username
      // The auto-connect effect will trigger when username is available
    }
  }, []);

  // Auto-connect when we have roomId + confirmed username but haven't started connecting yet
  // This handles both: URL with ?room=X and manual "Join Room" button click
  useEffect(() => {
    // Only auto-connect if:
    // 1. We have roomId and confirmed username
    // 2. We're in init mode (not already connecting/connected)
    // 3. Not disconnected due to timeout (user should manually retry)
    // Note: hostKey is in deps to capture it at connection time, but won't retrigger
    // since mode will no longer be "init" after first connection attempt
    if (roomId && usernameConfirmed && username.trim() && mode === "init" && !connectionTimeout && connectionStatus === "disconnected") {
      console.log("[AUTO-CONNECT] Initiating connection: roomId=" + roomId + ", username=" + username);
      setMode("joining"); // Set mode to joining to show connecting UI
      connectToRoom(roomId, hostKey || null);
    }
  }, [roomId, usernameConfirmed, username, hostKey, mode, connectionStatus, connectionTimeout]);

  // Persist username to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if (username && username.trim()) {
      localStorage.setItem("evw_username", username);
    } else {
      // Clear localStorage if username is empty
      localStorage.removeItem("evw_username");
    }
  }, [username]);

  // Save last active session when connected (for rejoin prompt)
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if (mode === "connected" && roomId && username) {
      const sessionInfo = {
        roomId,
        hostKey, // Store hostKey to preserve role on rejoin
        username,
        timestamp: Date.now(),
      };
      localStorage.setItem("evw_last_session", JSON.stringify(sessionInfo));
      setLastSession(sessionInfo);
    }
  }, [mode, roomId, hostKey, username]);

  // Check for rejoin opportunity on mount (root URL without room param)
  useEffect(() => {
    // Only show rejoin prompt if:
    // 1. We have a stored last session
    // 2. We're not already on a room URL
    // 3. We're in init mode
    if (lastSession && !roomId && mode === "init") {
      setShowRejoinPrompt(true);
    }
  }, []); // Run only once on mount

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

  // Local tick for meeting elapsed timer - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute meeting elapsed seconds based on server meetingStartedAtMs + local tick
  const meetingElapsedSec = (() => {
    if (!state?.meetingTimer?.running || !state?.meetingTimer?.startedAtMs) {
      return 0;
    }
    const elapsedMs = localTick - state.meetingTimer.startedAtMs;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  })();

  // Confirm username - validates and commits nameDraft to username
  const confirmUsername = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError("Please enter your name");
      return false;
    }
    setUsername(trimmed);
    setUsernameConfirmed(true);
    setError(null);
    return true;
  };

  // Check if join form is ready for submission
  const canSubmitJoin = () => {
    return nameDraft.trim() && roomId.trim();
  };

  // Handle Enter key on join form inputs
  const handleJoinFormEnter = (e) => {
    if (e.key === 'Enter' && canSubmitJoin()) {
      e.preventDefault();
      joinRoom();
    }
  };

  // Create new room
  const createRoom = async () => {
    if (!confirmUsername()) {
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
      
      // Update URLs using link helpers
      const viewer = generateViewerLink(data.roomId);
      const host = generateHostLink(data.roomId, data.hostKey);
      
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
    // Update URL using query params for consistency with share links
    const newUrl = `${window.location.origin}/?room=${roomId}&hostKey=${hostKey}&mode=host`;
    window.history.pushState({}, '', newUrl);
    // Connect to room
    connectToRoom(roomId, hostKey);
  };

  // Start meeting with setup configuration
  const startMeetingWithSetup = async () => {
    if (!confirmUsername()) {
      return;
    }
    
    setMode("creating");
    setError(null);
    
    try {
      // Use the global API_BASE configuration
      if (!API_BASE) {
        throw new Error("API base URL not configured");
      }
      
      // Create room first
      const res = await fetch(`${API_BASE}/room/create`, { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to create room");
        setMode("setup");
        return;
      }
      
      setRoomId(data.roomId);
      setHostKey(data.hostKey);
      
      // Update URLs using link helpers
      const viewer = generateViewerLink(data.roomId);
      const host = generateHostLink(data.roomId, data.hostKey);
      
      setViewerUrl(viewer);
      setHostUrl(host);
      
      // Connect to room and send setup + start
      const newUrl = `${window.location.origin}/?room=${data.roomId}&hostKey=${data.hostKey}&mode=host`;
      window.history.pushState({}, '', newUrl);
      
      // Connect and wait for websocket to be ready
      connectToRoom(data.roomId, data.hostKey, {
        onConnected: (ws) => {
          // Send setup update (IDs already assigned when items were created)
          ws.send(JSON.stringify({
            type: "SETUP_UPDATE",
            meetingName: setupMeetingName,
            agenda: setupAgenda
          }));
          
          // Send meeting start
          ws.send(JSON.stringify({
            type: "MEETING_START",
            startTimer: true
          }));
          
          // Show share links modal
          setShowLinks(true);
        }
      });
      
    } catch (err) {
      console.error("Failed to create room:", err);
      setError(err.message || "Network error. Please try again.");
      setMode("setup");
    }
  };

  // Join existing room
  const joinRoom = () => {
    if (!confirmUsername()) {
      return;
    }
    
    if (!roomId.trim()) {
      setError("Please enter a room ID");
      return;
    }
    
    setMode("joining"); // Set mode to show connecting UI
    connectToRoom(roomId, hostKey || null);
  };

  // Rejoin last session (from rejoin prompt)
  const rejoinLastSession = () => {
    if (!lastSession) return;
    
    console.log("[REJOIN] Rejoining last session:", lastSession.roomId);
    
    // Set state from last session
    setRoomId(lastSession.roomId);
    setHostKey(lastSession.hostKey || null);
    setUsername(lastSession.username);
    setUsernameConfirmed(true);
    setShowRejoinPrompt(false);
    
    // Auto-connect effect will trigger since we now have roomId + confirmed username
  };

  // Dismiss rejoin prompt
  const dismissRejoinPrompt = () => {
    setShowRejoinPrompt(false);
    // Clear last session from storage
    if (typeof window !== "undefined") {
      localStorage.removeItem("evw_last_session");
    }
    setLastSession(null);
  };

  // Calculate exponential backoff delay
  const calculateBackoff = (attempts) => {
    // 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(Math.pow(2, attempts) * 1000, 30000);
    return delay;
  };

  // Connect to WebSocket
  const connectToRoom = (room, key, options = {}) => {
    const attemptTime = Date.now();
    console.group(`[WS CONNECTION ${new Date(attemptTime).toISOString()}]`);
    console.log("Room:", room);
    console.log("Has Host Key:", !!key);
    
    // Instrumentation: log username state before connection
    console.log("[USERNAME STATE]", {
      nameDraft: nameDraft,
      username: username,
      usernameConfirmed: usernameConfirmed,
      trimmed: username.trim(),
    });
    
    // Block connection if username is empty
    if (!username || !username.trim()) {
      console.error("[WS] Cannot connect: username is empty");
      console.groupEnd();
      setError("Please enter your name before joining");
      setMode("init");
      setConnectionStatus("disconnected");
      setConnectionDiagnostics(prev => ({
        ...prev,
        lastAttemptTime: attemptTime,
        lastError: "Username is empty",
      }));
      return;
    }
    
    console.log("Username:", username);
    console.log("Client ID:", clientId);
    
    if (!WS_URL) {
      console.error("[WS] No WS_URL configured");
      console.groupEnd();
      setError("WebSocket URL not configured. Check VITE_WORKER_DOMAIN environment variable.");
      setMode("init");
      setConnectionStatus("disconnected");
      setConnectionDiagnostics(prev => ({
        ...prev,
        lastAttemptTime: attemptTime,
        lastError: "No WS_URL configured",
      }));
      return;
    }
    
    // Clear any existing reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setError(null);
    setConnectionStatus("reconnecting");
    setConnectionTimeout(false);
    
    const url = `${WS_URL}?room=${room}`;
    console.log("[WS] URL:", url);
    console.log("[WS] Attempting connection...");
    console.groupEnd();
    
    // Update diagnostics
    setConnectionDiagnostics(prev => ({
      ...prev,
      lastAttemptTime: attemptTime,
      lastWsUrl: url,
      joinSent: false,
      joinAckReceived: false,
      lastError: null,
      lastCloseCode: null,
      lastCloseReason: null,
    }));
    
    // Set connection timeout (10 seconds)
    connectionTimeoutRef.current = setTimeout(() => {
      // Only trigger timeout if:
      // 1. WebSocket exists and is still CONNECTING (readyState 0) or never opened
      // 2. Mode is still "joining" (not already connected)
      // Skip if CLOSING (2) or CLOSED (3) as close handler will deal with it
      if (wsRef.current && mode === "joining") {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.error("[WS TIMEOUT] Connection failed to establish in 10 seconds");
          console.error("[WS TIMEOUT] Final readyState:", state, 
            state === 0 ? "(CONNECTING)" : "(OPEN but no HELLO_ACK)");
          setConnectionTimeout(true);
          setConnectionStatus("disconnected");
          
          // Close the websocket if still connecting or open but not fully joined
          wsRef.current.close();
          
          // Perform health check
          if (API_BASE) {
            fetch(`${API_BASE}/health`)
              .then(res => {
                if (!res.ok) {
                  throw new Error(`HTTP ${res.status}`);
                }
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                  return res.json();
                } else {
                  return res.text().then(text => ({ raw: text }));
                }
              })
              .then(data => {
                console.log("[HEALTH CHECK] Success:", data);
                setConnectionDiagnostics(prev => ({
                  ...prev,
                  healthCheckStatus: 'success: ' + JSON.stringify(data),
                }));
              })
              .catch(err => {
                console.error("[HEALTH CHECK] Failed:", err);
                setConnectionDiagnostics(prev => ({
                  ...prev,
                  healthCheckStatus: 'failed: ' + err.message,
                }));
              });
          }
        }
      }
    }, 10000);
    
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.addEventListener("open", () => {
      const openTime = Date.now();
      console.log(`[WS OPEN ${new Date(openTime).toISOString()}] Connected (${openTime - attemptTime}ms)`);
      
      // Clear timeout since connection succeeded
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Reset reconnection state on successful connection
      setReconnectAttempts(0);
      setReconnectDelay(0);
      setConnectionStatus("connected");
      setShowConnectedBanner(true);
      setConnectionTimeout(false);
      
      // Instrumentation: log username state right before sending HELLO
      console.log("[HELLO PREP - USERNAME STATE]", {
        nameDraft: nameDraft,
        username: username,
        usernameConfirmed: usernameConfirmed,
      });
      
      // Prepare HELLO message
      const helloMsg = {
        type: "HELLO",
        roomId: room,
        clientId: clientId,
        hostKey: key || undefined,  // Only include if provided
        displayName: username,
      };
      
      // Instrumentation: log HELLO payload (redact hostKey)
      console.log("[WS SEND] HELLO:", {
        ...helloMsg,
        hostKey: helloMsg.hostKey ? "***REDACTED***" : undefined
      });
      
      ws.send(JSON.stringify(helloMsg));
      
      // Update diagnostics
      setConnectionDiagnostics(prev => ({
        ...prev,
        joinSent: true,
      }));
      
      // Call onConnected callback if provided
      if (options.onConnected) {
        options.onConnected(ws);
      }
      
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
        console.log(`[WS RECV] ${msg.type}`, msg);
        
        if (msg.type === "HELLO_ACK") {
          console.log("[WS] HELLO_ACK received - connection established");
          setIsHost(msg.isHost);
          setMode("connected");
          
          // Clear connection timeout on successful join
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setConnectionTimeout(false);
          
          // Update diagnostics
          setConnectionDiagnostics(prev => ({
            ...prev,
            joinAckReceived: true,
          }));
          
          // Calculate initial time offset
          if (msg.serverNow) {
            const offset = msg.serverNow - Date.now();
            setServerTimeOffset(offset);
          }
          
          // Load templates from HELLO_ACK (persistent storage)
          // Store in ref first; merge into state only if state already exists
          // to avoid creating a partial state object from null (which causes render crashes)
          if (msg.templates) {
            console.log(`[WS] HELLO_ACK - received ${msg.templates.length} templates from persistent storage`);
            updateTemplatesInState(msg.templates);
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
          // Merge pending templates from HELLO_ACK if they haven't been applied yet
          if (pendingTemplatesRef.current) {
            const templates = pendingTemplatesRef.current;
            pendingTemplatesRef.current = null;
            setState({ ...msg.state, templates });
          } else {
            setState(msg.state);
          }
          
          // Update server time offset if provided
          if (msg.serverNow) {
            const offset = msg.serverNow - Date.now();
            setServerTimeOffset(offset);
          }
          
          // Update isHost based on current state (handles host changes)
          if (msg.state && msg.state.hostUserId) {
            const nowHost = msg.state.hostUserId === clientId;
            if (nowHost !== isHost) {
              console.log("[HOST STATUS CHANGE]", { wasHost: isHost, nowHost });
              setIsHost(nowHost);
            }
          }
        } else if (msg.type === "CLAIM_HOST_ACK") {
          console.log("[CLAIM_HOST] Success - now host");
          setIsHost(true);
          setError(null);
        } else if (msg.type === "TEMPLATE_LIST") {
          // Template list response from server
          console.log(`[WS] TEMPLATE_LIST - received ${msg.templates?.length || 0} templates`);
          if (msg.templates) {
            updateTemplatesInState(msg.templates);
          }
        } else if (msg.type === "TEMPLATE_SAVED" || msg.type === "TEMPLATE_DELETED" || msg.type === "TEMPLATES_IMPORTED") {
          // Template operations update the state with new templates list
          console.log(`[WS] ${msg.type} - updating templates in state`);
          if (msg.templates) {
            updateTemplatesInState(msg.templates);
          }
        } else if (msg.type === "ERROR") {
          console.error("[WS] Error:", msg.error);
          const errorMsg = msg.message || msg.error;
          setError(`Server error: ${errorMsg}`);
        }
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    });
    
    ws.addEventListener("close", (event) => {
      // Only update state if this WebSocket is still the current one
      // This prevents stale close events from old connections from overwriting the state
      if (wsRef.current === ws) {
        console.log(`[WS CLOSE] Code: ${event.code}, Reason: ${event.reason || '(none)'}`);
        setConnectionStatus("disconnected");
        
        // Update diagnostics
        setConnectionDiagnostics(prev => ({
          ...prev,
          lastCloseCode: event.code,
          lastCloseReason: event.reason || '(none)',
        }));
        
        // Clear intervals
        if (timePingIntervalRef.current) {
          clearInterval(timePingIntervalRef.current);
          timePingIntervalRef.current = null;
        }
        
        // Clear connection timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
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
        console.error("[WS ERROR]", err);
        const errorMsg = err.message || "Connection error";
        setError("Connection error. Retrying...");
        
        // Update diagnostics
        setConnectionDiagnostics(prev => ({
          ...prev,
          lastError: errorMsg,
        }));
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
      // Allow negative values for overtime display
      const updateTimer = () => {
        const serverNow = Date.now() + serverTimeOffset;
        const remaining = Math.ceil((state.timer.endsAtMs - serverNow) / 1000);
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
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
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
  const addAgenda = (title, durationSec, notes, itemType, description, link, category, imageUrl, imageDataUrl) => {
    // Note: using itemType parameter name to avoid shadowing message.type field
    sendMessage({ 
      type: "AGENDA_ADD", 
      title, 
      durationSec, 
      notes, 
      itemType: itemType || "regular", 
      description: description || "", 
      link: link || "", 
      category: category || "",
      imageUrl: imageUrl || "",
      imageDataUrl: imageDataUrl || ""
    });
  };

  const updateAgenda = (agendaId, updates) => {
    // Extract 'type' from updates to avoid overwriting the message 'type' field
    // Send it as 'itemType' instead, matching the AGENDA_ADD convention
    const { type: itemType, ...rest } = updates;
    sendMessage({ type: "AGENDA_UPDATE", agendaId, ...rest, ...(itemType !== undefined ? { itemType } : {}) });
  };

  const deleteAgenda = (agendaId) => {
    sendMessage({ type: "AGENDA_DELETE", agendaId });
  };

  const toggleBallot = (agendaId) => {
    sendMessage({ type: "AGENDA_TOGGLE_BALLOT", agendaId });
  };

  const reorderAgenda = (orderedIds) => {
    console.log('[StandaloneApp] reorderAgenda called with orderedIds:', orderedIds);
    console.log('[StandaloneApp] wsRef.current:', wsRef.current);
    console.log('[StandaloneApp] WebSocket readyState:', wsRef.current?.readyState);
    sendMessage({ type: "AGENDA_REORDER", orderedIds });
    console.log('[StandaloneApp] Message sent');
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

  // Host handoff actions
  const releaseHost = () => {
    if (!isHost) return;
    if (confirm("Release host privileges? Another user with the host key can then claim host.")) {
      sendMessage({ type: "RELEASE_HOST" });
    }
  };

  const claimHost = () => {
    if (isHost) return; // Already host
    if (!hostKey) {
      setError("Host key required to claim host privileges");
      return;
    }
    sendMessage({ type: "CLAIM_HOST" });
  };

  return (
    <div className={`appShell ${inPopoutMode ? "isPopout" : ""}`}>
      {/* Connection Status Banners - only show when connected mode */}
      {mode === "connected" && connectionStatus === "disconnected" && (
        <div className="banner banner-danger" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderRadius: 0,
          borderLeft: "none",
          borderTop: "4px solid var(--color-danger)",
          textAlign: "center",
          fontWeight: "var(--font-weight-bold)",
        }}>
          ⚠️ Disconnected - Reconnecting in {Math.ceil(reconnectDelay / 1000)}s (attempt {reconnectAttempts})
        </div>
      )}

      {mode === "connected" && connectionStatus === "reconnecting" && (
        <div className="banner banner-warning" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderRadius: 0,
          borderLeft: "none",
          borderTop: "4px solid var(--color-warning)",
          textAlign: "center",
          fontWeight: "var(--font-weight-bold)",
        }}>
          🔄 Reconnecting... (attempt {reconnectAttempts})
        </div>
      )}

      {mode === "connected" && connectionStatus === "connected" && showConnectedBanner && (
        <div className="banner banner-success" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderRadius: 0,
          borderLeft: "none",
          borderTop: "4px solid var(--color-success)",
          textAlign: "center",
          fontWeight: "var(--font-weight-bold)",
        }}>
          ✓ Connected
        </div>
      )}

      {/* Configuration Error Banner */}
      {CONFIG_ERROR.showBanner && CONFIG_ERROR.message && (
        <div className="banner banner-danger" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderRadius: 0,
          borderLeft: "none",
          borderTop: "4px solid var(--color-danger)",
          textAlign: "center",
          fontWeight: "var(--font-weight-bold)",
        }}>
          ❌ Configuration Error: {CONFIG_ERROR.message}
        </div>
      )}

      {/* Host Privileges Lost Warning */}
      {showHostLostWarning && (
        <div className="card card-elevated" style={{
          position: "fixed",
          top: connectionStatus === "connected" && showConnectedBanner ? "60px" : "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1001,
          maxWidth: "400px",
          width: "90%",
          padding: "var(--spacing-xl)",
        }}>
          <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--spacing-md)" }}>
            ⚠️ Host Privileges Lost
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--spacing-lg)", opacity: 0.9 }}>
            You are now a viewer. You can no longer control the meeting.
          </div>
          <button
            onClick={() => setShowHostLostWarning(false)}
            className="btn btnGhost btnFull"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {error && mode !== "connected" && (
        <div className="banner banner-danger" style={{ 
          margin: "var(--spacing-xl)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <span><strong>❌ Error:</strong> {error}</span>
          <button
            onClick={() => setError(null)}
            className="btn btnIcon btnGhost"
            style={{ padding: "var(--spacing-sm)" }}
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
          backgroundColor: "var(--color-overlay)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}>
          <div className="card card-elevated" style={{
            maxWidth: "600px",
            width: "90%",
          }}>
            <div className="cardHeader">
              <h2 className="cardTitle">🎉 Room Created!</h2>
            </div>
            <div className="cardBody">
              <p style={{ marginBottom: "var(--spacing-xl)" }}>
                Room ID: <span className="pill pill-accent">{roomId}</span>
              </p>
              
              <div style={{ marginBottom: "var(--spacing-xl)" }}>
                <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-sm)" }}>
                  👥 Viewer Link (share with attendees):
                </h3>
                <div style={{
                  padding: "var(--spacing-md)",
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-md)",
                  wordBreak: "break-all",
                  fontSize: "var(--font-size-sm)",
                  fontFamily: "var(--font-family-mono)",
                  marginBottom: "var(--spacing-sm)"
                }}>
                  {viewerUrl}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(viewerUrl)}
                  className="btn btnPrimary btnSmall"
                >
                  📋 Copy Viewer Link
                </button>
              </div>
              
              <div style={{ marginBottom: "var(--spacing-xl)" }}>
                <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-sm)" }}>
                  🔑 Host Link (keep this secret!):
                </h3>
                <div style={{
                  padding: "var(--spacing-md)",
                  backgroundColor: "rgba(191, 153, 68, 0.1)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: "var(--radius-md)",
                  wordBreak: "break-all",
                  fontSize: "var(--font-size-sm)",
                  fontFamily: "var(--font-family-mono)",
                  marginBottom: "var(--spacing-sm)"
                }}>
                  {hostUrl}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(hostUrl)}
                  className="btn btnAccent btnSmall"
                >
                  📋 Copy Host Link
                </button>
              </div>
              
              <div className="banner banner-warning" style={{ marginBottom: "var(--spacing-xl)" }}>
                <strong>Important:</strong> Save the host link to control the meeting. 
                The viewer link is safe to share publicly.
              </div>
              
              <button
                onClick={startMeeting}
                className="btn btnPrimary btnLarge btnFull"
              >
                Start Meeting
              </button>
            </div>
          </div>
        </div>
      )}
      
      {mode === "setup" && (
        <div className="container container-narrow" style={{ paddingTop: "var(--spacing-2xl)", paddingBottom: "var(--spacing-4xl)" }}>
          <div className="brandHeader">
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
              {/* Template Selector */}
              {setupAgenda.length === 0 && (
                <div style={{ 
                  marginBottom: "var(--spacing-xl)",
                  padding: "var(--spacing-lg)",
                  backgroundColor: "rgba(191, 153, 68, 0.1)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "var(--radius-md)"
                }}>
                  <div style={{ 
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "var(--spacing-md)"
                  }}>
                    <div>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--spacing-xs)" }}>
                        📋 Quick Start with Templates
                      </div>
                      <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.8 }}>
                        Choose a pre-made agenda to get started quickly
                      </div>
                    </div>
                  </div>
                  <button 
                    className="btn btnAccent btnFull"
                    onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                  >
                    {showTemplateSelector ? "Hide Templates" : "Browse Templates"}
                  </button>
                </div>
              )}
              
              {/* Template Grid */}
              {showTemplateSelector && (
                <div style={{ 
                  marginBottom: "var(--spacing-xl)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "var(--spacing-md)"
                }}>
                  {allAgendaTemplates.map(template => (
                    <div 
                      key={template.id}
                      className="card card-compact"
                      style={{ 
                        cursor: "pointer",
                        transition: "all var(--transition-fast)"
                      }}
                      onClick={() => loadTemplate(template)}
                    >
                      <div className="cardHeader">
                        <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-base)" }}>
                          {template.name}
                        </div>
                      </div>
                      <div className="cardBody">
                        <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.8, marginBottom: "var(--spacing-sm)" }}>
                          {template.description}
                        </div>
                        <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.6 }}>
                          {template.agenda.length} items • {Math.ceil(template.agenda.reduce((sum, item) => sum + item.durationSec, 0) / 60)} minutes
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Existing Agenda Items */}
              {setupAgenda.length > 0 && (
                <div style={{ marginBottom: "var(--spacing-lg)" }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: "var(--spacing-md)"
                  }}>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", opacity: 0.8 }}>
                      {setupAgenda.length} {setupAgenda.length === 1 ? 'item' : 'items'} • {Math.ceil(setupAgenda.reduce((sum, item) => sum + item.durationSec, 0) / 60)} minutes total
                    </div>
                    <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
                      <button 
                        className="btn btnGhost btnSmall"
                        onClick={() => setShowSaveTemplateModal(true)}
                        title="Save current agenda as a template"
                      >
                        💾 Save as Template
                      </button>
                      <button 
                        className="btn btnGhost btnSmall"
                        onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                        title="Load a template (replaces current agenda)"
                      >
                        📋 Templates
                      </button>
                      <button 
                        className="btn btnGhost btnSmall"
                        onClick={() => {
                          if (confirm("Clear all agenda items?")) {
                            setSetupAgenda([]);
                          }
                        }}
                      >
                        🗑 Clear All
                      </button>
                    </div>
                  </div>
                  {setupAgenda.map((item) => (
                    <div 
                      key={item.id} 
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
                        <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{item.title}</div>
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
                          setSetupAgenda(setupAgenda.filter((a) => a.id !== item.id));
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
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setSetupAgendaSeconds(val);
                        } else {
                          const num = parseInt(val);
                          if (!isNaN(num) && num >= 0 && num <= 59) {
                            setSetupAgendaSeconds(val);
                          }
                        }
                      }}
                      placeholder="Seconds"
                      min="0"
                      max="59"
                    />
                  </div>
                </div>
                
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
                      onChange={(e) => {
                        setSetupAgendaLink(e.target.value);
                        const validation = validateAgendaLink(e.target.value);
                        setSetupAgendaLinkError(validation.error);
                      }}
                      placeholder="https://example.com/proposal"
                      style={{ marginBottom: setupAgendaLinkError ? "var(--spacing-xs)" : "var(--spacing-md)" }}
                    />
                    {setupAgendaLinkError && (
                      <div style={{
                        color: "var(--color-danger, #dc3545)",
                        fontSize: "var(--font-size-sm)",
                        marginBottom: "var(--spacing-md)"
                      }}>
                        {setupAgendaLinkError}
                      </div>
                    )}
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
                
                <label className="label">Image (optional)</label>
                <div style={{ marginBottom: "var(--spacing-md)" }}>
                  {/* Upload from computer */}
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        setSetupAgendaImageProcessing(true);
                        setSetupAgendaImageError("");
                        
                        const result = await processImageFile(file);
                        setSetupAgendaImageProcessing(false);
                        
                        if (result.success) {
                          setSetupAgendaImageDataUrl(result.dataUrl);
                          setSetupAgendaImageUrl(""); // Clear URL if data URL is set
                        } else {
                          setSetupAgendaImageError(result.error);
                        }
                        
                        // Reset file input
                        e.target.value = "";
                      }}
                      style={{
                        width: "100%",
                        padding: "var(--spacing-sm)",
                        fontSize: "var(--font-size-sm)"
                      }}
                      disabled={setupAgendaImageProcessing}
                    />
                  </div>
                  
                  {/* Or use URL */}
                  <div style={{ marginTop: "var(--spacing-sm)" }}>
                    <input 
                      className="input"
                      value={setupAgendaImageUrl}
                      onChange={(e) => {
                        const url = e.target.value;
                        setSetupAgendaImageUrl(url);
                        const validation = validateImageUrl(url);
                        if (!validation.valid) {
                          setSetupAgendaImageError(validation.error);
                        } else {
                          setSetupAgendaImageError("");
                          if (url) {
                            setSetupAgendaImageDataUrl(""); // Clear data URL if URL is set
                          }
                        }
                      }}
                      placeholder="Or enter image URL (https://...)"
                      style={{ marginBottom: "var(--spacing-xs)" }}
                      disabled={setupAgendaImageProcessing}
                    />
                  </div>
                  
                  {/* Processing indicator */}
                  {setupAgendaImageProcessing && (
                    <div style={{
                      color: "var(--color-accent)",
                      fontSize: "var(--font-size-sm)",
                      marginBottom: "var(--spacing-sm)"
                    }}>
                      Processing image...
                    </div>
                  )}
                  
                  {/* Error display */}
                  {setupAgendaImageError && (
                    <div style={{
                      color: "var(--color-danger, #dc3545)",
                      fontSize: "var(--font-size-sm)",
                      marginBottom: "var(--spacing-sm)"
                    }}>
                      {setupAgendaImageError}
                    </div>
                  )}
                  
                  {/* Preview */}
                  {(setupAgendaImageDataUrl || setupAgendaImageUrl) && (
                    <div style={{
                      marginTop: "var(--spacing-sm)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--spacing-sm)",
                      backgroundColor: "var(--color-bg-subtle, #2a2a2a)"
                    }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "var(--spacing-sm)"
                      }}>
                        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                          Preview
                        </span>
                        <button
                          className="btn"
                          onClick={() => {
                            setSetupAgendaImageDataUrl("");
                            setSetupAgendaImageUrl("");
                            setSetupAgendaImageError("");
                          }}
                          style={{
                            padding: "var(--spacing-xs) var(--spacing-sm)",
                            fontSize: "var(--font-size-sm)",
                            backgroundColor: "var(--color-danger, #dc3545)"
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <img 
                        src={setupAgendaImageDataUrl || setupAgendaImageUrl}
                        alt="Preview"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "150px",
                          objectFit: "contain",
                          display: "block",
                          margin: "0 auto"
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                          setSetupAgendaImageError("Failed to load image");
                        }}
                      />
                    </div>
                  )}
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
                
                <button 
                  className="btn btnSecondary btnFull"
                  onClick={() => {
                    if (!setupAgendaTitle) return;
                    
                    // Validate link if it's a proposal
                    if (setupAgendaType === "proposal" && setupAgendaLink) {
                      const validation = validateAgendaLink(setupAgendaLink);
                      if (!validation.valid) {
                        setSetupAgendaLinkError(validation.error);
                        return;
                      }
                    }
                    
                    // Block if there's an image error
                    if (setupAgendaImageError) {
                      return;
                    }
                    
                    const mins = parseInt(setupAgendaMinutes) || 0;
                    const secs = parseInt(setupAgendaSeconds) || 0;
                    // Safety clamp (redundant with input validation but defensive)
                    const validSecs = Math.max(0, Math.min(59, secs));
                    const totalSeconds = mins * 60 + validSecs;
                    
                    setSetupAgenda([
                      ...setupAgenda,
                      {
                        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `a${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        title: setupAgendaTitle,
                        durationSec: totalSeconds,
                        notes: setupAgendaNotes,
                        type: setupAgendaType,
                        description: setupAgendaType === "proposal" ? setupAgendaDescription : "",
                        link: setupAgendaType === "proposal" ? setupAgendaLink : "",
                        category: setupAgendaCategory,
                        onBallot: false,
                        imageUrl: setupAgendaImageUrl || "",
                        imageDataUrl: setupAgendaImageDataUrl || ""
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
                    setSetupAgendaLinkError("");
                    setSetupAgendaImageUrl("");
                    setSetupAgendaImageDataUrl("");
                    setSetupAgendaImageError("");
                  }}
                  disabled={!setupAgendaTitle || (setupAgendaType === "proposal" && setupAgendaLinkError) || setupAgendaImageError || setupAgendaImageProcessing}
                >
                  + Add to Agenda
                </button>
              </div>
            </div>
          </div>
          
          {/* Start Meeting Button */}
          <button 
            className="btn btnPrimary btnLarge btnFull"
            onClick={startMeetingWithSetup}
          >
            🚀 Start Meeting
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
          
          {/* Save Template Modal */}
          {showSaveTemplateModal && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "var(--color-overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
              backdropFilter: "blur(4px)",
            }}>
              <div className="card card-elevated" style={{
                maxWidth: "500px",
                width: "90%",
              }}>
                <div className="cardHeader">
                  <h2 className="cardTitle">💾 Save as Template</h2>
                </div>
                <div className="cardBody">
                  <p style={{ marginBottom: "var(--spacing-lg)", opacity: 0.9 }}>
                    Save your current agenda ({setupAgenda.length} items) as a reusable template.
                  </p>
                  
                  <label className="label">Template Name</label>
                  <input
                    className="input"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTemplateName.trim()) {
                        e.preventDefault();
                        saveAsTemplate();
                      }
                    }}
                    placeholder="e.g., Weekly Team Standup"
                    autoFocus
                    style={{ marginBottom: "var(--spacing-lg)" }}
                  />
                  
                  <div style={{ display: "flex", gap: "var(--spacing-md)" }}>
                    <button
                      onClick={() => {
                        setShowSaveTemplateModal(false);
                        setNewTemplateName("");
                      }}
                      className="btn btnGhost btnFull"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveAsTemplate}
                      className="btn btnPrimary btnFull"
                      disabled={!newTemplateName.trim() || setupAgenda.length === 0}
                    >
                      Save Template
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {mode === "init" && (
        <div className="container container-narrow" style={{ 
          padding: "var(--spacing-2xl) var(--spacing-xl)",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh"
        }}>
          <div className="brandHeader">
            <img src={logo} alt="League Meeting" className="brandLogo" />
            <h1 className="brandTitle">East v. West</h1>
            <p className="brandSubtitle">League Meeting</p>
          </div>
          
          {import.meta.env.DEV && (
            <div className="devBadge">
              UI: {UI_VERSION}
            </div>
          )}
          
          {/* Rejoin Last Meeting Prompt */}
          {showRejoinPrompt && lastSession && (
            <div style={{
              marginTop: "var(--spacing-xl)",
              padding: "var(--spacing-lg)",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--spacing-lg)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "var(--font-weight-bold)", marginBottom: "var(--spacing-xs)" }}>
                  Rejoin Last Meeting?
                </div>
                <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.9 }}>
                  Room: <strong>{lastSession.roomId}</strong> • Name: <strong>{lastSession.username}</strong>
                  {lastSession.hostKey && " • You were the host"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-md)" }}>
                <button
                  className="btn btnGhost"
                  onClick={dismissRejoinPrompt}
                  style={{ 
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    color: "var(--color-bg)",
                    border: "none"
                  }}
                >
                  Dismiss
                </button>
                <button
                  className="btn btnPrimary"
                  onClick={rejoinLastSession}
                  style={{ 
                    backgroundColor: "var(--color-bg)",
                    color: "var(--color-accent)"
                  }}
                >
                  Rejoin
                </button>
              </div>
            </div>
          )}
          
          {/* Viewer Invite Mode: Only show join card */}
          {isViewerInviteMode ? (
            <div style={{ 
              maxWidth: "500px",
              margin: "0 auto",
              marginTop: "var(--spacing-2xl)" 
            }}>
              {/* Card: Join Meeting (Viewer Invite) */}
              <div className="card">
                <div className="cardHeader">
                  <h3 className="cardTitle">Join Meeting</h3>
                </div>
                <div className="cardBody">
                  <label className="label">Your Name</label>
                  <input
                    className="input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={handleJoinFormEnter}
                    placeholder="Enter your name"
                    style={{ marginBottom: "var(--spacing-lg)" }}
                  />
                  <label className="label">Room ID</label>
                  <input
                    className="input"
                    value={roomId}
                    readOnly
                    disabled
                    style={{ 
                      marginBottom: "var(--spacing-lg)",
                      opacity: 0.7,
                      cursor: "not-allowed"
                    }}
                  />
                  <button
                    className="btn btnAccent btnLarge btnFull"
                    style={{ marginTop: "var(--spacing-xl)" }}
                    onClick={joinRoom}
                    disabled={!nameDraft.trim()}
                  >
                    Join Room
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid2" style={{ marginTop: "var(--spacing-2xl)" }}>
            {/* Card 1: Create Meeting */}
            <div className="card">
              <div className="cardHeader">
                <h3 className="cardTitle">Create New Meeting</h3>
              </div>
              <div className="cardBody">
                <label className="label">Your Name</label>
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      createRoom();
                    }
                  }}
                  placeholder="Enter your name"
                />
                <button
                  className="btn btnPrimary btnLarge btnFull"
                  style={{ marginTop: "var(--spacing-xl)" }}
                  onClick={() => {
                    if (confirmUsername()) {
                      setMode("setup");
                    }
                  }}
                  disabled={!nameDraft.trim()}
                >
                  Create New Meeting Room
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
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={handleJoinFormEnter}
                  placeholder="Enter your name"
                  style={{ marginBottom: "var(--spacing-lg)" }}
                />
                <label className="label">Room ID</label>
                <input
                  className="input"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={handleJoinFormEnter}
                  placeholder="Enter room ID"
                  style={{ marginBottom: "var(--spacing-lg)" }}
                />
                <label className="label">Host Key (optional)</label>
                <input
                  className="input"
                  value={hostKey}
                  onChange={(e) => setHostKey(e.target.value)}
                  onKeyDown={handleJoinFormEnter}
                  placeholder="Enter host key to control meeting"
                />
                <span className="helper">Leave blank to join as attendee</span>
                <button
                  className="btn btnAccent btnLarge btnFull"
                  style={{ marginTop: "var(--spacing-xl)" }}
                  onClick={joinRoom}
                  disabled={!nameDraft.trim() || !roomId}
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>
          )}
          
          {/* Footer */}
          <div style={{ 
            marginTop: "auto",
            paddingTop: "var(--spacing-3xl)",
            textAlign: "center",
            opacity: 0.5,
            fontSize: "var(--font-size-sm)"
          }}>
            <img src={logo} alt="League Meeting App" style={{ 
              height: "32px",
              width: "auto",
              marginBottom: "var(--spacing-sm)",
              opacity: 0.6
            }} />
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
          gap: "var(--spacing-lg)",
          padding: "var(--spacing-xl)"
        }}>
          {!connectionTimeout ? (
            <>
              <div style={{
                width: "50px",
                height: "50px",
                border: "4px solid var(--color-border-muted)",
                borderTop: "4px solid var(--color-accent)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
              <p style={{ fontSize: "var(--font-size-xl)", color: "var(--color-text)" }}>
                Connecting to room...
              </p>
            </>
          ) : (
            <>
              <div style={{
                padding: "var(--spacing-xl)",
                background: "var(--color-error-bg)",
                border: "1px solid var(--color-error)",
                borderRadius: "8px",
                maxWidth: "600px",
                width: "100%"
              }}>
                <h2 style={{ 
                  color: "var(--color-error)", 
                  marginTop: 0,
                  fontSize: "var(--font-size-xl)"
                }}>
                  ⚠️ Connection Timeout
                </h2>
                <p style={{ color: "var(--color-text)" }}>
                  Failed to connect to the meeting room within 10 seconds.
                </p>
                
                <div style={{
                  marginTop: "var(--spacing-lg)",
                  padding: "var(--spacing-md)",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "var(--font-size-sm)"
                }}>
                  <h3 style={{ marginTop: 0, fontSize: "var(--font-size-md)" }}>Connection Diagnostics</h3>
                  
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <strong>WebSocket URL:</strong><br/>
                    {connectionDiagnostics.lastWsUrl || "N/A"}
                  </div>
                  
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <strong>Last Attempt:</strong><br/>
                    {connectionDiagnostics.lastAttemptTime 
                      ? new Date(connectionDiagnostics.lastAttemptTime).toISOString() 
                      : "N/A"}
                  </div>
                  
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <strong>Join Message Sent:</strong> {connectionDiagnostics.joinSent ? "✓ Yes" : "✗ No"}
                  </div>
                  
                  <div style={{ marginBottom: "var(--spacing-sm)" }}>
                    <strong>Join ACK Received:</strong> {connectionDiagnostics.joinAckReceived ? "✓ Yes" : "✗ No"}
                  </div>
                  
                  {connectionDiagnostics.lastCloseCode && (
                    <div style={{ marginBottom: "var(--spacing-sm)" }}>
                      <strong>Last Close Code:</strong> {connectionDiagnostics.lastCloseCode}
                    </div>
                  )}
                  
                  {connectionDiagnostics.lastCloseReason && (
                    <div style={{ marginBottom: "var(--spacing-sm)" }}>
                      <strong>Last Close Reason:</strong> {connectionDiagnostics.lastCloseReason}
                    </div>
                  )}
                  
                  {connectionDiagnostics.lastError && (
                    <div style={{ marginBottom: "var(--spacing-sm)" }}>
                      <strong>Last Error:</strong> {connectionDiagnostics.lastError}
                    </div>
                  )}
                  
                  {connectionDiagnostics.healthCheckStatus && (
                    <div style={{ marginBottom: "var(--spacing-sm)" }}>
                      <strong>API Health Check:</strong> {connectionDiagnostics.healthCheckStatus}
                    </div>
                  )}
                  
                  <div style={{ marginTop: "var(--spacing-md)" }}>
                    <strong>Config:</strong><br/>
                    API Base: {API_BASE || "(not set)"}<br/>
                    WS URL: {WS_URL || "(not set)"}
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    setConnectionTimeout(false);
                    setMode("init");
                    setError(null);
                  }}
                  style={{
                    marginTop: "var(--spacing-lg)",
                    padding: "var(--spacing-md) var(--spacing-lg)",
                    background: "var(--color-accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "var(--font-size-md)"
                  }}
                >
                  ← Back to Home
                </button>
              </div>
            </>
          )}
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
          {inPopoutMode ? (
            /* Popout Mode: Compact overlay window */
            <PopoutView
              state={state}
              localTimer={localTimer}
              formatTime={formatTime}
            />
          ) : (
            /* Normal Mode: Full meeting UI */
            <div className="layoutRoot">
              <TopBar 
                roomId={roomId}
                isHost={isHost}
                connectionStatus={connectionStatus}
                viewAsAttendee={viewAsAttendee}
                onToggleViewAsAttendee={() => setViewAsAttendee(!viewAsAttendee)}
                showViewToggle={isHost}
                uiVersion={UI_VERSION}
                onShareClick={() => setShowShareModal(true)}
                onPopoutClick={() => openPopoutWindow(roomId, hostKey)}
                hidePopoutButton={inPopoutMode}
                meetingName={state?.meetingName}
                meetingElapsedSec={meetingElapsedSec}
              />
              
              {/* Subtle Host Information Badge - Only show if needed */}
              {state.hostUserId && (
                <div style={{
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-md)",
                  fontSize: "var(--font-size-sm)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", opacity: 0.7 }}>
                    <span>Host:</span>
                    <span style={{ fontWeight: "var(--font-weight-semibold)" }}>
                      {state.attendance[state.hostUserId]?.displayName || state.hostUserId}
                      {isHost && <span style={{ marginLeft: "var(--spacing-xs)", opacity: 0.8 }}>(You)</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
                    {isHost && (
                      <button
                        className="btn btnSmall btnGhost"
                        onClick={releaseHost}
                        title="Release host privileges"
                      >
                        Release
                      </button>
                    )}
                    {!isHost && hostKey && (
                      <button
                        className="btn btnSmall btnGhost"
                        onClick={claimHost}
                        title="Claim host privileges"
                      >
                        Claim Host
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              <div className={`mainContentGrid ${isHost && !viewAsAttendee ? 'withHostPanel' : ''}`}>
                {/* Left Column: Main Content */}
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
                
                {/* Right Column: Attendance Rail (always visible) */}
                <AttendanceRail 
                  attendance={state.attendance}
                  roomId={roomId}
                  isHost={isHost}
                  viewAsAttendee={viewAsAttendee}
                />
                
                {/* Third Column: Host Panel (only in host mode) */}
                {isHost && !viewAsAttendee && (
                  <HostPanel 
                    state={state}
                    send={sendMessage}
                    onAddAgenda={addAgenda}
                    onUpdateAgenda={updateAgenda}
                    onDeleteAgenda={deleteAgenda}
                    onReorderAgenda={reorderAgenda}
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
                    onToggleBallot={toggleBallot}
                  />
                )}
              </div>
              
              {/* Share Modal */}
              {showShareModal && (
                <ShareModal
                  roomId={roomId}
                  hostKey={hostKey}
                  isHost={isHost}
                  onClose={() => setShowShareModal(false)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
