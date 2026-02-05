import React from "react";

export default function AttendanceRail({ attendance, roomId, isHost, viewAsAttendee }) {
  const attendeeCount = Object.keys(attendance || {}).length;
  
  return (
    <aside className="attendanceRail">
      <div className="attendanceRailHeader">
        <h3 className="attendanceRailTitle">Attendance</h3>
        <div className="pill pill-accent">
          {attendeeCount} {attendeeCount === 1 ? 'Person' : 'People'}
        </div>
      </div>
      
      <div className="attendanceRailContent">
        {/* Meeting Info */}
        {roomId && (
          <div className="meetingInfoBlock">
            <div className="infoRow">
              <span className="infoLabel">Room ID</span>
              <span className="infoValue">{roomId}</span>
            </div>
            <div className="infoRow">
              <span className="infoLabel">Your Role</span>
              <span className="infoValue">
                {isHost && !viewAsAttendee ? "🔑 Host" : "👥 Attendee"}
              </span>
            </div>
          </div>
        )}
        
        {/* Attendee List */}
        <div className="attendeeList">
          {attendeeCount === 0 ? (
            <div className="text-center text-muted" style={{ 
              padding: "var(--spacing-lg)",
              fontStyle: "italic"
            }}>
              No attendees yet
            </div>
          ) : (
            Object.values(attendance || {}).map((att) => (
              <div key={att.userId} className="attendeeChip">
                <span className="attendeeStatus" />
                <span className="attendeeName">
                  {att.displayName || att.userId}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
