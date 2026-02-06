import React, { useState } from "react";
import AttendancePanel from "./AttendancePanel.jsx";

/**
 * PopoutView - Compact overlay window optimized for ~420x720px
 * Shows: current agenda item, timer, next item (optional), attendance count
 */
export default function PopoutView({ 
  state, 
  localTimer,
  formatTime
}) {
  const [showAttendancePanel, setShowAttendancePanel] = useState(false);
  
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
            <div className={`popoutTimerValue ${localTimer < 10 ? 'warning' : ''}`}>
              {formatTime(localTimer)}
            </div>
            <div className="popoutTimerStatus">
              {state.timer.running ? '▶️ Running' : 
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
      
      {/* Next Item (if available) */}
      {nextItem && (
        <div className="popoutSection popoutSectionSecondary">
          <div className="popoutLabel">UP NEXT</div>
          <div className="popoutNextTitle">{nextItem.title}</div>
          <div className="popoutNextDuration">
            {formatTime(nextItem.durationSec)}
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
