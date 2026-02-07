import React, { useEffect } from "react";

/**
 * AgendaItemDetailsModal - Read-only modal for viewing agenda item details
 * Used by attendees, viewers, and popout to view agenda item information
 * without triggering any host actions (active item, timers, etc.)
 */
export default function AgendaItemDetailsModal({ 
  item, 
  formatTime,
  onClose 
}) {
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!item) return null;

  return (
    <div 
      className="modalOverlay"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--spacing-lg)"
      }}
    >
      <div 
        className="modalContent"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--color-bg)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)"
        }}
      >
        {/* Header */}
        <div style={{
          padding: "var(--spacing-lg)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--spacing-md)"
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: "var(--font-size-xl)",
              fontWeight: "var(--font-weight-bold)",
              margin: 0,
              marginBottom: "var(--spacing-sm)"
            }}>
              {item.title}
            </h2>
            <div style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-text-muted)"
            }}>
              Duration: {formatTime(item.durationSec)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "var(--font-size-xl)",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: "var(--spacing-xs)",
              lineHeight: 1,
              transition: "color var(--transition-fast)"
            }}
            onMouseEnter={(e) => {
              e.target.style.color = "var(--color-text)";
            }}
            onMouseLeave={(e) => {
              e.target.style.color = "var(--color-text-muted)";
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: "var(--spacing-lg)"
        }}>
          {/* Notes */}
          {item.notes && (
            <div style={{ marginBottom: "var(--spacing-lg)" }}>
              <div style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                marginBottom: "var(--spacing-xs)",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}>
                Notes
              </div>
              <div style={{
                fontSize: "var(--font-size-base)",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap"
              }}>
                {item.notes}
              </div>
            </div>
          )}

          {/* Proposal Packet Section */}
          {item.type === "proposal" && (item.description || item.link) && (
            <div style={{
              padding: "var(--spacing-lg)",
              backgroundColor: "rgba(191, 153, 68, 0.1)",
              border: "2px solid var(--color-accent)",
              borderRadius: "var(--radius-lg)",
              marginBottom: "var(--spacing-lg)"
            }}>
              <div style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-accent)",
                marginBottom: "var(--spacing-md)",
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-sm)"
              }}>
                📋 Proposal Packet
                {item.onBallot && (
                  <span style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-semibold)",
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-bg)",
                    padding: "var(--spacing-xs) var(--spacing-sm)",
                    borderRadius: "var(--radius-sm)"
                  }}>
                    ON BALLOT
                  </span>
                )}
              </div>

              {item.description && (
                <div style={{
                  fontSize: "var(--font-size-base)",
                  marginBottom: "var(--spacing-md)",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap"
                }}>
                  {item.description}
                </div>
              )}

              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--spacing-sm)",
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-semibold)",
                    color: "var(--color-accent)",
                    textDecoration: "none",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    backgroundColor: "rgba(191, 153, 68, 0.2)",
                    border: "1px solid var(--color-accent)",
                    borderRadius: "var(--radius-md)",
                    transition: "all var(--transition-fast)"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "rgba(191, 153, 68, 0.3)";
                    e.target.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "rgba(191, 153, 68, 0.2)";
                    e.target.style.transform = "translateY(0)";
                  }}
                >
                  🔗 Open Proposal Link
                </a>
              )}
            </div>
          )}

          {/* Category (if present) */}
          {item.category && (
            <div style={{ marginBottom: "var(--spacing-lg)" }}>
              <div style={{
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text-muted)",
                marginBottom: "var(--spacing-xs)",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}>
                Category
              </div>
              <div style={{
                fontSize: "var(--font-size-base)"
              }}>
                {item.category}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "var(--spacing-lg)",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "flex-end"
        }}>
          <button
            onClick={onClose}
            className="btn btnPrimary"
            style={{
              padding: "var(--spacing-sm) var(--spacing-lg)"
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
