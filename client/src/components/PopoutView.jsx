import React, { useState } from "react";
import AttendancePanel from "./AttendancePanel.jsx";

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
  const meetingElapsedSec = state.meetingTimer?.elapsedSec || 0;

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
                    opacity: isPast ? 0.6 : 1
                  }}
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
    </div>
  );
}
