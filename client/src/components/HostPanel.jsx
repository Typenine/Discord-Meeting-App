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
        top: "calc(var(--topbar-height) + var(--spacing-lg))",
        right: "var(--spacing-lg)",
        zIndex: 50
      }}>
        <button
          className="btn btnPrimary"
          onClick={() => setIsCollapsed(false)}
          style={{
            boxShadow: "var(--shadow-lg)"
          }}
        >
          ▶ Host Controls
        </button>
      </div>
    );
  }

  return (
    <div className="layoutSide" style={{
      height: "calc(100vh - var(--topbar-height))",
      position: "relative"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--spacing-lg)"
      }}>
        <h3 style={{ margin: 0, color: "var(--color-text)" }}>Host Controls</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: "var(--font-size-2xl)",
            cursor: "pointer",
            color: "var(--color-muted)",
            padding: 0,
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      {/* Agenda Navigation */}
      {state.agenda.length > 1 && (
        <div style={{ marginBottom: "var(--spacing-lg)" }}>
          <h4 style={{ 
            fontSize: "var(--font-size-sm)",
            fontWeight: "600",
            color: "var(--color-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "var(--spacing-sm)"
          }}>
            Navigation
          </h4>
          <div style={{ 
            display: "flex", 
            gap: "var(--spacing-sm)"
          }}>
            <button
              className="btn btnSecondary btnSmall"
              onClick={onPrevAgendaItem}
              style={{ flex: 1 }}
            >
              ◀ Prev
            </button>
            <button
              className="btn btnSecondary btnSmall"
              onClick={onNextAgendaItem}
              style={{ flex: 1 }}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}

      {/* Timer Controls */}
      <div className="card" style={{ marginBottom: "var(--spacing-lg)" }}>
        <div style={{ 
          padding: "var(--spacing-lg)",
          borderBottom: `1px solid var(--color-border)`
        }}>
          <h4 style={{ margin: 0, fontSize: "var(--font-size-base)" }}>Timer Controls</h4>
        </div>
        <div style={{ padding: "var(--spacing-lg)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-sm)" }}>
            {!state.timer.running && state.timer.pausedRemainingSec === null && (
              <button
                className="btn btnPrimary btnSmall"
                onClick={onStartTimer}
                disabled={state.timer.durationSec <= 0}
              >
                ▶️ Start
              </button>
            )}
            {state.timer.running && (
              <button
                className="btn btnAccent btnSmall"
                onClick={onPauseTimer}
              >
                ⏸ Pause
              </button>
            )}
            {!state.timer.running && state.timer.pausedRemainingSec !== null && (
              <button
                className="btn btnPrimary btnSmall"
                onClick={onResumeTimer}
              >
                ▶️ Resume
              </button>
            )}
            <button
              className="btn btnDanger btnSmall"
              onClick={onResetTimer}
            >
              🔄 Reset
            </button>
            <button
              className="btn btnSecondary btnSmall"
              onClick={() => onExtendTimer(60)}
            >
              +60s
            </button>
            <button
              className="btn btnSecondary btnSmall"
              onClick={() => onExtendTimer(-30)}
            >
              -30s
            </button>
          </div>
        </div>
      </div>

      {/* Agenda Management */}
      <div className="card" style={{ marginBottom: "var(--spacing-lg)" }}>
        <div style={{ 
          padding: "var(--spacing-lg)",
          borderBottom: `1px solid var(--color-border)`
        }}>
          <h4 style={{ margin: 0, fontSize: "var(--font-size-base)" }}>Agenda Management</h4>
        </div>
        <div style={{ padding: "var(--spacing-lg)" }}>
          {/* Edit existing items inline */}
          {state.agenda.map((item) => (
            editingItemId === item.id ? (
              <div key={item.id} style={{ 
                marginBottom: "var(--spacing-md)",
                padding: "var(--spacing-md)",
                backgroundColor: "#fffbf0",
                borderRadius: "var(--radius-sm)",
                border: `1px solid var(--color-accent)`
              }}>
                <input
                  className="input"
                  placeholder="Title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ marginBottom: "var(--spacing-sm)" }}
                />
                <div style={{ display: "flex", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-sm)" }}>
                  <input
                    className="input"
                    placeholder="Min"
                    type="number"
                    min="0"
                    value={editMinutes}
                    onChange={(e) => setEditMinutes(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input
                    className="input"
                    placeholder="Sec"
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
                    style={{ flex: 1 }}
                  />
                </div>
                <textarea
                  className="input"
                  placeholder="Notes (optional)"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  style={{ marginBottom: "var(--spacing-sm)", minHeight: "50px", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
                  <button
                    className="btn btnPrimary btnSmall"
                    onClick={saveEditingAgenda}
                    style={{ flex: 1 }}
                  >
                    Save
                  </button>
                  <button
                    className="btn btnSecondary btnSmall"
                    onClick={cancelEditingAgenda}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={item.id} style={{ 
                marginBottom: "var(--spacing-sm)",
                padding: "var(--spacing-sm)",
                backgroundColor: state.activeAgendaId === item.id ? "#fffbf0" : "var(--color-surface)",
                border: `1px solid ${state.activeAgendaId === item.id ? "var(--color-accent)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-sm)"
              }}>
                <div style={{ fontWeight: "bold", marginBottom: "var(--spacing-xs)" }}>
                  {item.title} ({formatTime(item.durationSec)})
                </div>
                <div style={{ display: "flex", gap: "var(--spacing-xs)", flexWrap: "wrap" }}>
                  {state.activeAgendaId !== item.id && (
                    <button
                      className="btn btnPrimary"
                      onClick={() => onSetActiveAgenda(item.id)}
                      style={{ 
                        padding: "var(--spacing-xs) var(--spacing-sm)",
                        fontSize: "var(--font-size-xs)"
                      }}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    className="btn btnSecondary"
                    onClick={() => startEditingAgenda(item)}
                    style={{ 
                      padding: "var(--spacing-xs) var(--spacing-sm)",
                      fontSize: "var(--font-size-xs)"
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btnDanger"
                    onClick={() => onDeleteAgenda(item.id)}
                    style={{ 
                      padding: "var(--spacing-xs) var(--spacing-sm)",
                      fontSize: "var(--font-size-xs)"
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
            marginTop: "var(--spacing-lg)",
            paddingTop: "var(--spacing-lg)",
            borderTop: `1px solid var(--color-border)`
          }}>
            <input
              className="input"
              placeholder="New agenda title"
              value={newAgendaTitle}
              onChange={(e) => setNewAgendaTitle(e.target.value)}
              style={{ marginBottom: "var(--spacing-sm)" }}
            />
            <div style={{ display: "flex", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-sm)" }}>
              <input
                className="input"
                placeholder="Minutes"
                type="number"
                min="0"
                value={newAgendaMinutes}
                onChange={(e) => setNewAgendaMinutes(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                className="input"
                placeholder="Seconds"
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
                style={{ flex: 1 }}
              />
            </div>
            <textarea
              className="input"
              placeholder="Notes (optional)"
              value={newAgendaNotes}
              onChange={(e) => setNewAgendaNotes(e.target.value)}
              style={{ marginBottom: "var(--spacing-sm)", minHeight: "50px", resize: "vertical" }}
            />
            <button
              className="btn btnPrimary btnFull"
              onClick={() => {
                if (newAgendaTitle) {
                  const mins = parseInt(newAgendaMinutes) || 0;
                  const secs = parseInt(newAgendaSeconds) || 0;
                  const validSecs = Math.max(0, Math.min(59, secs));
                  const totalSeconds = mins * 60 + validSecs;
                  
                  onAddAgenda(newAgendaTitle, totalSeconds, newAgendaNotes);
                  setNewAgendaTitle("");
                  setNewAgendaMinutes("");
                  setNewAgendaSeconds("");
                  setNewAgendaNotes("");
                }
              }}
            >
              + Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Voting Controls */}
      <div className="card">
        <div style={{ 
          padding: "var(--spacing-lg)",
          borderBottom: `1px solid var(--color-border)`
        }}>
          <h4 style={{ margin: 0, fontSize: "var(--font-size-base)" }}>Voting</h4>
        </div>
        <div style={{ padding: "var(--spacing-lg)" }}>
          {state.vote.open ? (
            <button
              className="btn btnDanger btnFull"
              onClick={onCloseVote}
            >
              Close Current Vote
            </button>
          ) : (
            <div>
              <input
                className="input"
                placeholder="Vote question"
                value={voteQuestion}
                onChange={(e) => setVoteQuestion(e.target.value)}
                style={{ marginBottom: "var(--spacing-sm)" }}
              />
              <input
                className="input"
                placeholder="Options (comma separated)"
                value={voteOptions}
                onChange={(e) => setVoteOptions(e.target.value)}
                style={{ marginBottom: "var(--spacing-sm)" }}
              />
              <button
                className="btn btnPrimary btnFull"
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
              >
                Open Vote
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
