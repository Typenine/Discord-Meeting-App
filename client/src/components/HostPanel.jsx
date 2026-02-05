import React, { useState } from "react";
import { formatTime } from "../utils/timeFormat.js";
import "../styles/hostPanel.css";

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
    const totalSec = item.durationSec || 0;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    setEditMinutes(String(mins));
    setEditSeconds(String(secs));
    setEditNotes(item.notes || "");
  };

  const saveEditingAgenda = () => {
    if (editingItemId && editTitle) {
      const mins = parseInt(editMinutes) || 0;
      const secs = parseInt(editSeconds) || 0;
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
      <div className="hostPanelCollapsed">
        <button
          className="btn btnPrimary"
          onClick={() => setIsCollapsed(false)}
        >
          ▶ Host Controls
        </button>
      </div>
    );
  }

  return (
    <aside className="hostPanel">
      <div className="hostPanelHeader">
        <h3 className="hostPanelTitle">Host Control Room</h3>
        <button
          className="btn btnIcon btnGhost"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse panel"
        >
          ×
        </button>
      </div>

      <div className="hostPanelContent">
        {/* Agenda Navigation */}
        {state.agenda.length > 1 && (
          <div className="mb-lg">
            <div className="sectionLabel">
              Navigation
            </div>
            <div className="flex gap-sm">
              <button
                className="btn btnSecondary btnSmall btnFull"
                onClick={onPrevAgendaItem}
              >
                ◀ Prev
              </button>
              <button
                className="btn btnSecondary btnSmall btnFull"
                onClick={onNextAgendaItem}
              >
                Next ▶
              </button>
            </div>
          </div>
        )}

        {/* Timer Controls */}
        <div className="card card-compact mb-lg">
          <div className="cardHeader">
            <h4 className="cardTitle">Timer Controls</h4>
          </div>
          <div className="cardBody">
            <div className="timerButtonGroup">
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
                className="btn btnAccent btnSmall"
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
        <div className="card card-compact mb-lg">
          <div className="cardHeader">
            <h4 className="cardTitle">Agenda Management</h4>
          </div>
          <div className="cardBody">
            {state.agenda.map((item) => (
              editingItemId === item.id ? (
                <div key={item.id} className="agendaItemEdit mb-md">
                  <label className="label">Title</label>
                  <input
                    className="input mb-sm"
                    placeholder="Title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <label className="label">Duration</label>
                  <div className="flex gap-sm mb-sm">
                    <input
                      className="input"
                      placeholder="Min"
                      type="number"
                      min="0"
                      value={editMinutes}
                      onChange={(e) => setEditMinutes(e.target.value)}
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
                    />
                  </div>
                  <label className="label">Notes</label>
                  <textarea
                    className="input mb-sm"
                    placeholder="Notes (optional)"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows="2"
                  />
                  <div className="flex gap-sm">
                    <button
                      className="btn btnPrimary btnSmall btnFull"
                      onClick={saveEditingAgenda}
                    >
                      Save
                    </button>
                    <button
                      className="btn btnSecondary btnSmall btnFull"
                      onClick={cancelEditingAgenda}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  key={item.id} 
                  className={`agendaItem mb-sm ${state.activeAgendaId === item.id ? 'active' : ''}`}
                >
                  <div className="agendaItemHeader">
                    <span className="agendaItemTitle">{item.title}</span>
                    <span className="pill pill-neutral">{formatTime(item.durationSec)}</span>
                  </div>
                  <div className="agendaItemActions">
                    {state.activeAgendaId !== item.id && (
                      <button
                        className="btn btnPrimary btnSmall"
                        onClick={() => onSetActiveAgenda(item.id)}
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      className="btn btnGhost btnSmall"
                      onClick={() => startEditingAgenda(item)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btnDanger btnSmall"
                      onClick={() => onDeleteAgenda(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            ))}

            {/* Add new item */}
            <div className="agendaItemAdd mt-lg">
              <label className="label">New Agenda Item</label>
              <input
                className="input mb-sm"
                placeholder="Title"
                value={newAgendaTitle}
                onChange={(e) => setNewAgendaTitle(e.target.value)}
              />
              <label className="label">Duration</label>
              <div className="flex gap-sm mb-sm">
                <input
                  className="input"
                  placeholder="Minutes"
                  type="number"
                  min="0"
                  value={newAgendaMinutes}
                  onChange={(e) => setNewAgendaMinutes(e.target.value)}
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
                />
              </div>
              <label className="label">Notes</label>
              <textarea
                className="input mb-sm"
                placeholder="Notes (optional)"
                value={newAgendaNotes}
                onChange={(e) => setNewAgendaNotes(e.target.value)}
                rows="2"
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
        <div className="card card-compact">
          <div className="cardHeader">
            <h4 className="cardTitle">Voting</h4>
          </div>
          <div className="cardBody">
            {state.vote.open ? (
              <div>
                <div className="pill pill-success mb-md">Vote in Progress</div>
                <button
                  className="btn btnDanger btnFull"
                  onClick={onCloseVote}
                >
                  Close Current Vote
                </button>
              </div>
            ) : (
              <div>
                <label className="label">Question</label>
                <input
                  className="input mb-sm"
                  placeholder="Vote question"
                  value={voteQuestion}
                  onChange={(e) => setVoteQuestion(e.target.value)}
                />
                <label className="label">Options</label>
                <input
                  className="input mb-sm"
                  placeholder="Options (comma separated)"
                  value={voteOptions}
                  onChange={(e) => setVoteOptions(e.target.value)}
                />
                <span className="helper">Separate options with commas</span>
                <button
                  className="btn btnPrimary btnFull mt-md"
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
    </aside>
  );
}
