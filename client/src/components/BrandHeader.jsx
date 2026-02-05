import React from "react";
import logo from "../assets/league-meeting-logo.png";

export default function BrandHeader({ showRoomInfo = false, roomId = null }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      padding: showRoomInfo ? "0" : "1rem",
      backgroundColor: showRoomInfo ? "transparent" : "var(--color-background)",
      borderBottom: showRoomInfo ? "none" : "2px solid var(--color-primary)"
    }}>
      <img 
        src={logo} 
        alt="League Meeting App" 
        style={{ 
          height: "48px", 
          width: "auto"
        }}
      />
      <div>
        <div style={{ 
          fontSize: "1.4rem", 
          fontWeight: "bold",
          color: "var(--color-primary)",
          lineHeight: "1.2"
        }}>
          East v. West
        </div>
        <div style={{ 
          fontSize: "1.1rem", 
          color: "var(--color-text)",
          fontWeight: "500"
        }}>
          League Meeting
        </div>
        {showRoomInfo && roomId && (
          <div style={{ 
            fontSize: "0.85rem", 
            color: "#666",
            marginTop: "4px"
          }}>
            Room: <strong>{roomId}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
