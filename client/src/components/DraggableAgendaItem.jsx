// Draggable agenda item with quick action menu
import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatTime } from "../utils/timeFormat.js";
import AgendaItemInlineEditor from "./AgendaItemInlineEditor.jsx";

export default function DraggableAgendaItem({
  item,
  isActive,
  isInEditMode,
  onStartEditing,
  onSaveEdits,
  onCancelEditing,
  onMarkAsActive,
  onDuplicate,
  onInsertAfter,
  onMoveToTop,
  onMoveToBottom,
  onRemove
}) {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });
  
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };
  
  const confirmDelete = () => {
    onRemove(item.id);
    setShowDeleteConfirm(false);
  };
  
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };
  
  if (isInEditMode) {
    return (
      <div ref={setNodeRef} style={dragStyle} className="agendaItemWrapper">
        <div className="agendaItemEditMode">
          <AgendaItemInlineEditor
            item={item}
            onSaveChanges={onSaveEdits}
            onCancelEdit={onCancelEditing}
            isExpanded={false}
          />
        </div>
      </div>
    );
  }
  
  return (
    <div ref={setNodeRef} style={dragStyle} className="agendaItemWrapper">
      <div className={`agendaItemCard ${isActive ? "agendaItemActive" : ""}`}>
        <div className="agendaItemMain">
          <button
            className="dragHandle"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </button>
          
          <div className="agendaItemContent" onClick={onStartEditing}>
            <div className="agendaItemHeader">
              <span className="agendaItemTitle">{item.title}</span>
              <span className="pill pill-neutral">{formatTime(item.durationSec)}</span>
            </div>
            {item.notes && (
              <div className="agendaItemNotes">{item.notes}</div>
            )}
          </div>
          
          <button
            className="btn btnGhost btnSmall agendaItemMenuBtn"
            onClick={() => setShowActionsMenu(!showActionsMenu)}
            aria-label="More actions"
          >
            ⋯
          </button>
        </div>
        
        {showActionsMenu && (
          <div className="agendaQuickActions">
            {!isActive && (
              <button
                className="quickActionBtn"
                onClick={() => {
                  onMarkAsActive(item.id);
                  setShowActionsMenu(false);
                }}
              >
                ▶ Set Active
              </button>
            )}
            <button
              className="quickActionBtn"
              onClick={() => {
                onDuplicate(item.id);
                setShowActionsMenu(false);
              }}
            >
              📋 Duplicate
            </button>
            <button
              className="quickActionBtn"
              onClick={() => {
                onInsertAfter(item.id);
                setShowActionsMenu(false);
              }}
            >
              ➕ Insert After
            </button>
            <button
              className="quickActionBtn"
              onClick={() => {
                onMoveToTop(item.id);
                setShowActionsMenu(false);
              }}
            >
              ⬆ Move to Top
            </button>
            <button
              className="quickActionBtn"
              onClick={() => {
                onMoveToBottom(item.id);
                setShowActionsMenu(false);
              }}
            >
              ⬇ Move to Bottom
            </button>
            <button
              className="quickActionBtn quickActionDanger"
              onClick={handleDeleteClick}
            >
              🗑 Delete
            </button>
          </div>
        )}
        
        {showDeleteConfirm && (
          <div className="agendaDeleteConfirm">
            <p>Delete "{item.title}"?</p>
            <div className="deleteConfirmActions">
              <button className="btn btnDanger btnSmall" onClick={confirmDelete}>
                Yes, Delete
              </button>
              <button className="btn btnSecondary btnSmall" onClick={cancelDelete}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
