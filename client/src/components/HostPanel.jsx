import React, { useState, useRef, useEffect } from "react";
import { formatTime } from "../utils/timeFormat.js";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "../styles/hostPanel.css";

// Preset templates with realistic meeting scenarios
const PRESET_TEMPLATES = [
  {
    name: "Annual League Meeting",
    items: [
      { title: "Welcome & Roll Call", durationSec: 300, notes: "Verify quorum and attendance" },
      { title: "Review Previous Minutes", durationSec: 600, notes: "Approve minutes from last meeting" },
      { title: "Financial Report", durationSec: 900, notes: "Budget review and upcoming expenses" },
      { title: "League Rules Update", durationSec: 1200, notes: "Discuss any rule changes or clarifications" },
      { title: "Schedule Planning", durationSec: 900, notes: "Finalize dates for next season" },
      { title: "Open Forum", durationSec: 600, notes: "Member questions and concerns" },
      { title: "Closing Remarks", durationSec: 300, notes: "Next meeting date and adjournment" }
    ]
  },
  {
    name: "Draft Lottery",
    items: [
      { title: "Opening & Verification", durationSec: 300, notes: "Confirm all team representatives present" },
      { title: "Draft Order Explanation", durationSec: 600, notes: "Review lottery system and odds" },
      { title: "Lottery Drawing", durationSec: 900, notes: "Conduct random selection process" },
      { title: "Order Announcement", durationSec: 600, notes: "Reveal draft positions 1-12" },
      { title: "Draft Date Setting", durationSec: 300, notes: "Finalize draft schedule" },
      { title: "Q&A Session", durationSec: 600, notes: "Address any questions about draft process" }
    ]
  },
  {
    name: "Trade Summit",
    items: [
      { title: "Trade Window Review", durationSec: 300, notes: "Confirm deadline and eligibility" },
      { title: "Proposed Trades Discussion", durationSec: 1800, notes: "Review submitted trade proposals" },
      { title: "Veto Review", durationSec: 900, notes: "Discuss any contested trades" },
      { title: "Trade Approval Votes", durationSec: 1200, notes: "Vote on disputed transactions" },
      { title: "Post-Trade Roster Check", durationSec: 600, notes: "Verify all rosters remain legal" },
      { title: "Next Steps", durationSec: 300, notes: "Outline remaining season schedule" }
    ]
  }
];

// Draggable agenda item component
function DraggableAgendaItem({ item, isActive, isEditing, onEdit, onSave, onCancel, onAction, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`agendaItemWrapper ${isDragging ? 'dragging' : ''}`}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

export default function HostPanel({ 
  state, 
  onAddAgenda,
  onUpdateAgenda,
  onDeleteAgenda,
  onReorderAgenda,
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
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditData, setInlineEditData] = useState({});
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");
  const [showTemplates, setShowTemplates] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  
  const menuRef = useRef(null);
  const inlineTitleRef = useRef(null);
  const inlineEditRef = useRef(null);

  // Load saved templates from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("agendaTemplates");
    if (stored) {
      try {
        setSavedTemplates(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse saved templates:", e);
      }
    }
  }, []);

  // Auto-focus title input when entering inline edit mode
  useEffect(() => {
    if (inlineEditId && inlineTitleRef.current) {
      inlineTitleRef.current.focus();
      inlineTitleRef.current.select();
    }
  }, [inlineEditId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
      // Save inline edit when clicking outside the edit area
      if (inlineEditRef.current && !inlineEditRef.current.contains(e.target) && inlineEditId) {
        // Call save function directly without useCallback to avoid circular dependency
        if (inlineEditId && inlineEditData.title && inlineEditData.title.trim()) {
          const mins = parseInt(inlineEditData.minutes) || 0;
          const secs = parseInt(inlineEditData.seconds) || 0;
          const validSecs = Math.max(0, Math.min(59, secs));
          const totalSeconds = mins * 60 + validSecs;
          
          onUpdateAgenda(inlineEditId, {
            title: inlineEditData.title,
            durationSec: totalSeconds,
            notes: inlineEditData.notes
          });
          
          setInlineEditId(null);
          setInlineEditData({});
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inlineEditId, inlineEditData, onUpdateAgenda]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Handle drag end - reorder agenda
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = state.agenda.findIndex((item) => item.id === active.id);
    const newIndex = state.agenda.findIndex((item) => item.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // Create new order array with IDs
    const newOrder = [...state.agenda];
    const [movedItem] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedItem);
    const orderedIds = newOrder.map((item) => item.id);
    
    // Call reorder callback
    if (onReorderAgenda) {
      onReorderAgenda(orderedIds);
    }
  };

  // Inline editing functions
  const saveInlineEdit = () => {
    if (!inlineEditId || !inlineEditData.title.trim()) return;
    
    const mins = parseInt(inlineEditData.minutes) || 0;
    const secs = parseInt(inlineEditData.seconds) || 0;
    const validSecs = Math.max(0, Math.min(59, secs));
    const totalSeconds = mins * 60 + validSecs;
    
    onUpdateAgenda(inlineEditId, {
      title: inlineEditData.title,
      durationSec: totalSeconds,
      notes: inlineEditData.notes
    });
    
    setInlineEditId(null);
    setInlineEditData({});
  };
  
  const startInlineEdit = (item) => {
    const totalSec = item.durationSec || 0;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    
    setInlineEditId(item.id);
    setInlineEditData({
      title: item.title,
      minutes: String(mins),
      seconds: String(secs),
      notes: item.notes || ""
    });
    setOpenMenuId(null);
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditData({});
  };

  const handleInlineKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveInlineEdit();
    } else if (e.key === "Escape") {
      cancelInlineEdit();
    }
  };

  // Quick action handlers
  const handleDuplicate = (item) => {
    const copy = {
      title: `${item.title} (Copy)`,
      durationSec: item.durationSec,
      notes: item.notes || ""
    };
    onAddAgenda(copy.title, copy.durationSec, copy.notes);
    setOpenMenuId(null);
  };

  const handleInsertAfter = (item) => {
    // Note: Backend API doesn't support position parameter yet.
    // This adds to end of list - users can drag to desired position.
    onAddAgenda("New Item", 300, "");
    setOpenMenuId(null);
  };

  const handleMoveToTop = (item) => {
    console.log('[HostPanel] handleMoveToTop called with item:', item);
    console.log('[HostPanel] current agenda:', state.agenda);
    const newOrder = [item, ...state.agenda.filter((a) => a.id !== item.id)];
    const orderedIds = newOrder.map((a) => a.id);
    console.log('[HostPanel] new orderedIds:', orderedIds);
    if (onReorderAgenda) {
      console.log('[HostPanel] calling onReorderAgenda with:', orderedIds);
      onReorderAgenda(orderedIds);
    } else {
      console.error('[HostPanel] onReorderAgenda is not defined!');
    }
    setOpenMenuId(null);
  };

  const handleMoveToBottom = (item) => {
    console.log('[HostPanel] handleMoveToBottom called with item:', item);
    console.log('[HostPanel] current agenda:', state.agenda);
    const newOrder = [...state.agenda.filter((a) => a.id !== item.id), item];
    const orderedIds = newOrder.map((a) => a.id);
    console.log('[HostPanel] new orderedIds:', orderedIds);
    if (onReorderAgenda) {
      console.log('[HostPanel] calling onReorderAgenda with:', orderedIds);
      onReorderAgenda(orderedIds);
    } else {
      console.error('[HostPanel] onReorderAgenda is not defined!');
    }
    setOpenMenuId(null);
  };

  const handleDeleteWithConfirm = (itemId) => {
    if (deleteConfirmId === itemId) {
      onDeleteAgenda(itemId);
      setDeleteConfirmId(null);
      setOpenMenuId(null);
    } else {
      setDeleteConfirmId(itemId);
    }
  };

  // Template management
  const saveAsTemplate = () => {
    if (!newTemplateName.trim()) return;
    
    const template = {
      name: newTemplateName,
      items: state.agenda.map((item) => ({
        title: item.title,
        durationSec: item.durationSec,
        notes: item.notes || ""
      }))
    };
    
    const updated = [...savedTemplates, template];
    setSavedTemplates(updated);
    localStorage.setItem("agendaTemplates", JSON.stringify(updated));
    setNewTemplateName("");
  };

  const loadTemplate = (template) => {
    // Note: This adds template items to the current agenda.
    // To replace the agenda, first delete unwanted items manually.
    template.items.forEach((item) => {
      onAddAgenda(item.title, item.durationSec, item.notes);
    });
  };

  const deleteTemplate = (index) => {
    const updated = savedTemplates.filter((_, i) => i !== index);
    setSavedTemplates(updated);
    localStorage.setItem("agendaTemplates", JSON.stringify(updated));
  };

  const exportTemplates = () => {
    const dataStr = JSON.stringify(savedTemplates, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agenda-templates.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importTemplates = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (Array.isArray(imported)) {
          const updated = [...savedTemplates, ...imported];
          setSavedTemplates(updated);
          localStorage.setItem("agendaTemplates", JSON.stringify(updated));
        }
      } catch (err) {
        console.error("Failed to import templates:", err);
      }
    };
    reader.readAsText(file);
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
            <div className="sectionLabel">Navigation</div>
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

        {/* Agenda Management with Drag & Drop */}
        <div className="card card-compact mb-lg">
          <div className="cardHeader">
            <h4 className="cardTitle">Agenda Management</h4>
          </div>
          <div className="cardBody">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={state.agenda.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {state.agenda.map((item) => (
                  <DraggableAgendaItem
                    key={item.id}
                    item={item}
                    isActive={state.activeAgendaId === item.id}
                    isEditing={inlineEditId === item.id}
                  >
                    {({ attributes, listeners, isDragging }) => (
                      <>
                        {inlineEditId === item.id ? (
                          <div className="agendaItemInlineEdit mb-sm" ref={inlineEditRef}>
                            <input
                              ref={inlineTitleRef}
                              className="inlineEditTitle"
                              value={inlineEditData.title}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, title: e.target.value })}
                              onKeyDown={handleInlineKeyDown}
                              placeholder="Title"
                            />
                            <div className="inlineEditDuration">
                              <input
                                className="inlineEditInput"
                                type="number"
                                min="0"
                                value={inlineEditData.minutes}
                                onChange={(e) => setInlineEditData({ ...inlineEditData, minutes: e.target.value })}
                                onKeyDown={handleInlineKeyDown}
                                placeholder="Min"
                              />
                              <span>:</span>
                              <input
                                className="inlineEditInput"
                                type="number"
                                min="0"
                                max="59"
                                value={inlineEditData.seconds}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (e.target.value === "" || (val >= 0 && val <= 59)) {
                                    setInlineEditData({ ...inlineEditData, seconds: e.target.value });
                                  }
                                }}
                                onKeyDown={handleInlineKeyDown}
                                placeholder="Sec"
                              />
                            </div>
                            <textarea
                              className="inlineEditNotes"
                              value={inlineEditData.notes}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, notes: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveInlineEdit();
                                } else if (e.key === "Escape") {
                                  cancelInlineEdit();
                                }
                              }}
                              placeholder="Notes (optional)"
                              rows="2"
                            />
                          </div>
                        ) : (
                          <div 
                            className={`agendaItem mb-sm ${state.activeAgendaId === item.id ? 'active' : ''}`}
                          >
                            <div className="agendaItemRow">
                              <button
                                className="dragHandle"
                                {...attributes}
                                {...listeners}
                                aria-label="Drag to reorder"
                              >
                                ⋮⋮
                              </button>
                              <div className="agendaItemContent" onClick={() => startInlineEdit(item)}>
                                <div className="agendaItemHeader">
                                  <span className="agendaItemTitle">{item.title}</span>
                                  <span className="pill pill-neutral">{formatTime(item.durationSec)}</span>
                                </div>
                                {item.notes && (
                                  <div className="agendaItemNotes">{item.notes}</div>
                                )}
                              </div>
                              <div className="agendaItemMenu">
                                <button
                                  className="menuTrigger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === item.id ? null : item.id);
                                    setDeleteConfirmId(null);
                                  }}
                                  aria-label="Quick actions"
                                >
                                  ⋯
                                </button>
                                {openMenuId === item.id && (
                                  <div className="quickActionsMenu" ref={menuRef}>
                                    {state.activeAgendaId !== item.id && (
                                      <button
                                        className="menuItem"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onSetActiveAgenda(item.id);
                                          setOpenMenuId(null);
                                        }}
                                      >
                                        ⭐ Set Active
                                      </button>
                                    )}
                                    <button
                                      className="menuItem"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDuplicate(item);
                                      }}
                                    >
                                      📋 Duplicate
                                    </button>
                                    <button
                                      className="menuItem"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInsertAfter(item);
                                      }}
                                    >
                                      ➕ Add New Item
                                    </button>
                                    <button
                                      className="menuItem"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveToTop(item);
                                      }}
                                    >
                                      ⬆️ Move to Top
                                    </button>
                                    <button
                                      className="menuItem"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveToBottom(item);
                                      }}
                                    >
                                      ⬇️ Move to Bottom
                                    </button>
                                    <button
                                      className="menuItem menuItemDanger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteWithConfirm(item.id);
                                      }}
                                    >
                                      {deleteConfirmId === item.id ? "⚠️ Confirm Delete?" : "🗑️ Delete"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </DraggableAgendaItem>
                ))}
              </SortableContext>
            </DndContext>

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

        {/* Templates */}
        <div className="card card-compact mb-lg">
          <div className="cardHeader">
            <h4 className="cardTitle">Templates</h4>
            <button
              className="btn btnIcon btnGhost btnSmall"
              onClick={() => setShowTemplates(!showTemplates)}
              aria-label={showTemplates ? "Hide templates" : "Show templates"}
            >
              {showTemplates ? "−" : "+"}
            </button>
          </div>
          {showTemplates && (
            <div className="cardBody">
              {/* Save current as template */}
              <div className="templateSaveSection mb-md">
                <label className="label">Save Current Agenda</label>
                <div className="flex gap-sm">
                  <input
                    className="input"
                    placeholder="Template name"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                  <button
                    className="btn btnSecondary btnSmall"
                    onClick={saveAsTemplate}
                    disabled={!newTemplateName.trim() || state.agenda.length === 0}
                  >
                    💾 Save
                  </button>
                </div>
              </div>

              {/* Preset templates */}
              <div className="templateSection mb-md">
                <label className="label">Preset Templates</label>
                {PRESET_TEMPLATES.map((template, idx) => (
                  <div key={idx} className="templateItem">
                    <span className="templateName">{template.name}</span>
                    <button
                      className="btn btnGhost btnSmall"
                      onClick={() => loadTemplate(template)}
                      title="Adds template items to current agenda"
                    >
                      Add Items
                    </button>
                  </div>
                ))}
              </div>

              {/* Saved templates */}
              {savedTemplates.length > 0 && (
                <div className="templateSection mb-md">
                  <label className="label">My Templates</label>
                  {savedTemplates.map((template, idx) => (
                    <div key={idx} className="templateItem">
                      <span className="templateName">{template.name}</span>
                      <div className="flex gap-xs">
                        <button
                          className="btn btnGhost btnSmall"
                          onClick={() => loadTemplate(template)}
                          title="Adds template items to current agenda"
                        >
                          Add Items
                        </button>
                        <button
                          className="btn btnDanger btnSmall"
                          onClick={() => deleteTemplate(idx)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Import/Export */}
              <div className="templateActions">
                <button
                  className="btn btnSecondary btnSmall btnFull"
                  onClick={exportTemplates}
                  disabled={savedTemplates.length === 0}
                >
                  📤 Export Templates
                </button>
                <label className="btn btnSecondary btnSmall btnFull mt-sm">
                  📥 Import Templates
                  <input
                    type="file"
                    accept=".json"
                    onChange={importTemplates}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </div>
          )}
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
