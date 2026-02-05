import React from "react";
import logo from "../assets/league-meeting-logo.png";

export default function BrandHeader({ showRoomInfo = false, roomId = null }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--spacing-lg)",
      padding: showRoomInfo ? "0" : "var(--spacing-lg)",
      backgroundColor: showRoomInfo ? "transparent" : "var(--color-background)",
      borderBottom: showRoomInfo ? "none" : `2px solid var(--color-primary)`
    }}>
      <img 
        src={logo} 
        alt="League Meeting App" 
        style={{ 
          height: "56px", 
          width: "auto",
          objectFit: "contain"
        }}
      />
      <div>
        <div style={{ 
          fontSize: "var(--font-size-xl)", 
          fontWeight: "bold",
          color: "var(--color-primary)",
          lineHeight: "1.2"
        }}>
          East v. West
        </div>
        <div style={{ 
          fontSize: "var(--font-size-lg)", 
          color: "var(--color-text)",
          fontWeight: "500"
        }}>
          League Meeting
        </div>
        {showRoomInfo && roomId && (
          <div style={{ 
            fontSize: "var(--font-size-sm)", 
            color: "var(--color-muted)",
            marginTop: "var(--spacing-xs)"
          }}>
            Room: <strong>{roomId}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
