// Inline editing component for agenda items
// Supports blur-to-save, Enter-to-save, Escape-to-cancel

import React, { useState, useEffect, useRef } from "react";

export default function AgendaItemInlineEditor({ 
  item, 
  onSaveChanges, 
  onCancelEdit,
  isExpanded 
}) {
  const [localTitle, setLocalTitle] = useState(item.title);
  const [localMinutes, setLocalMinutes] = useState(Math.floor(item.durationSec / 60));
  const [localSeconds, setLocalSeconds] = useState(item.durationSec % 60);
  const [localNotes, setLocalNotes] = useState(item.notes || "");
  const [notesVisible, setNotesVisible] = useState(isExpanded || (item.notes && item.notes.length > 0));
  
  const titleInputRef = useRef(null);
  
  useEffect(() => {
    // Focus title input when editor mounts
    if (titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, []);
  
  const computeTotalSeconds = () => {
    const mins = Math.max(0, parseInt(localMinutes) || 0);
    const secs = Math.max(0, Math.min(59, parseInt(localSeconds) || 0));
    return mins * 60 + secs;
  };
  
  const handleCommit = () => {
    if (!localTitle.trim()) {
      // Don't save empty titles
      return;
    }
    
    onSaveChanges({
      title: localTitle.trim(),
      durationSec: computeTotalSeconds(),
      notes: localNotes.trim()
    });
  };
  
  const handleAbort = () => {
    onCancelEdit();
  };
  
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleAbort();
    }
  };
  
  const handleBlur = (e) => {
    // Check if we're moving to another element within this editor
    const currentTarget = e.currentTarget;
    
    // Use setTimeout to let the blur complete before checking activeElement
    setTimeout(() => {
      if (!currentTarget.contains(document.activeElement)) {
        // We've left the editor entirely - save changes
        handleCommit();
      }
    }, 100);
  };
  
  return (
    <div 
      className="agendaInlineEdit" 
      onBlur={handleBlur}
      onKeyDown={handleKeyPress}
    >
      <div className="editRow">
        <label className="editLabel">Title</label>
        <input
          ref={titleInputRef}
          type="text"
          className="input"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          placeholder="Enter agenda item title"
        />
      </div>
      
      <div className="editRow editRowSplit">
        <div className="editColumn">
          <label className="editLabel">Minutes</label>
          <input
            type="number"
            className="input"
            min="0"
            value={localMinutes}
            onChange={(e) => setLocalMinutes(e.target.value)}
          />
        </div>
        <div className="editColumn">
          <label className="editLabel">Seconds</label>
          <input
            type="number"
            className="input"
            min="0"
            max="59"
            value={localSeconds}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
                setLocalSeconds(val);
              }
            }}
          />
        </div>
      </div>
      
      <div className="editRow">
        <button
          type="button"
          className="btn btnGhost btnSmall btnFull"
          onClick={() => setNotesVisible(!notesVisible)}
        >
          {notesVisible ? "▼ Hide Notes" : "▶ Show Notes"}
        </button>
      </div>
      
      {notesVisible && (
        <div className="editRow">
          <label className="editLabel">Notes</label>
          <textarea
            className="input"
            rows="3"
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Optional notes for this agenda item"
          />
        </div>
      )}
      
      <div className="editRow editActions">
        <button
          type="button"
          className="btn btnPrimary btnSmall"
          onClick={handleCommit}
        >
          ✓ Save
        </button>
        <button
          type="button"
          className="btn btnSecondary btnSmall"
          onClick={handleAbort}
        >
          ✕ Cancel
        </button>
        <span className="editHint">Enter to save, Esc to cancel</span>
      </div>
    </div>
  );
}
