# Agenda Controls Testing Guide

## Features Implemented

### A) Inline Editing
**How to test:**
1. Start a meeting session as host
2. Click on any agenda item in the Host Panel
3. The item should enter inline edit mode with:
   - Title input field (auto-focused and selected)
   - Duration inputs (minutes : seconds)
   - Notes textarea
4. **Test Save Methods:**
   - Edit the title and click outside (blur) → Should save
   - Edit duration and press Enter → Should save
   - Edit notes and press Escape → Should cancel
5. Verify changes sync to all connected clients via WebSocket

**Expected behavior:**
- Click item → enters edit mode
- Save on blur (clicking outside)
- Save on Enter key
- Cancel on Escape key
- Changes broadcast via WebSocket immediately

### B) Drag-and-Drop Reorder
**How to test:**
1. Ensure you have at least 3 agenda items
2. Look for the drag handle (⋮⋮) on the left side of each item
3. Click and hold the drag handle
4. Drag the item up or down
5. Release to drop in new position
6. Verify the order changes persist and sync to all clients

**Expected behavior:**
- Drag handle cursor changes to "grab" on hover
- Cursor changes to "grabbing" when dragging
- Visual feedback during drag (item becomes semi-transparent)
- Order updates immediately on drop
- WebSocket broadcasts new order to all clients

**Backend endpoints tested:**
- `PUT /session/:id/agenda/reorder` (REST API)
- WebSocket message: `AGENDA_REORDER` with `orderedIds` array

### C) Quick Actions Menu
**How to test:**
1. Click the "⋯" (three dots) button on any agenda item
2. Menu should appear with 6 actions:
   - **⭐ Set Active** (only shown if not already active)
   - **📋 Duplicate** → Creates copy with "(Copy)" suffix
   - **➕ Insert After** → Adds blank "New Item" after current
   - **⬆️ Move to Top** → Reorders item to position 0
   - **⬇️ Move to Bottom** → Reorders item to last position
   - **🗑️ Delete** → First click shows "⚠️ Confirm Delete?", second click deletes

**Expected behavior:**
- Menu closes when clicking outside
- Menu closes after selecting any action
- Delete requires two clicks (confirmation)
- All actions trigger WebSocket updates

### D) Templates System
**How to test:**

#### Save Current Agenda as Template:
1. Create a custom agenda with several items
2. In Host Panel, expand "Templates" section (click + button)
3. Enter a template name in "Save Current Agenda" field
4. Click "💾 Save" button
5. Template should appear in "My Templates" section

#### Load Preset Templates:
1. Expand Templates section
2. See 3 preset templates:
   - **Annual League Meeting** (7 items)
   - **Draft Lottery** (6 items)
   - **Trade Summit** (6 items)
3. Click "Load" on any preset
4. Agenda items should be added to current meeting

#### Manage Saved Templates:
1. View "My Templates" section
2. Each template has "Load" and "×" (delete) buttons
3. Click "Load" to add template items
4. Click "×" to delete from localStorage

#### Export/Import:
1. Click "📤 Export Templates" → Downloads `agenda-templates.json`
2. Click "📥 Import Templates" → Opens file picker
3. Select exported JSON file → Merges with existing templates

**Expected behavior:**
- Templates saved to `localStorage` key "agendaTemplates"
- Preset templates always available (not in localStorage)
- Export creates valid JSON file
- Import validates JSON and merges (doesn't replace)

## Integration Points

### Frontend (client/src/components/HostPanel.jsx):
- Uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop
- Manages inline edit state locally
- Calls `onReorderAgenda(orderedIds)` after drag end
- Stores templates in `localStorage.agendaTemplates`

### WebSocket (client/src/StandaloneApp.jsx):
- New message type: `{ type: "AGENDA_REORDER", orderedIds: [...] }`
- New callback: `reorderAgenda(orderedIds)`
- Broadcasts to all connected clients

### Backend API (server/src/app.js):
- New endpoint: `PUT /session/:id/agenda/reorder`
- Request body: `{ userId, orderedIds }`
- Returns updated session state

### Backend Store (server/src/store.js):
- New export: `reorderAgenda({ sessionId, userId, orderedIds })`
- Validates host access
- Validates all IDs exist
- Reorders agenda array
- Bumps revision and saves

### Worker (worker/src/index.mjs):
- New WebSocket handler: `case "AGENDA_REORDER"`
- New function: `reorderAgendaItems(session, orderedIds)`
- Validates IDs and reorders in-memory

## CSS Styles Added (client/src/styles/hostPanel.css)

### Drag and Drop:
- `.dragHandle` - Grab cursor, 24x24px button
- `.agendaItemRow` - Flex container for handle + content + menu
- `.agendaItemWrapper.dragging` - Z-index and opacity during drag

### Inline Editing:
- `.agendaItemInlineEdit` - Golden glow border, distinct from normal items
- `.inlineEditTitle` - Full-width title input
- `.inlineEditDuration` - Flex row with min:sec inputs
- `.inlineEditNotes` - Resizable textarea

### Quick Actions:
- `.menuTrigger` - Three dots button (⋯)
- `.quickActionsMenu` - Absolute positioned dropdown
- `.menuItem` - Hover effect on each action
- `.menuItemDanger` - Red color for delete action

### Templates:
- `.templateItem` - Flex row with name + buttons
- `.templateSection` - Border-bottom sections
- `.templateActions` - Export/import buttons

## Manual Testing Checklist

- [ ] Inline edit: Click agenda item, edit title
- [ ] Inline edit: Press Enter to save
- [ ] Inline edit: Press Escape to cancel
- [ ] Inline edit: Click outside to save
- [ ] Inline edit: Edit duration (min/sec)
- [ ] Inline edit: Edit notes field
- [ ] Drag: Grab handle and reorder items
- [ ] Drag: Verify order persists after refresh
- [ ] Quick actions: Open menu (⋯)
- [ ] Quick actions: Set active (if applicable)
- [ ] Quick actions: Duplicate item
- [ ] Quick actions: Insert after
- [ ] Quick actions: Move to top
- [ ] Quick actions: Move to bottom
- [ ] Quick actions: Delete with confirmation (2 clicks)
- [ ] Templates: Save current agenda
- [ ] Templates: Load preset template (Annual League Meeting)
- [ ] Templates: Load preset template (Draft Lottery)
- [ ] Templates: Load preset template (Trade Summit)
- [ ] Templates: Delete saved template
- [ ] Templates: Export to JSON
- [ ] Templates: Import from JSON
- [ ] WebSocket: Verify changes sync to other clients
- [ ] Mobile: Test on narrow viewport (<768px)

## Known Limitations

1. **Template Loading**: Currently adds items to existing agenda rather than replacing. This is by design for flexibility.
2. **Delete Confirmation**: Only shows for quick actions menu. Direct delete button (if any) doesn't have confirmation.
3. **Mobile Drag**: May require adjustments to activation constraints on touch devices.
4. **Template Presets**: Hard-coded in HostPanel.jsx. Could be moved to external config.

## Performance Notes

- Drag-and-drop uses `@dnd-kit` with `closestCenter` collision detection
- Inline editing updates state locally before WebSocket sync
- Templates stored in localStorage have no size limit check
- Menu closes on outside click via document-level event listener

## Security Considerations

- All agenda operations require host validation on backend
- orderedIds array validated to prevent injection of invalid IDs
- Templates stored client-side only (localStorage)
- No XSS risk as all user input is properly escaped by React

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires -webkit-backdrop-filter)
- Mobile browsers: Drag may need testing on iOS Safari
