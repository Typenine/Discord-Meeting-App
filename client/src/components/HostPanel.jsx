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
  send,
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
  onCloseVote,
  onToggleBallot
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaMinutes, setNewAgendaMinutes] = useState("");
  const [newAgendaSeconds, setNewAgendaSeconds] = useState("");
  const [newAgendaNotes, setNewAgendaNotes] = useState("");
  const [newAgendaType, setNewAgendaType] = useState("normal");
  const [newAgendaDescription, setNewAgendaDescription] = useState("");
  const [newAgendaLink, setNewAgendaLink] = useState("");
  const [newAgendaCategory, setNewAgendaCategory] = useState("");
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditData, setInlineEditData] = useState({});
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [voteQuestion, setVoteQuestion] = useState("");
  const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");
  const [showTemplates, setShowTemplates] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [hasRequestedTemplates, setHasRequestedTemplates] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  
  const menuRef = useRef(null);
  const inlineTitleRef = useRef(null);
  const inlineEditRef = useRef(null);

  // Request templates from server on mount and when connection is established
  useEffect(() => {
    if (send && !hasRequestedTemplates && state?.sessionId) {
      console.log("[HostPanel] Requesting templates from server");
      send({ type: "TEMPLATE_LIST" });
      setHasRequestedTemplates(true);
    }
  }, [send, hasRequestedTemplates, state?.sessionId]);

  // Handle template-related WebSocket messages via state updates
  useEffect(() => {
    if (state?.templates) {
      console.log("[HostPanel] Received templates from server:", state.templates);
      setSavedTemplates(state.templates);
      
      // Migration: Import localStorage templates if server has none and we haven't migrated yet
      if (!migrationComplete && state.templates.length === 0) {
        const stored = localStorage.getItem("agendaTemplates");
        const migrated = localStorage.getItem("agendaTemplatesMigrated");
        
        if (stored && !migrated) {
          try {
            const localTemplates = JSON.parse(stored);
            if (Array.isArray(localTemplates) && localTemplates.length > 0) {
              console.log("[HostPanel] Migrating", localTemplates.length, "templates from localStorage to server");
              
              // Convert old format to new format with required fields
              const templatesForImport = localTemplates.map(template => ({
                name: template.name,
                items: template.items.map(item => ({
                  title: item.title,
                  durationSec: item.durationSec,
                  notes: item.notes || "",
                  type: item.type || "regular",
                  description: item.description || "",
                  link: item.link || "",
                  category: item.category || "",
                  onBallot: item.onBallot || false
                }))
              }));
              
              send({ type: "TEMPLATE_IMPORT", templates: templatesForImport });
              localStorage.setItem("agendaTemplatesMigrated", "true");
              setMigrationComplete(true);
            }
          } catch (e) {
            console.error("[HostPanel] Failed to migrate templates:", e);
          }
        }
      }
    }
  }, [state?.templates, send, migrationComplete]);

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
            notes: inlineEditData.notes,
            type: inlineEditData.type,
            description: inlineEditData.description,
            link: inlineEditData.link,
            category: inlineEditData.category
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
      notes: inlineEditData.notes,
      type: inlineEditData.type,
      description: inlineEditData.description,
      link: inlineEditData.link,
      category: inlineEditData.category
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
      notes: item.notes || "",
      type: item.type || "normal",
      description: item.description || "",
      link: item.link || "",
      category: item.category || ""
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
      notes: item.notes || "",
      type: item.type || "normal",
      description: item.description || "",
      link: item.link || "",
      category: item.category || ""
    };
    // Pass all fields as separate parameters for backward compatibility with existing API
    onAddAgenda(copy.title, copy.durationSec, copy.notes, copy.type, copy.description, copy.link, copy.category);
    setOpenMenuId(null);
  };

  const handleInsertAfter = (item) => {
    // Note: Backend API doesn't support position parameter yet.
    // This adds to end of list - users can drag to desired position.
    onAddAgenda("New Item", 300, "");
    setOpenMenuId(null);
  };

  const handleMoveToTop = (item) => {
    console.log('[HostPanel] handleMoveToTop CALLED - item:', item);
    console.log('[HostPanel] state.agenda:', state.agenda);
    console.log('[HostPanel] onReorderAgenda exists?', !!onReorderAgenda);
    
    const newOrder = [item, ...state.agenda.filter((a) => a.id !== item.id)];
    const orderedIds = newOrder.map((a) => a.id);
    
    console.log('[HostPanel] newOrder:', newOrder);
    console.log('[HostPanel] orderedIds:', orderedIds);
    
    if (onReorderAgenda) {
      console.log('[HostPanel] Calling onReorderAgenda with:', orderedIds);
      onReorderAgenda(orderedIds);
      console.log('[HostPanel] onReorderAgenda called successfully');
    } else {
      console.error('[HostPanel] ERROR: onReorderAgenda is undefined!');
    }
    setOpenMenuId(null);
  };

  const handleMoveToBottom = (item) => {
    console.log('[HostPanel] handleMoveToBottom CALLED - item:', item);
    console.log('[HostPanel] state.agenda:', state.agenda);
    console.log('[HostPanel] onReorderAgenda exists?', !!onReorderAgenda);
    
    const newOrder = [...state.agenda.filter((a) => a.id !== item.id), item];
    const orderedIds = newOrder.map((a) => a.id);
    
    console.log('[HostPanel] newOrder:', newOrder);
    console.log('[HostPanel] orderedIds:', orderedIds);
    
    if (onReorderAgenda) {
      console.log('[HostPanel] Calling onReorderAgenda with:', orderedIds);
      onReorderAgenda(orderedIds);
      console.log('[HostPanel] onReorderAgenda called successfully');
    } else {
      console.error('[HostPanel] ERROR: onReorderAgenda is undefined!');
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
    
    const items = state.agenda.map((item) => ({
      title: item.title,
      durationSec: item.durationSec,
      notes: item.notes || "",
      type: item.type || "regular",
      description: item.description || "",
      link: item.link || "",
      category: item.category || "",
      onBallot: item.onBallot || false
    }));
    
    console.log("[HostPanel] Saving template:", newTemplateName);
    send({ type: "TEMPLATE_SAVE", name: newTemplateName, items });
    setNewTemplateName("");
    setTemplateError("");
  };

  const loadTemplate = (template) => {
    // Note: This adds template items to the current agenda.
    // To replace the agenda, first delete unwanted items manually.
    template.items.forEach((item) => {
      onAddAgenda(
        item.title, 
        item.durationSec, 
        item.notes, 
        item.type, 
        item.description, 
        item.link, 
        item.category
      );
    });
  };

  const deleteTemplate = (templateId) => {
    console.log("[HostPanel] Deleting template:", templateId);
    send({ type: "TEMPLATE_DELETE", templateId });
    setTemplateError("");
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
        if (Array.isArray(imported) && imported.length > 0) {
          // Convert imported templates to format expected by server (no IDs needed)
          const templatesForImport = imported.map(template => ({
            name: template.name,
            items: template.items.map(item => ({
              title: item.title,
              durationSec: item.durationSec,
              notes: item.notes || "",
              type: item.type || "regular",
              description: item.description || "",
              link: item.link || "",
              category: item.category || "",
              onBallot: item.onBallot || false
            }))
          }));
          
          console.log("[HostPanel] Importing", templatesForImport.length, "templates");
          send({ type: "TEMPLATE_IMPORT", templates: templatesForImport });
          setTemplateError("");
        }
      } catch (err) {
        console.error("[HostPanel] Failed to import templates:", err);
        setTemplateError("Failed to import templates. Please check file format.");
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
            {state.timeBankEnabled && state.currentAgendaItemId && (
              <button
                className="btn btnSuccess btnSmall btnFull"
                style={{ marginTop: "var(--spacing-sm)" }}
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/session/${state.id}/agenda/complete`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        userId: localStorage.getItem('userId')
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      console.error('Failed to complete agenda item:', res.status, data);
                    }
                  } catch (err) {
                    console.error('Failed to complete agenda item:', err);
                  }
                }}
              >
                ✓ Complete & Next
              </button>
            )}
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

        {/* Time Bank Controls */}
        <div className="card card-compact mb-lg">
          <div className="cardHeader">
            <h4 className="cardTitle">Time Bank</h4>
          </div>
          <div className="cardBody">
            <div style={{ marginBottom: "var(--spacing-md)" }}>
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={state.timeBankEnabled || false}
                  onChange={async (e) => {
                    try {
                      const res = await fetch(`/api/session/${state.id}/timebank/toggle`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          userId: localStorage.getItem('userId'), 
                          enabled: e.target.checked 
                        }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        console.error('Failed to toggle time bank:', res.status, data);
                      }
                    } catch (err) {
                      console.error('Failed to toggle time bank:', err);
                    }
                  }}
                />
                <span style={{ marginLeft: "var(--spacing-sm)" }}>Enable Time Bank</span>
              </label>
            </div>
            
            {state.timeBankEnabled && (
              <div>
                <div style={{ 
                  padding: "var(--spacing-md)",
                  background: "rgba(0, 0, 0, 0.3)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "var(--spacing-md)",
                  textAlign: "center"
                }}>
                  <div style={{ 
                    fontSize: "var(--font-size-sm)",
                    color: "var(--color-text-muted)",
                    marginBottom: "var(--spacing-xs)"
                  }}>
                    Available Bank Time
                  </div>
                  <div style={{ 
                    fontSize: "var(--font-size-xl)",
                    fontFamily: "var(--font-family-mono)",
                    fontWeight: "var(--font-weight-bold)",
                    color: "var(--color-primary)"
                  }}>
                    {formatTime(state.timeBankSec || 0)}
                  </div>
                </div>
                
                {state.timeBankSec > 0 && (
                  <div style={{ display: "flex", gap: "var(--spacing-xs)" }}>
                    <button
                      className="btn btnSuccess btnSmall"
                      onClick={async () => {
                        const amount = Math.min(30, state.timeBankSec);
                        try {
                          const res = await fetch(`/api/session/${state.id}/timebank/apply`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              userId: localStorage.getItem('userId'), 
                              seconds: amount 
                            }),
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            console.error('Failed to apply time bank:', res.status, data);
                          }
                        } catch (err) {
                          console.error('Failed to apply time bank:', err);
                        }
                      }}
                      disabled={state.timeBankSec <= 0}
                    >
                      Apply +{Math.min(30, state.timeBankSec)}s
                    </button>
                    <button
                      className="btn btnSuccess btnSmall"
                      onClick={async () => {
                        const amount = Math.min(60, state.timeBankSec);
                        try {
                          const res = await fetch(`/api/session/${state.id}/timebank/apply`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              userId: localStorage.getItem('userId'), 
                              seconds: amount 
                            }),
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            console.error('Failed to apply time bank:', res.status, data);
                          }
                        } catch (err) {
                          console.error('Failed to apply time bank:', err);
                        }
                      }}
                      disabled={state.timeBankSec <= 0}
                    >
                      Apply +1:00
                    </button>
                  </div>
                )}
              </div>
            )}
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
                            <select
                              className="inlineEditSelect"
                              value={inlineEditData.type || "normal"}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, type: e.target.value })}
                              style={{ marginTop: "var(--spacing-xs)" }}
                            >
                              <option value="normal">Normal Item</option>
                              <option value="proposal">Proposal Item</option>
                            </select>
                            {inlineEditData.type === "proposal" && (
                              <>
                                <textarea
                                  className="inlineEditNotes"
                                  value={inlineEditData.description || ""}
                                  onChange={(e) => setInlineEditData({ ...inlineEditData, description: e.target.value })}
                                  placeholder="Proposal description"
                                  rows="2"
                                  style={{ marginTop: "var(--spacing-xs)" }}
                                />
                                <input
                                  className="inlineEditTitle"
                                  value={inlineEditData.link || ""}
                                  onChange={(e) => setInlineEditData({ ...inlineEditData, link: e.target.value })}
                                  placeholder="Proposal link URL"
                                  style={{ marginTop: "var(--spacing-xs)" }}
                                />
                              </>
                            )}
                            <input
                              className="inlineEditTitle"
                              value={inlineEditData.category || ""}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, category: e.target.value })}
                              placeholder="Category (optional, e.g., Rules, Budget)"
                              style={{ marginTop: "var(--spacing-xs)" }}
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
                                  <span className="agendaItemTitle">
                                    {item.title}
                                    {item.type === "proposal" && <span className="pill pill-accent" style={{ marginLeft: "var(--spacing-xs)" }}>📋 Proposal</span>}
                                    {item.onBallot && <span className="pill pill-success" style={{ marginLeft: "var(--spacing-xs)" }}>🗳️ On Ballot</span>}
                                    {item.category && <span className="pill pill-neutral" style={{ marginLeft: "var(--spacing-xs)" }}>🏷️ {item.category}</span>}
                                  </span>
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
                                    {item.type === "proposal" && onToggleBallot && (
                                      <button
                                        className="menuItem"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onToggleBallot(item.id);
                                          setOpenMenuId(null);
                                        }}
                                      >
                                        {item.onBallot ? "❌ Remove from Ballot" : "🗳️ Add to Ballot"}
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
                                        console.log('[HostPanel] Move to Top button CLICKED');
                                        e.stopPropagation();
                                        handleMoveToTop(item);
                                      }}
                                    >
                                      ⬆️ Move to Top
                                    </button>
                                    <button
                                      className="menuItem"
                                      onClick={(e) => {
                                        console.log('[HostPanel] Move to Bottom button CLICKED');
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
              <label className="label">Type</label>
              <select
                className="input mb-sm"
                value={newAgendaType}
                onChange={(e) => setNewAgendaType(e.target.value)}
              >
                <option value="normal">Normal Item</option>
                <option value="proposal">Proposal Item</option>
              </select>
              {newAgendaType === "proposal" && (
                <>
                  <label className="label">Proposal Description</label>
                  <textarea
                    className="input mb-sm"
                    placeholder="Description of the proposal"
                    value={newAgendaDescription}
                    onChange={(e) => setNewAgendaDescription(e.target.value)}
                    rows="2"
                  />
                  <label className="label">Proposal Link</label>
                  <input
                    className="input mb-sm"
                    placeholder="https://... (link to proposal document)"
                    value={newAgendaLink}
                    onChange={(e) => setNewAgendaLink(e.target.value)}
                  />
                </>
              )}
              <label className="label">Category (optional)</label>
              <input
                className="input mb-sm"
                placeholder="e.g., Rules, Budget, Draft"
                value={newAgendaCategory}
                onChange={(e) => setNewAgendaCategory(e.target.value)}
              />
              <button
                className="btn btnPrimary btnFull"
                onClick={() => {
                  if (newAgendaTitle) {
                    const mins = parseInt(newAgendaMinutes) || 0;
                    const secs = parseInt(newAgendaSeconds) || 0;
                    const validSecs = Math.max(0, Math.min(59, secs));
                    const totalSeconds = mins * 60 + validSecs;
                    
                    onAddAgenda(newAgendaTitle, totalSeconds, newAgendaNotes, newAgendaType, newAgendaDescription, newAgendaLink, newAgendaCategory);
                    setNewAgendaTitle("");
                    setNewAgendaMinutes("");
                    setNewAgendaSeconds("");
                    setNewAgendaNotes("");
                    setNewAgendaType("normal");
                    setNewAgendaDescription("");
                    setNewAgendaLink("");
                    setNewAgendaCategory("");
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
                {templateError && (
                  <div className="error-message" style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    {templateError}
                  </div>
                )}
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
                  {savedTemplates.map((template) => (
                    <div key={template.id} className="templateItem">
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
                          onClick={() => deleteTemplate(template.id)}
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

        {/* Ballot Queue */}
        {state.agenda && state.agenda.some(item => item.type === "proposal") && (
          <div className="card card-compact mb-lg">
            <div className="cardHeader">
              <h4 className="cardTitle">Ballot Queue</h4>
            </div>
            <div className="cardBody">
              {state.agenda.filter(item => item.onBallot).length > 0 ? (
                <div>
                  {state.agenda
                    .filter(item => item.onBallot)
                    .map((item, index) => (
                      <div 
                        key={item.id}
                        style={{
                          padding: "var(--spacing-sm)",
                          marginBottom: "var(--spacing-xs)",
                          backgroundColor: "rgba(191, 153, 68, 0.1)",
                          border: "1px solid var(--color-accent)",
                          borderRadius: "var(--radius-md)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: "var(--font-weight-semibold)" }}>
                            {index + 1}. {item.title}
                          </div>
                          {item.description && (
                            <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.8, marginTop: "var(--spacing-xs)" }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                        {onToggleBallot && (
                          <button
                            className="btn btnSmall btnDanger"
                            onClick={() => onToggleBallot(item.id)}
                            title="Remove from ballot"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", opacity: 0.6, padding: "var(--spacing-md)" }}>
                  No proposals on ballot. Use the "Add to Ballot" option in proposal items' quick actions menu.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category Budget Management */}
        {state.agenda && state.agenda.some(item => item.category) && (
          <div className="card card-compact mb-lg">
            <div className="cardHeader">
              <h4 className="cardTitle">Category Timeboxing</h4>
            </div>
            <div className="cardBody">
              {(() => {
                // Calculate category totals and budgets
                const categories = {};
                state.agenda.forEach(item => {
                  if (item.category) {
                    if (!categories[item.category]) {
                      categories[item.category] = {
                        totalDuration: 0,
                        budget: state.categoryBudgets?.[item.category] || 0,
                        items: []
                      };
                    }
                    categories[item.category].totalDuration += item.durationSec || 0;
                    categories[item.category].items.push(item);
                  }
                });

                return Object.keys(categories).map(category => {
                  const { totalDuration, budget, items } = categories[category];
                  const overBudget = budget > 0 && totalDuration > budget;
                  const utilizationPercent = budget > 0 ? Math.round((totalDuration / budget) * 100) : 0;

                  return (
                    <div 
                      key={category}
                      style={{
                        padding: "var(--spacing-md)",
                        marginBottom: "var(--spacing-sm)",
                        backgroundColor: overBudget ? "rgba(255, 69, 58, 0.1)" : "rgba(255, 255, 255, 0.05)",
                        border: `1px solid ${overBudget ? "var(--color-danger)" : "var(--color-border-subtle)"}`,
                        borderRadius: "var(--radius-md)"
                      }}
                    >
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center",
                        marginBottom: "var(--spacing-sm)"
                      }}>
                        <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-base)" }}>
                          🏷️ {category}
                        </div>
                        <div style={{ fontSize: "var(--font-size-sm)" }}>
                          {items.length} item{items.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: "var(--font-size-sm)", marginBottom: "var(--spacing-xs)" }}>
                        <strong>Total Duration:</strong> {formatTime(totalDuration)}
                        {budget > 0 && (
                          <>
                            {" / "}
                            <strong>Budget:</strong> {formatTime(budget)}
                            {overBudget && (
                              <span style={{ color: "var(--color-danger)", marginLeft: "var(--spacing-xs)" }}>
                                ⚠️ {formatTime(totalDuration - budget)} over!
                              </span>
                            )}
                            {!overBudget && totalDuration < budget && (
                              <span style={{ color: "var(--color-success)", marginLeft: "var(--spacing-xs)" }}>
                                ✓ {formatTime(budget - totalDuration)} remaining
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {budget > 0 && (
                        <div style={{ 
                          height: "4px", 
                          backgroundColor: "rgba(255, 255, 255, 0.1)", 
                          borderRadius: "2px",
                          overflow: "hidden",
                          marginTop: "var(--spacing-xs)"
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(utilizationPercent, 100)}%`,
                            backgroundColor: overBudget ? "var(--color-danger)" : "var(--color-success)",
                            transition: "width 0.3s ease"
                          }} />
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <div style={{ marginTop: "var(--spacing-md)" }}>
                <label className="label">Set Category Budget (optional)</label>
                <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.7, marginBottom: "var(--spacing-sm)" }}>
                  Set time budgets for categories to track timebox compliance.
                </div>
              </div>
            </div>
          </div>
        )}

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
                {/* Auto-populate from proposal hint */}
                {state.currentAgendaItemId && (() => {
                  const currentItem = state.agenda.find(item => item.id === state.currentAgendaItemId);
                  return currentItem && currentItem.type === "proposal" && (currentItem.description || currentItem.title) && (
                    <div style={{
                      padding: "var(--spacing-sm)",
                      backgroundColor: "rgba(191, 153, 68, 0.1)",
                      border: "1px solid var(--color-accent)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "var(--spacing-md)",
                      fontSize: "var(--font-size-xs)"
                    }}>
                      💡 Tip: The current item is a proposal. 
                      <button
                        className="btn btnGhost btnSmall"
                        style={{ marginLeft: "var(--spacing-xs)" }}
                        onClick={() => {
                          setVoteQuestion(currentItem.description || currentItem.title);
                          setVoteOptions("Approve,Reject,Abstain");
                        }}
                      >
                        Use Proposal for Vote
                      </button>
                    </div>
                  );
                })()}
                
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
