import React from "react";
import BrandHeader from "./BrandHeader.jsx";

export default function TopBar({ 
  roomId, 
  isHost, 
  connectionStatus, 
  viewAsAttendee, 
  onToggleViewAsAttendee,
  showViewToggle = false
}) {
  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected": return "var(--color-success)";
      case "reconnecting": return "var(--color-warning)";
      case "disconnected": return "var(--color-destructive)";
      default: return "var(--color-muted)";
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
    <div style={{
      position: "sticky",
      top: 0,
      backgroundColor: "var(--color-background)",
      borderBottom: `2px solid var(--color-primary)`,
      padding: "var(--spacing-lg) var(--spacing-xl)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 100,
      boxShadow: "var(--shadow-md)"
    }}>
      {/* Left: Logo + Branding */}
      <BrandHeader showRoomInfo={true} roomId={roomId} />

      {/* Right: Status + Role + Toggle */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "var(--spacing-lg)" 
      }}>
        {/* Connection Status */}
        <div className="pillStatus" style={{ color: getStatusColor() }}>
          <span style={{ fontWeight: "500" }}>{getStatusText()}</span>
        </div>

        {/* Role Badge */}
        <div className={`badge ${isHost && !viewAsAttendee ? 'badgeBlue' : 'badgeNeutral'}`}>
          {isHost && !viewAsAttendee ? "🔑 HOST" : "👥 ATTENDEE"}
        </div>

        {/* View as Attendee Toggle */}
        {showViewToggle && isHost && (
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            cursor: "pointer",
            fontSize: "var(--font-size-sm)",
            fontWeight: "500",
            color: "var(--color-text)",
            padding: "var(--spacing-sm) var(--spacing-md)",
            backgroundColor: "#e7f3ff",
            borderRadius: "var(--radius-pill)",
            border: `1px solid var(--color-primary)`,
            userSelect: "none"
          }}>
            <input
              type="checkbox"
              checked={viewAsAttendee}
              onChange={onToggleViewAsAttendee}
              style={{ cursor: "pointer" }}
            />
            View as Attendee
          </label>
        )}
      </div>
    </div>
  );
}
