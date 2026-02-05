import React from "react";
import { generateViewerLink, generateHostLink } from "../utils/linkHelpers.js";

export default function ShareModal({ 
  roomId, 
  hostKey,
  isHost,
  onClose 
}) {
  const viewerUrl = generateViewerLink(roomId);
  const hostUrl = hostKey ? generateHostLink(roomId, hostKey) : null;

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here if desired
      console.log(`${label} copied to clipboard`);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
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
        maxWidth: "600px",
        width: "90%",
      }}>
        <div className="cardHeader">
          <h2 className="cardTitle">📤 Share Meeting</h2>
        </div>
        <div className="cardBody">
          <p style={{ marginBottom: "var(--spacing-xl)", opacity: 0.9 }}>
            Room ID: <span className="pill pill-accent">{roomId}</span>
          </p>
          
          {/* Viewer Link */}
          <div style={{ marginBottom: "var(--spacing-xl)" }}>
            <h3 style={{ 
              fontSize: "var(--font-size-base)", 
              fontWeight: "var(--font-weight-semibold)", 
              marginBottom: "var(--spacing-sm)" 
            }}>
              👥 Viewer Link:
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
              onClick={() => copyToClipboard(viewerUrl, "Viewer link")}
              className="btn btnPrimary btnSmall"
            >
              📋 Copy Viewer Link
            </button>
            <div style={{ 
              marginTop: "var(--spacing-sm)", 
              fontSize: "var(--font-size-sm)", 
              opacity: 0.7,
              fontStyle: "italic"
            }}>
              Share this link with meeting attendees.
            </div>
          </div>
          
          {/* Host Link - Only show if user is host and has hostKey */}
          {isHost && hostUrl && (
            <div style={{ marginBottom: "var(--spacing-xl)" }}>
              <h3 style={{ 
                fontSize: "var(--font-size-base)", 
                fontWeight: "var(--font-weight-semibold)", 
                marginBottom: "var(--spacing-sm)" 
              }}>
                🔑 Host Link:
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
                onClick={() => copyToClipboard(hostUrl, "Host link")}
                className="btn btnAccent btnSmall"
              >
                📋 Copy Host Link
              </button>
              <div style={{ 
                marginTop: "var(--spacing-sm)", 
                fontSize: "var(--font-size-sm)", 
                opacity: 0.7,
                fontStyle: "italic"
              }}>
                Keep the host link secret to maintain control.
              </div>
            </div>
          )}
          
          <button
            onClick={onClose}
            className="btn btnGhost btnFull"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
