import React from "react";

/**
 * AttendancePanel - Overlay panel showing list of current attendees
 * Optimized for small popout dimensions (~420x720px)
 * Shows displayName and role for each attendee
 */
export default function AttendancePanel({ 
  attendance, 
  hostUserId,
  onClose 
}) {
  const attendees = Object.values(attendance || {});
  const attendeeCount = attendees.length;

  // Determine role for each attendee
  const getRole = (attendee) => {
    if (attendee.userId === hostUserId) {
      return "host";
    }
    // Can add more role logic here if needed
    return "attendee";
  };

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
              {attendees.map((attendee) => {
                const role = getRole(attendee);
                return (
                  <div key={attendee.userId} className="attendancePanelItem">
                    <div className="attendancePanelItemIcon">
                      {role === "host" ? "🔑" : "👤"}
                    </div>
                    <div className="attendancePanelItemContent">
                      <div className="attendancePanelItemName">
                        {attendee.displayName || attendee.userId}
                      </div>
                      <div className="attendancePanelItemRole">
                        {role === "host" ? "Host" : "Attendee"}
                      </div>
                    </div>
                  </div>
                );
              })}
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
