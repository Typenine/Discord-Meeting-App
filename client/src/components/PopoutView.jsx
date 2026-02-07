import React, { useState, useEffect } from "react";
import AttendancePanel from "./AttendancePanel.jsx";
import AgendaItemDetailsModal from "./AgendaItemDetailsModal.jsx";

/**
 * PopoutView - Compact overlay window optimized for ~420x720px
 * Shows: current agenda item, timer, full numbered agenda list, attendance count
 */
export default function PopoutView({ 
  state, 
  localTimer,
  formatTime
}) {
  const [showAttendancePanel, setShowAttendancePanel] = useState(false);
  const [selectedAgendaItem, setSelectedAgendaItem] = useState(null);
  
  // Local tick for meeting elapsed timer - updates every second
  const [localTick, setLocalTick] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Status label constants
  const STATUS_CURRENT = "(current)";
  const STATUS_COMPLETE = "(complete)";
  
  // Format elapsed time for meeting timer
  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (!state) {
    return (
      <div className="popoutContainer">
        <div className="popoutLoading">Loading...</div>
      </div>
    );
  }

  const activeItem = state.activeAgendaId 
    ? state.agenda.find(item => item.id === state.activeAgendaId)
    : null;
  
  // Find next agenda item
  const activeIndex = activeItem 
    ? state.agenda.findIndex(item => item.id === state.activeAgendaId)
    : -1;
  const nextItem = activeIndex >= 0 && activeIndex < state.agenda.length - 1
    ? state.agenda[activeIndex + 1]
    : null;

  const attendanceCount = state.attendance ? Object.keys(state.attendance).length : 0;
  const meetingName = state.meetingName || "East v. West League Meeting";
  
  // Compute meeting elapsed seconds based on server meetingStartedAtMs + local tick
  const meetingElapsedSec = (() => {
    if (!state?.meetingTimer?.running || !state?.meetingTimer?.startedAtMs) {
      return 0;
    }
    const elapsedMs = localTick - state.meetingTimer.startedAtMs;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  })();

  return (
    <div className="popoutContainer">
      {/* Meeting Header */}
      <div className="popoutHeader" style={{
        padding: "var(--spacing-md)",
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        borderBottom: "1px solid var(--color-border-subtle)",
        textAlign: "center"
      }}>
        <div style={{ 
          fontSize: "var(--font-size-sm)", 
          fontWeight: "var(--font-weight-semibold)",
          marginBottom: "var(--spacing-xs)"
        }}>
          {meetingName}
        </div>
        {meetingElapsedSec > 0 && (
          <div style={{ 
            fontSize: "var(--font-size-xs)", 
            opacity: 0.7,
            fontFamily: "var(--font-family-mono)"
          }}>
            ⏱ {formatElapsed(meetingElapsedSec)} elapsed
          </div>
        )}
      </div>
      
      {/* Current Agenda Item */}
      {activeItem ? (
        <div className="popoutSection">
          <div className="popoutLabel">NOW PLAYING</div>
          <div className="popoutTitle">{activeItem.title}</div>
          
          {/* Proposal Packet */}
          {activeItem.type === "proposal" && (activeItem.description || activeItem.link) && (
            <div style={{
              marginTop: "var(--spacing-md)",
              padding: "var(--spacing-md)",
              backgroundColor: "rgba(191, 153, 68, 0.1)",
              border: "1px solid var(--color-accent)",
              borderRadius: "var(--radius-md)"
            }}>
              <div style={{ 
                fontSize: "var(--font-size-sm)", 
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-accent)",
                marginBottom: "var(--spacing-xs)"
              }}>
                📋 Proposal Packet
              </div>
              {activeItem.description && (
                <div style={{ 
                  fontSize: "var(--font-size-sm)", 
                  marginBottom: "var(--spacing-xs)",
                  whiteSpace: "pre-wrap"
                }}>
                  {activeItem.description}
                </div>
              )}
              {activeItem.link && (
                <a 
                  href={activeItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    fontSize: "var(--font-size-sm)",
                    color: "var(--color-accent)",
                    textDecoration: "underline"
                  }}
                >
                  🔗 View Proposal Document
                </a>
              )}
            </div>
          )}
          
          {/* Large Timer */}
          <div className="popoutTimer">
            <div className={`popoutTimerValue ${localTimer < 10 && localTimer >= 0 ? 'warning' : ''} ${localTimer < 0 ? 'overtime' : ''}`}>
              {formatTime(localTimer)}
            </div>
            <div className="popoutTimerStatus">
              {localTimer < 0 ? '⏱️ Overtime' :
               state.timer.running ? '▶️ Running' : 
               state.timer.pausedRemainingSec !== null ? '⏸ Paused' : 
               '⏹ Stopped'}
            </div>
          </div>
        </div>
      ) : (
        <div className="popoutSection">
          <div className="popoutEmptyIcon">📋</div>
          <div className="popoutEmptyText">No active item</div>
        </div>
      )}
      
      {/* Full Agenda List */}
      {state.agenda && state.agenda.length > 0 && (
        <div className="popoutSection popoutSectionSecondary" style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}>
          <div className="popoutLabel">FULL AGENDA</div>
          <div style={{
            overflowY: "auto",
            maxHeight: "var(--popout-agenda-max-height)",
            paddingRight: "var(--spacing-sm)"
          }}>
            {state.agenda.map((item, index) => {
              const isActive = state.activeAgendaId === item.id;
              const isPast = activeIndex >= 0 && index < activeIndex;
              
              return (
                <div 
                  key={item.id}
                  onClick={() => setSelectedAgendaItem(item)}
                  style={{
                    padding: "var(--spacing-md)",
                    marginBottom: "var(--spacing-sm)",
                    backgroundColor: isActive 
                      ? "rgba(191, 153, 68, 0.2)" 
                      : isPast 
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(255, 255, 255, 0.08)",
                    border: isActive 
                      ? "2px solid var(--color-accent)" 
                      : "1px solid var(--color-border-subtle)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    gap: "var(--spacing-md)",
                    alignItems: "flex-start",
                    transition: "all var(--transition-fast)",
                    opacity: isPast ? 0.6 : 1,
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = isPast 
                        ? "rgba(255, 255, 255, 0.05)"
                        : "rgba(255, 255, 255, 0.08)";
                    }
                  }}
                  title="Click to view details"
                >
                  {/* Item Number */}
                  <div style={{
                    fontSize: "var(--font-size-lg)",
                    fontWeight: "var(--font-weight-bold)",
                    color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                    minWidth: "24px",
                    flexShrink: 0
                  }}>
                    {index + 1}.
                  </div>
                  
                  {/* Item Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "var(--font-size-base)",
                      fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
                      color: isActive ? "var(--color-offwhite)" : "var(--color-text)",
                      marginBottom: "var(--spacing-xs)",
                      wordBreak: "break-word"
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontSize: "var(--font-size-xs)",
                      color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                      fontFamily: "var(--font-family-mono)",
                      fontWeight: "var(--font-weight-medium)"
                    }}>
                      {formatTime(item.durationSec)}
                      {isActive && ` ${STATUS_CURRENT}`}
                      {isPast && ` ${STATUS_COMPLETE}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Ballot Queue (Read-only for attendees) */}
      {state.agenda && state.agenda.some(item => item.onBallot) && (
        <div className="popoutSection popoutSectionSecondary" style={{
          borderTop: "1px solid var(--color-border-subtle)",
          paddingTop: "var(--spacing-md)"
        }}>
          <div className="popoutLabel">🗳️ BALLOT QUEUE</div>
          <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.7, marginBottom: "var(--spacing-sm)" }}>
            Proposals ready for voting
          </div>
          {state.agenda
            .filter(item => item.onBallot)
            .map((item, index) => (
              <div 
                key={item.id}
                style={{
                  padding: "var(--spacing-sm)",
                  marginBottom: "var(--spacing-xs)",
                  backgroundColor: "rgba(191, 153, 68, 0.1)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: "var(--radius-sm)"
                }}
              >
                <div style={{
                  fontSize: "var(--font-size-sm)",
                  fontWeight: "var(--font-weight-semibold)"
                }}>
                  {index + 1}. {item.title}
                </div>
                {item.description && (
                  <div style={{
                    fontSize: "var(--font-size-xs)",
                    opacity: 0.8,
                    marginTop: "var(--spacing-xs)"
                  }}>
                    {item.description}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      
      {/* Attendance Count - Clickable */}
      <div className="popoutFooter">
        <button
          className="popoutAttendance popoutAttendanceClickable"
          onClick={() => setShowAttendancePanel(true)}
          title="View participant list"
          aria-label={`View participant list. ${attendanceCount} ${attendanceCount === 1 ? 'participant' : 'participants'} in meeting`}
        >
          👥 {attendanceCount} {attendanceCount === 1 ? 'participant' : 'participants'}
        </button>
      </div>

      {/* Attendance Panel Overlay */}
      {showAttendancePanel && (
        <AttendancePanel
          attendance={state.attendance}
          hostUserId={state.hostUserId}
          onClose={() => setShowAttendancePanel(false)}
        />
      )}

      {/* Agenda Item Details Modal */}
      {selectedAgendaItem && (
        <AgendaItemDetailsModal
          item={selectedAgendaItem}
          formatTime={formatTime}
          onClose={() => setSelectedAgendaItem(null)}
        />
      )}
    </div>
  );
}
