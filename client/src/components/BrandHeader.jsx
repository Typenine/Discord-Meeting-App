import React from "react";
import logo from "../assets/league-meeting-logo.png";

export default function BrandHeader({ showRoomInfo = false, roomId = null }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--spacing-lg)",
      padding: showRoomInfo ? "0" : "var(--spacing-lg)",
      backgroundColor: showRoomInfo ? "transparent" : "#050505",
      borderBottom: showRoomInfo ? "none" : "2px solid #0b5f98"
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
          color: "#0b5f98",
          lineHeight: "1.2"
        }}>
          East v. West
        </div>
        <div style={{ 
          fontSize: "var(--font-size-lg)", 
          color: "#fcfcfc",
          fontWeight: "500"
        }}>
          League Meeting
        </div>
        {showRoomInfo && roomId && (
          <div style={{ 
            fontSize: "var(--font-size-sm)", 
            color: "#bf9944",
            marginTop: "var(--spacing-xs)"
          }}>
            Room: <strong>{roomId}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
