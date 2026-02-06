import React, { useState } from "react";
import logo from "../assets/league-meeting-logo.png";

export default function TopBar({ 
  roomId, 
  isHost, 
  connectionStatus, 
  viewAsAttendee, 
  onToggleViewAsAttendee,
  showViewToggle = false,
  uiVersion = null,
  onShareClick = null,
  onPopoutClick = null,
  hidePopoutButton = false,
  meetingName = null,
  meetingElapsedSec = 0
}) {
  const [showDebug, setShowDebug] = useState(false);
  
  const getStatusClass = () => {
    switch (connectionStatus) {
      case "connected": return "pill-success";
      case "reconnecting": return "pill-warning";
      case "disconnected": return "pill-danger";
      default: return "pill-neutral";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected": return "Connected";
      case "reconnecting": return "Reconnecting...";
      case "disconnected": return "Disconnected";
      default: return "Connecting...";
    }
  };

  // Format elapsed time for meeting timer display
  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="topBar">
      <div className="topBar-inner">
        {/* Left: Logo + Branding */}
        <div className="topBar-left">
          <div className="brand">
            <img 
              src={logo} 
              alt="League Meeting App" 
              className="brandLogo"
            />
            <div className="brand-text">
              <div className="brandTitle">{meetingName || "East v. West League Meeting"}</div>
            </div>
          </div>
          {roomId && (
            <div className="pill pill-accent">
              Room: <strong>{roomId}</strong>
            </div>
          )}
        </div>

        {/* Right: UI Version + Meeting Timer + Status + Role + Toggle */}
        <div className="topBar-right">
          {/* Meeting Elapsed Timer */}
          {meetingElapsedSec > 0 && (
            <div className="pill pill-neutral" style={{ fontFamily: "var(--font-family-mono)" }}>
              ⏱ {formatElapsed(meetingElapsedSec)} elapsed
            </div>
          )}

          {/* UI Version Badge */}
          {uiVersion && (
            <div className="pill pill-accent">
              UI: {uiVersion}
            </div>
          )}

          {/* Connection Status */}
          <div className={`pill ${getStatusClass()}`}>
            {getStatusText()}
          </div>

          {/* Role Badge */}
          <div className={`pill ${isHost && !viewAsAttendee ? 'pill-primary' : 'pill-neutral'}`}>
            {isHost && !viewAsAttendee ? "🔑 HOST" : "👥 ATTENDEE"}
          </div>

          {/* Share Button */}
          {onShareClick && (
            <button
              onClick={onShareClick}
              className="btn btnGhost btnSmall"
              title="Share meeting links"
            >
              📤 Share
            </button>
          )}

          {/* Popout Button */}
          {onPopoutClick && !hidePopoutButton && (
            <>
              <button
                onClick={onPopoutClick}
                className="btn btnGhost btnSmall"
                title="Open mini-view in popout window"
              >
                🪟 Popout
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="btn btnGhost btnSmall"
                title="Toggle debug info"
                style={{ padding: "0 var(--spacing-sm)" }}
              >
                🔍
              </button>
            </>
          )}

          {/* View as Attendee Toggle */}
          {showViewToggle && isHost && (
            <label className="btn btnGhost btnSmall">
              <input
                type="checkbox"
                checked={viewAsAttendee}
                onChange={onToggleViewAsAttendee}
              />
              View as Attendee
            </label>
          )}
        </div>
      </div>
      
      {/* Debug Info Popup for Popout Investigation */}
      {showDebug && onPopoutClick && (
        <div style={{
          position: "fixed",
          top: "60px",
          right: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          border: "2px solid orange",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-md)",
          zIndex: 1000,
          fontSize: "var(--font-size-xs)",
          fontFamily: "var(--font-family-mono)",
          maxWidth: "500px",
          color: "white"
        }}>
          <div style={{ 
            fontWeight: "var(--font-weight-bold)", 
            marginBottom: "var(--spacing-sm)",
            color: "orange"
          }}>
            🔍 POPOUT DEBUG INFO
          </div>
          <div style={{ lineHeight: 1.6 }}>
            <div><strong>window.location.origin:</strong> {window.location.origin}</div>
            <div><strong>window.location.pathname:</strong> {window.location.pathname}</div>
            <div><strong>window.location.href:</strong> {window.location.href}</div>
            <div><strong>Room ID:</strong> {roomId || '(not set)'}</div>
            <div style={{ marginTop: "var(--spacing-sm)", opacity: 0.7 }}>
              Popout will open: {window.location.origin}/?room={roomId}&mode=popout&as=attendee
            </div>
          </div>
          <button
            onClick={() => setShowDebug(false)}
            className="btn btnGhost btnSmall"
            style={{ marginTop: "var(--spacing-sm)", width: "100%" }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
