import React from "react";
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
  hidePopoutButton = false
}) {
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
              <div className="brandTitle">East v. West</div>
              <div className="brandSubtitle">League Meeting</div>
            </div>
          </div>
          {roomId && (
            <div className="pill pill-accent">
              Room: <strong>{roomId}</strong>
            </div>
          )}
        </div>

        {/* Right: UI Version + Status + Role + Toggle */}
        <div className="topBar-right">
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
            <button
              onClick={onPopoutClick}
              className="btn btnGhost btnSmall"
              title="Open mini-view in popout window"
            >
              🪟 Popout
            </button>
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
    </div>
  );
}
