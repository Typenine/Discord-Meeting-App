import React from "react";
import { generateViewerLink, generateHostLink, getLinkBaseUrl } from "../utils/linkHelpers.js";

export default function ShareModal({ 
  roomId, 
  hostKey,
  isHost,
  onClose 
}) {
  const viewerUrl = generateViewerLink(roomId);
  const hostUrl = hostKey ? generateHostLink(roomId, hostKey) : null;
  
  // Check if debug panel should be shown
  const showDebugPanel = (() => {
    // Show if ?debug=1 query param is present
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') return true;
    
    // Show if VITE_SHOW_DEBUG_PANEL env var is "true"
    if (import.meta.env.VITE_SHOW_DEBUG_PANEL === 'true') return true;
    
    return false;
  })();
  
  // Debug info for Vercel 404 investigation
  const debugInfo = {
    windowOrigin: window.location.origin,
    windowPathname: window.location.pathname,
    windowHref: window.location.href,
    baseUrl: getLinkBaseUrl(),
    viewerUrl,
    hostUrl: hostUrl || '(not set)'
  };

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
          
          {/* Debug Info Section for Vercel 404 Investigation */}
          {showDebugPanel && (
          <div style={{
            marginTop: "var(--spacing-xl)",
            padding: "var(--spacing-md)",
            backgroundColor: "rgba(255, 165, 0, 0.1)",
            border: "1px solid rgba(255, 165, 0, 0.5)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-xs)",
            fontFamily: "var(--font-family-mono)"
          }}>
            <div style={{ 
              fontWeight: "var(--font-weight-bold)", 
              marginBottom: "var(--spacing-sm)",
              color: "orange"
            }}>
              🔍 DEBUG INFO (Vercel 404 Investigation)
            </div>
            <div style={{ lineHeight: 1.6 }}>
              <div><strong>window.location.origin:</strong> {debugInfo.windowOrigin}</div>
              <div><strong>window.location.pathname:</strong> {debugInfo.windowPathname}</div>
              <div><strong>window.location.href:</strong> {debugInfo.windowHref}</div>
              <div><strong>Base URL (getLinkBaseUrl):</strong> {debugInfo.baseUrl}</div>
              <div><strong>Generated Viewer URL:</strong> {debugInfo.viewerUrl}</div>
              {isHost && <div><strong>Generated Host URL:</strong> {debugInfo.hostUrl}</div>}
            </div>
            <div style={{ 
              marginTop: "var(--spacing-sm)", 
              fontSize: "var(--font-size-xs)", 
              opacity: 0.7,
              fontStyle: "italic"
            }}>
              Check browser DevTools Network tab for x-meeting-config: 1 header
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
