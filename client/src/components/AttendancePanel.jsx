import React from "react";

/**
 * AttendancePanel - Overlay panel showing list of current attendees
 * Optimized for small popout dimensions (~420x720px)
 * Shows displayName and role (if available) for each attendee
 */
export default function AttendancePanel({ 
  attendance, 
  onClose 
}) {
  const attendees = Object.values(attendance || {});
  const attendeeCount = attendees.length;

  return (
    <div className="attendanceOverlay" onClick={onClose}>
      <div className="attendancePanel" onClick={(e) => e.stopPropagation()}>
        {/* Header with count and close button */}
        <div className="attendancePanelHeader">
          <div className="attendancePanelTitle">
            👥 Participants ({attendeeCount})
          </div>
          <button
            onClick={onClose}
            className="attendancePanelClose"
            title="Close"
            aria-label="Close attendance panel"
          >
            ✕
          </button>
        </div>

        {/* Attendee List */}
        <div className="attendancePanelContent">
          {attendeeCount === 0 ? (
            <div className="attendancePanelEmpty">
              No participants yet
            </div>
          ) : (
            <div className="attendancePanelList">
              {attendees.map((attendee) => (
                <div key={attendee.userId} className="attendancePanelItem">
                  <div className="attendancePanelItemIcon">
                    {attendee.role === "host" ? "🔑" : "👤"}
                  </div>
                  <div className="attendancePanelItemContent">
                    <div className="attendancePanelItemName">
                      {attendee.displayName || attendee.userId}
                    </div>
                    {attendee.role && (
                      <div className="attendancePanelItemRole">
                        {attendee.role === "host" ? "Host" : 
                         attendee.role === "viewer" ? "Viewer" : "Attendee"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Back button */}
        <div className="attendancePanelFooter">
          <button
            onClick={onClose}
            className="btn btnPrimary"
            style={{ width: "100%" }}
          >
            ← Back to Agenda
          </button>
        </div>
      </div>
    </div>
  );
}
