import React, { useState } from "react";
import { formatTime } from "../utils/timeFormat.js";

export default function HostPanel({ 
  state, 
  onAddAgenda,
  onUpdateAgenda,
  onDeleteAgenda,
  onSetActiveAgenda,
  onNextAgendaItem,
  onPrevAgendaItem,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onResetTimer,
  onExtendTimer,
  onOpenVote,
  onCloseVote
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaMinutes, setNewAgendaMinutes] = useState("");
  const [newAgendaSeconds, setNewAgendaSeconds] = useState("");
  const [newAgendaNotes, setNewAgendaNotes] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [editSeconds, setEditSeconds] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");

  const startEditingAgenda = (item) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    // Convert seconds to minutes and seconds
    const totalSec = item.durationSec || 0;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    setEditMinutes(String(mins));
    setEditSeconds(String(secs));
    setEditNotes(item.notes || "");
  };

  const saveEditingAgenda = () => {
    if (editingItemId && editTitle) {
      // Convert minutes and seconds to total seconds
      const mins = parseInt(editMinutes) || 0;
      const secs = parseInt(editSeconds) || 0;
      // Validate seconds range
      const validSecs = Math.max(0, Math.min(59, secs));
      const totalSeconds = mins * 60 + validSecs;
      
      onUpdateAgenda(editingItemId, {
        title: editTitle,
        durationSec: totalSeconds,
        notes: editNotes
      });
      setEditingItemId(null);
      setEditTitle("");
      setEditMinutes("");
      setEditSeconds("");
      setEditNotes("");
    }
  };

  const cancelEditingAgenda = () => {
    setEditingItemId(null);
    setEditTitle("");
    setEditMinutes("");
    setEditSeconds("");
    setEditNotes("");
  };

  if (isCollapsed) {
    return (
      <div style={{
        position: "fixed",
        top: "80px",
        right: "10px",
        zIndex: 50
      }}>
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: "bold",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
          }}
        >
          ▶ Host Controls
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: "350px",
      backgroundColor: "#f8f9fa",
      borderLeft: "2px solid #dee2e6",
      overflowY: "auto",
      height: "calc(100vh - 90px)",
      padding: "1rem",
      position: "relative"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1rem"
      }}>
        <h3 style={{ margin: 0, color: "#333" }}>Host Controls</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.5rem",
            cursor: "pointer",
            color: "#666"
          }}
        >
          ×
        </button>
      </div>

      {/* Agenda Navigation */}
      {state.agenda.length > 1 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ 
            display: "flex", 
            gap: "0.5rem",
            marginBottom: "0.5rem"
          }}>
            <button
              onClick={onPrevAgendaItem}
              style={{
                flex: 1,
                padding: "0.5rem",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              ◀ Prev
            </button>
            <button
              onClick={onNextAgendaItem}
              style={{
                flex: 1,
                padding: "0.5rem",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}

      {/* Timer Controls */}
      <div style={{
        marginBottom: "1rem",
        padding: "1rem",
        backgroundColor: "white",
        borderRadius: "4px",
        border: "1px solid #dee2e6"
      }}>
        <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Timer Controls</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {!state.timer.running && state.timer.pausedRemainingSec === null && (
            <button
              onClick={onStartTimer}
              disabled={state.timer.durationSec <= 0}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--color-primary)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: state.timer.durationSec > 0 ? "pointer" : "not-allowed",
                opacity: state.timer.durationSec > 0 ? 1 : 0.5,
                fontSize: "0.9rem"
              }}
            >
              ▶️ Start
            </button>
          )}
          {state.timer.running && (
            <button
              onClick={onPauseTimer}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--color-accent)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              ⏸ Pause
            </button>
          )}
          {!state.timer.running && state.timer.pausedRemainingSec !== null && (
            <button
              onClick={onResumeTimer}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--color-primary)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              ▶️ Resume
            </button>
          )}
          <button
            onClick={onResetTimer}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--color-destructive)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.9rem"
            }}
          >
            🔄 Reset
          </button>
          <button
            onClick={() => onExtendTimer(60)}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.9rem"
            }}
          >
            +60s
          </button>
          <button
            onClick={() => onExtendTimer(-30)}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.9rem"
            }}
          >
            -30s
          </button>
        </div>
      </div>

      {/* Agenda Management */}
      <div style={{
        marginBottom: "1rem",
        padding: "1rem",
        backgroundColor: "white",
        borderRadius: "4px",
        border: "1px solid #dee2e6"
      }}>
        <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Agenda Management</h4>
        
        {/* Edit existing items inline */}
        {state.agenda.map((item) => (
          editingItemId === item.id ? (
            <div key={item.id} style={{ 
              marginBottom: "0.75rem",
              padding: "0.75rem",
              backgroundColor: "#fff3cd",
              borderRadius: "4px"
            }}>
              <input
                placeholder="Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ 
                  padding: "0.4rem", 
                  width: "100%", 
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "3px"
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <input
                    placeholder="Minutes"
                    type="number"
                    min="0"
                    value={editMinutes}
                    onChange={(e) => setEditMinutes(e.target.value)}
                    style={{ 
                      padding: "0.4rem", 
                      width: "100%",
                      fontSize: "0.9rem",
                      border: "1px solid #ccc",
                      borderRadius: "3px"
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    placeholder="Seconds (0-59)"
                    type="number"
                    min="0"
                    max="59"
                    value={editSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (e.target.value === "" || (val >= 0 && val <= 59)) {
                        setEditSeconds(e.target.value);
                      }
                    }}
                    style={{ 
                      padding: "0.4rem", 
                      width: "100%",
                      fontSize: "0.9rem",
                      border: "1px solid #ccc",
                      borderRadius: "3px"
                    }}
                  />
                </div>
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ 
                  padding: "0.4rem", 
                  width: "100%", 
                  marginBottom: "0.5rem",
                  minHeight: "50px",
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                  border: "1px solid #ccc",
                  borderRadius: "3px"
                }}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={saveEditingAgenda}
                  style={{
                    flex: 1,
                    padding: "0.4rem",
                    backgroundColor: "var(--color-primary)",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  Save
                </button>
                <button
                  onClick={cancelEditingAgenda}
                  style={{
                    flex: 1,
                    padding: "0.4rem",
                    backgroundColor: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={item.id} style={{ 
              marginBottom: "0.5rem",
              padding: "0.5rem",
              backgroundColor: state.activeAgendaId === item.id ? "#fff3cd" : "#f8f9fa",
              border: `1px solid ${state.activeAgendaId === item.id ? "#ffc107" : "#dee2e6"}`,
              borderRadius: "3px",
              fontSize: "0.85rem"
            }}>
              <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
                {item.title} ({formatTime(item.durationSec)})
              </div>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {state.activeAgendaId !== item.id && (
                  <button
                    onClick={() => onSetActiveAgenda(item.id)}
                    style={{ 
                      padding: "0.2rem 0.4rem",
                      fontSize: "0.75rem",
                      backgroundColor: "#007bff",
                      color: "white",
                      border: "none",
                      borderRadius: "3px",
                      cursor: "pointer"
                    }}
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => startEditingAgenda(item)}
                  style={{ 
                    padding: "0.2rem 0.4rem",
                    fontSize: "0.75rem",
                    backgroundColor: "#17a2b8",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer"
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteAgenda(item.id)}
                  style={{ 
                    padding: "0.2rem 0.4rem",
                    fontSize: "0.75rem",
                    backgroundColor: "var(--color-destructive)",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer"
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        ))}

        {/* Add new item */}
        <div style={{ 
          marginTop: "0.75rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid #dee2e6"
        }}>
          <input
            placeholder="New agenda title"
            value={newAgendaTitle}
            onChange={(e) => setNewAgendaTitle(e.target.value)}
            style={{ 
              padding: "0.4rem", 
              width: "100%", 
              marginBottom: "0.5rem",
              fontSize: "0.9rem",
              border: "1px solid #ccc",
              borderRadius: "3px"
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <input
                placeholder="Minutes"
                type="number"
                min="0"
                value={newAgendaMinutes}
                onChange={(e) => setNewAgendaMinutes(e.target.value)}
                style={{ 
                  padding: "0.4rem", 
                  width: "100%",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "3px"
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                placeholder="Seconds (0-59)"
                type="number"
                min="0"
                max="59"
                value={newAgendaSeconds}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (e.target.value === "" || (val >= 0 && val <= 59)) {
                    setNewAgendaSeconds(e.target.value);
                  }
                }}
                style={{ 
                  padding: "0.4rem", 
                  width: "100%",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "3px"
                }}
              />
            </div>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={newAgendaNotes}
            onChange={(e) => setNewAgendaNotes(e.target.value)}
            style={{ 
              padding: "0.4rem", 
              width: "100%", 
              marginBottom: "0.5rem",
              minHeight: "50px",
              fontSize: "0.9rem",
              fontFamily: "inherit",
              border: "1px solid #ccc",
              borderRadius: "3px"
            }}
          />
          <button
            onClick={() => {
              if (newAgendaTitle) {
                // Convert minutes and seconds to total seconds
                const mins = parseInt(newAgendaMinutes) || 0;
                const secs = parseInt(newAgendaSeconds) || 0;
                // Validate seconds range
                const validSecs = Math.max(0, Math.min(59, secs));
                const totalSeconds = mins * 60 + validSecs;
                
                onAddAgenda(newAgendaTitle, totalSeconds, newAgendaNotes);
                setNewAgendaTitle("");
                setNewAgendaMinutes("");
                setNewAgendaSeconds("");
                setNewAgendaNotes("");
              }
            }}
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "var(--color-primary)",
              color: "white",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "bold"
            }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Voting Controls */}
      <div style={{
        padding: "1rem",
        backgroundColor: "white",
        borderRadius: "4px",
        border: "1px solid #dee2e6"
      }}>
        <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Voting</h4>
        {state.vote.open ? (
          <button
            onClick={onCloseVote}
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "var(--color-destructive)",
              color: "white",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "0.9rem"
            }}
          >
            Close Current Vote
          </button>
        ) : (
          <div>
            <input
              placeholder="Vote question"
              value={voteQuestion}
              onChange={(e) => setVoteQuestion(e.target.value)}
              style={{ 
                padding: "0.4rem", 
                width: "100%", 
                marginBottom: "0.5rem",
                fontSize: "0.9rem",
                border: "1px solid #ccc",
                borderRadius: "3px"
              }}
            />
            <input
              placeholder="Options (comma separated)"
              value={voteOptions}
              onChange={(e) => setVoteOptions(e.target.value)}
              style={{ 
                padding: "0.4rem", 
                width: "100%", 
                marginBottom: "0.5rem",
                fontSize: "0.9rem",
                border: "1px solid #ccc",
                borderRadius: "3px"
              }}
            />
            <button
              onClick={() => {
                if (voteQuestion && voteOptions) {
                  const opts = voteOptions.split(",").map(s => s.trim()).filter(Boolean);
                  if (opts.length >= 2) {
                    onOpenVote(voteQuestion, opts);
                    setVoteQuestion("");
                    setVoteOptions("Yes,No,Abstain");
                  }
                }
              }}
              style={{
                width: "100%",
                padding: "0.5rem",
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "bold"
              }}
            >
              Open Vote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
