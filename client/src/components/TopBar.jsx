import React from "react";

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
      case "connected": return "#4caf50";
      case "reconnecting": return "#ff9800";
      case "disconnected": return "#f44336";
      default: return "#9e9e9e";
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
      backgroundColor: "#ffffff",
      borderBottom: "2px solid #dee2e6",
      padding: "1rem 1.5rem",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 100,
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
    }}>
      {/* Left: Logo + Branding */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <img 
          src="/src/League Meeting App Logo.png" 
          alt="League Meeting App" 
          style={{ height: "40px", width: "auto" }}
          onError={(e) => {
            // Fallback if logo doesn't load
            e.target.style.display = "none";
          }}
        />
        <div>
          <div style={{ 
            fontSize: "1.2rem", 
            fontWeight: "bold",
            color: "#333"
          }}>
            East v. West — League Meeting
          </div>
          <div style={{ 
            fontSize: "0.85rem", 
            color: "#666",
            marginTop: "2px"
          }}>
            Room: <strong>{roomId}</strong>
          </div>
        </div>
      </div>

      {/* Right: Status + Role + Toggle */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "1rem" 
      }}>
        {/* Connection Status */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.4rem 0.8rem",
          backgroundColor: "#f8f9fa",
          borderRadius: "20px",
          fontSize: "0.85rem"
        }}>
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: getStatusColor(),
            animation: connectionStatus === "reconnecting" ? "pulse 1.5s ease-in-out infinite" : "none"
          }} />
          <span style={{ fontWeight: "500" }}>{getStatusText()}</span>
        </div>

        {/* Role Badge */}
        <div style={{
          padding: "0.4rem 0.8rem",
          backgroundColor: isHost && !viewAsAttendee ? "#28a745" : "#6c757d",
          color: "white",
          borderRadius: "20px",
          fontSize: "0.85rem",
          fontWeight: "bold"
        }}>
          {isHost && !viewAsAttendee ? "🔑 HOST" : "👥 ATTENDEE"}
        </div>

        {/* View as Attendee Toggle */}
        {showViewToggle && isHost && (
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: "500",
            color: "#333",
            padding: "0.4rem 0.8rem",
            backgroundColor: "#e7f3ff",
            borderRadius: "20px",
            border: "1px solid #0066cc",
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

      {/* Pulse animation for reconnecting status */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
