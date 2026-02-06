# Agenda System Documentation

## Overview

The agenda system allows meeting participants to organize discussion topics with individual time allocations. Each agenda item has its own duration, and the timer automatically resets when switching between items.

## Agenda Item Model

Each agenda item contains:

```javascript
{
  id: string,           // Unique identifier (e.g., "a1738617234000_xyz12")
  title: string,        // Item title/topic
  durationSec: number,  // Duration in seconds for this item
  notes: string         // Optional notes/description (default: "")
}
```

## Backend State

### Session State Structure

```javascript
{
  agenda: [],           // Array of agenda items
  activeAgendaId: null, // ID of currently active item (or null)
  timer: {
    running: false,
    endsAtMs: null,
    durationSec: 0,     // Set from active agenda item
    pausedRemainingSec: null,
    updatedAtMs: Date.now()
  },
  // ... other session fields
}
```

## Key Behaviors

### 1. Setting Active Item

When the host sets an active agenda item (via Set Active, Next, or Prev), the timer **always resets**:

```javascript
function setActiveItem(session, agendaId) {
  session.activeAgendaId = agendaId;
  
  // ALWAYS reset timer (per requirements)
  const item = getActiveItem(session);
  if (item) {
    session.timer.running = false;
    session.timer.endsAtMs = null;
    session.timer.pausedRemainingSec = null;
    session.timer.durationSec = item.durationSec || 0;
    session.timer.updatedAtMs = Date.now();
  }
}
```

**Why reset?**
- Prevents confusion (timer from previous item continuing)
- Clear indication that discussion has moved to new topic
- Host explicitly starts timer for each item as needed

### 2. Navigation

#### Next Item
- Moves to next item in agenda array
- Wraps to first item if at end
- Resets timer to new item's duration

```javascript
function nextAgendaItem(session) {
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const nextIndex = (currentIndex + 1) % session.agenda.length;
  return setActiveItem(session, session.agenda[nextIndex].id);
}
```

#### Previous Item
- Moves to previous item in agenda array
- Wraps to last item if at beginning
- Resets timer to new item's duration

```javascript
function prevAgendaItem(session) {
  const currentIndex = session.agenda.findIndex((a) => a.id === session.activeAgendaId);
  const prevIndex = currentIndex <= 0 ? session.agenda.length - 1 : currentIndex - 1;
  return setActiveItem(session, session.agenda[prevIndex].id);
}
```

### 3. First Item Auto-Activation

When the first agenda item is added, it automatically becomes active:

```javascript
if (session.agenda.length === 1) {
  session.activeAgendaId = id;
  session.timer.durationSec = durationSec;
}
```

### 4. Active Item Deletion

When the active item is deleted:
- If agenda has other items: First remaining item becomes active
- If agenda is empty: No active item (activeAgendaId = null)
- Timer resets to 0 duration

## WebSocket Messages

### AGENDA_ADD
Adds a new agenda item.

**Client → Server:**
```json
{
  "type": "AGENDA_ADD",
  "title": "Introduction",
  "durationSec": 300,
  "notes": "Brief overview of meeting goals"
}
```

**Effect:**
- Creates new agenda item with unique ID
- If first item, makes it active and sets timer duration
- Broadcasts updated state to all clients

### AGENDA_UPDATE
Updates an existing agenda item.

**Client → Server:**
```json
{
  "type": "AGENDA_UPDATE",
  "agendaId": "a1738617234000_xyz12",
  "title": "Updated Introduction",
  "durationSec": 360,
  "notes": "Updated notes"
}
```

**Effect:**
- Updates specified fields (title, durationSec, notes)
- If updating active item's duration, timer duration updates
- Broadcasts updated state to all clients

### AGENDA_DELETE
Deletes an agenda item.

**Client → Server:**
```json
{
  "type": "AGENDA_DELETE",
  "agendaId": "a1738617234000_xyz12"
}
```

**Effect:**
- Removes item from agenda array
- If deleting active item: Sets first remaining item as active (or null)
- Resets timer if active item was deleted
- Broadcasts updated state to all clients

### AGENDA_SET_ACTIVE
Sets a specific item as active.

**Client → Server:**
```json
{
  "type": "AGENDA_SET_ACTIVE",
  "agendaId": "a1738617234000_xyz12"
}
```

**Effect:**
- Sets specified item as active
- **Always resets timer** to new item's duration
- Broadcasts updated state to all clients

### AGENDA_NEXT
Navigates to next agenda item.

**Client → Server:**
```json
{
  "type": "AGENDA_NEXT"
}
```

**Effect:**
- Moves to next item (wraps to beginning if at end)
- **Always resets timer** to new item's duration
- Broadcasts updated state to all clients

### AGENDA_PREV
Navigates to previous agenda item.

**Client → Server:**
```json
{
  "type": "AGENDA_PREV"
}
```

**Effect:**
- Moves to previous item (wraps to end if at beginning)
- **Always resets timer** to new item's duration
- Broadcasts updated state to all clients

## UI Components

### Agenda List (All Users)

**View Mode (Non-Host):**
- Read-only list of agenda items
- Shows title, duration, and notes
- Active item highlighted with yellow background
- No edit controls visible

**View Mode (Host):**
- Same as non-host, plus:
- "Set Active" button (for non-active items)
- "Edit" button
- "Delete" button

### Edit Mode (Host Only)

When editing an item:
- Inline form replaces item display
- Fields: Title (text), Duration (number), Notes (textarea)
- "Save" button (green)
- "Cancel" button (gray)
- Cannot edit while item is being edited

### Add Agenda Form (Host Only)

Located below agenda list:
- Title input (required)
- Duration input (seconds, defaults to 0)
- Notes textarea (optional)
- "Add" button

### Navigation Controls (Host Only)

Shown when 2+ agenda items exist:
- "◀ Previous Item" button
- "Next Item ▶" button
- Positioned above agenda list
- Circular navigation (wraps around)

## UI States

### Card Styling

**Normal Item:**
```css
background: #f8f9fa
border: 2px solid #dee2e6
```

**Active Item:**
```css
background: #fff3cd
border: 2px solid #ffc107
```

**Active Badge:**
```css
background: #ffc107
padding: 0.2rem 0.5rem
font-weight: bold
```

### Example Layout

```
┌─────────────────────────────────────────────────────┐
│ Agenda (3 items)                                    │
│                                                     │
│ [◀ Previous Item]  [Next Item ▶]   (host only)    │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Introduction (300s) [ACTIVE]                 │   │
│ │ Brief overview of meeting goals              │   │
│ │ [Edit] [Delete]                 (host only)  │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Budget Review (600s)                         │   │
│ │ Review Q4 budget allocations                 │   │
│ │ [Set Active] [Edit] [Delete]    (host only)  │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Q&A Session (900s)                           │   │
│ │ [Set Active] [Edit] [Delete]    (host only)  │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Add Agenda Item:                    (host only)    │
│ ┌─────────────────────────────────────────────┐   │
│ │ Title: [___________________________]         │   │
│ │ Duration: [_____] seconds                    │   │
│ │ Notes: [___________________________]         │   │
│ │        [___________________________]         │   │
│ │ [Add]                                        │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Usage Flows

### Flow 1: Host Creates Agenda

1. Host enters title "Introduction" and duration "300"
2. Host clicks "Add"
3. Item becomes active (first item)
4. Timer shows 5:00 (300 seconds)
5. Timer is stopped (not running yet)

### Flow 2: Host Navigates Between Items

**Current:** Item 1 active, timer at 2:30 (running)

1. Host clicks "Next Item ▶"
2. **Timer immediately resets** (stops if running)
3. Item 2 becomes active
4. Timer shows Item 2's duration (e.g., 10:00)
5. Timer is stopped (host must start it manually)

### Flow 3: Host Edits Active Item

**Current:** Item 1 active, duration 300s

1. Host clicks "Edit" on Item 1
2. Inline edit form appears
3. Host changes duration to 420
4. Host clicks "Save"
5. Item updates with new duration
6. Timer duration updates to 420s (7:00)
7. Timer state preserved (if was running, stays running)

### Flow 4: Attendee Joins Mid-Meeting

1. Attendee connects to room
2. Receives STATE message with full agenda
3. Sees all agenda items
4. Sees which item is active
5. Cannot see edit controls (non-host)
6. Can see timer and all agenda information

### Flow 5: Host Deletes Active Item

**Current:** Item 2 active (of 3 items)

1. Host clicks "Delete" on Item 2
2. Item 2 removed from agenda
3. Item 1 becomes new active item (first remaining)
4. Timer resets to Item 1's duration
5. Timer stops if it was running

## Permission Model

### Host Actions
✅ Add agenda items
✅ Edit agenda items (title, duration, notes)
✅ Delete agenda items
✅ Set active item
✅ Navigate next/prev
✅ Control timer (start/pause/resume/reset)

### Attendee Actions
✅ View agenda items
✅ View active item
✅ View timer
❌ Cannot add/edit/delete items
❌ Cannot change active item
❌ Cannot control timer

## Integration with Timer System

### Timer Duration Source

When agenda item becomes active:
```javascript
session.timer.durationSec = item.durationSec || 0;
```

This duration is used by:
- `timerStart()`: Sets `endsAtMs = now + durationSec * 1000`
- UI display: Shows duration when timer is stopped
- Timer reset: Returns to this duration

### Timer States with Agenda

**Stopped (Initial):**
- Timer shows active item's durationSec
- Example: "5:00" for 300-second item

**Running:**
- Timer counts down from durationSec
- Example: "4:37" → "4:36" → "4:35"

**Paused:**
- Timer shows pausedRemainingSec
- Example: "3:22" (frozen)

**Active Item Changed:**
- Timer **resets** regardless of state
- New durationSec loaded from new item
- Timer returns to stopped state

## Best Practices

### For Hosts

1. **Plan agenda before meeting**
   - Add all items with realistic durations
   - Include notes for context

2. **Use navigation buttons**
   - Faster than clicking "Set Active" on each item
   - Ensures proper order

3. **Don't edit active item's duration while timer running**
   - Pauses timer first
   - Edit duration
   - Resume with new duration

4. **Use notes field**
   - Add discussion points
   - Include references or links
   - Help attendees prepare

### For Attendees

1. **Review agenda at meeting start**
   - Know what topics are coming
   - Prepare questions/comments

2. **Watch active item indicator**
   - Shows current discussion topic
   - Helps stay focused

3. **Use timer as guide**
   - Gauge time remaining on topic
   - Helps pace contributions

## Technical Notes

### ID Generation

Agenda item IDs are generated as:
```javascript
const id = `a${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
```

Format: `a{timestamp}_{random}`
Example: `a1738617234000_xyz12`

### Array Order

Agenda items maintain insertion order:
- First added = index 0
- Last added = index n-1
- Next/Prev navigation follows this order

### Circular Navigation

Navigation wraps around:
```javascript
// Next: (current + 1) % length
// Prev: current <= 0 ? length - 1 : current - 1
```

Examples:
- Items: [A, B, C]
- At C, next → A (wraps)
- At A, prev → C (wraps)

### Timer Reset Behavior

**Critical:** Timer ALWAYS resets when active item changes.

This is **by design** (per requirements):
- Prevents timer from previous item continuing
- Forces conscious decision to start each item
- Clear boundaries between agenda items

```javascript
// Before change: Item 1 active, timer at 2:30 running
setActiveItem(session, item2.id);
// After change: Item 2 active, timer at 5:00 stopped
```

## Testing Scenarios

### Test 1: Basic Agenda Operations
1. Add 3 agenda items with different durations
2. Verify first item becomes active
3. Verify timer shows first item's duration
4. Verify all items displayed with correct info

### Test 2: Navigation
1. Create 3 agenda items
2. Click "Next Item" twice
3. Verify active item changed each time
4. Verify timer reset each time
5. Click "Next Item" again (should wrap to first)
6. Click "Previous Item" (should go to last)

### Test 3: Timer Reset on Change
1. Set Item 1 active
2. Start timer
3. Let run for 30 seconds
4. Click "Next Item"
5. Verify timer stopped and reset to Item 2's duration

### Test 4: Edit Active Item
1. Set Item 1 active (300s)
2. Start timer
3. Edit Item 1, change duration to 420s
4. Verify timer duration updated
5. Verify timer state preserved

### Test 5: Delete Active Item
1. Create 3 items
2. Set Item 2 active
3. Delete Item 2
4. Verify Item 1 becomes active
5. Verify timer reset

### Test 6: Host vs Attendee View
1. Host creates agenda with 3 items
2. Attendee joins
3. Verify attendee sees all items
4. Verify attendee doesn't see edit controls
5. Verify attendee sees active item indicator

## Troubleshooting

### Timer doesn't reset when changing items
- Check setActiveItem() implementation
- Verify timer fields are cleared: running=false, endsAtMs=null
- Check browser console for errors

### Navigation doesn't wrap around
- Verify modulo arithmetic: `(index + 1) % length`
- Check for off-by-one errors
- Test with 1, 2, and 3+ items

### Edit changes not persisted
- Verify AGENDA_UPDATE message sent
- Check server logs for message handling
- Ensure agendaId matches existing item

### Active item not highlighted
- Check CSS styling conditions
- Verify `state.activeAgendaId === item.id`
- Inspect element styles in DevTools

### First item not auto-activated
- Check AGENDA_ADD handler
- Verify `if (session.agenda.length === 1)` condition
- Ensure timer.durationSec set correctly

## Features

### Agenda Templates ✨ (Implemented)

The agenda builder includes 5 built-in templates for quick meeting setup:

1. **Quick Standup** - Fast 20-minute daily sync
   - What did you do yesterday? (5m)
   - What are you doing today? (10m)
   - Any blockers? (5m)

2. **Weekly Team Sync** - Standard 30-minute weekly meeting
   - Opening & Announcements (5m)
   - Status Updates (15m)
   - Discussion Topics (10m)
   - Action Items & Next Steps (5m)

3. **Project Kickoff** - Launch a new project with clarity
   - Project Overview (10m)
   - Team Introductions (5m)
   - Timeline & Milestones (10m)
   - Discussion & Questions (10m)
   - Next Steps (5m)

4. **Sprint Retrospective** - Reflect and improve as a team
   - Set the Stage (5m)
   - What went well? (10m)
   - What could be improved? (10m)
   - Action Items (10m)
   - Closing (3m)

5. **1-on-1 Meeting** - Manager and direct report sync
   - Personal Check-in (5m)
   - Progress & Wins (10m)
   - Challenges & Support (10m)
   - Growth & Development (5m)
   - Action Items (5m)

**How to use:**
- Click "Browse Templates" on the meeting setup screen
- Select a template to load it instantly
- Customize by adding/removing items or switching templates
- Templates include pre-configured durations and notes

## Future Enhancements

Possible improvements:

1. **Drag-and-drop reordering**
   - Allow host to reorder agenda items
   - Update next/prev navigation accordingly

2. **Custom template creation** (Extension of templates feature)
   - Save custom agenda structures to localStorage
   - Export/import templates
   - Share templates via URL

3. **Agenda export**
   - Export to PDF/text for distribution
   - Include meeting minutes

4. **Sub-items**
   - Nested agenda structure
   - Discussion points under main topics

5. **Time tracking**
   - Record actual time spent on each item
   - Compare to allocated duration
   - Generate reports

6. **Auto-advance**
   - Option to auto-move to next item when timer expires
   - Configurable (on/off per meeting)

## Summary

The agenda system provides structured meeting management with:

✅ Per-item durations
✅ Active item tracking
✅ Automatic timer reset on item change
✅ **Agenda templates** - 5 built-in templates for quick setup
✅ Edit items inline
✅ Next/Previous navigation
✅ Add/delete items dynamically
✅ Host editing capabilities
✅ Next/Prev navigation
✅ Notes support
✅ Host/attendee permission model

The system ensures clear boundaries between discussion topics and gives hosts full control over meeting flow while keeping attendees informed.
