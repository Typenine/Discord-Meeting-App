import React from "react";

/**
 * PopoutView - Compact overlay window optimized for ~420x720px
 * Shows: current agenda item, timer, next item (optional), attendance count
 */
export default function PopoutView({ 
  state, 
  localTimer,
  formatTime
}) {
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

  return (
    <div className="popoutContainer">
      {/* Current Agenda Item */}
      {activeItem ? (
        <div className="popoutSection">
          <div className="popoutLabel">NOW PLAYING</div>
          <div className="popoutTitle">{activeItem.title}</div>
          
          {/* Large Timer */}
          <div className="popoutTimer">
            <div className={`popoutTimerValue ${state.timer.running && localTimer < 10 ? 'warning' : ''}`}>
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
      
      {/* Attendance Count */}
      <div className="popoutFooter">
        <div className="popoutAttendance">
          👥 {attendanceCount} {attendanceCount === 1 ? 'participant' : 'participants'}
        </div>
      </div>
    </div>
  );
}
