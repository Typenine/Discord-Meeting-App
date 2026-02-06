# Testing Move to Top / Move to Bottom Actions

## How to Test

1. **Start a meeting** in Standalone mode (not Discord Activity mode)
2. **Add at least 3 agenda items** so you can see reordering clearly
3. **Open the quick actions menu** (click the ⋯ button on any agenda item)
4. **Click "⬆️ Move to Top"** or "⬇️ Move to Bottom"

## What Should Happen

When you click "Move to Top":
- The selected agenda item should immediately move to the first position
- All other items should shift down
- The change should persist (survives page refresh)

When you click "Move to Bottom":
- The selected agenda item should immediately move to the last position
- All other items should shift up
- The change should persist (survives page refresh)

## Debug Logging Added

To diagnose issues, extensive console logging has been added. Open your browser's Developer Tools (F12) and look for:

### In Browser Console:
```
[HostPanel] handleMoveToTop called with item: {id: '...', title: '...', ...}
[HostPanel] current agenda: [{...}, {...}, {...}]
[HostPanel] new orderedIds: ['...', '...', '...']
[HostPanel] calling onReorderAgenda with: ['...', '...', '...']
[StandaloneApp] reorderAgenda called with: ['...', '...', '...']
```

### In Worker Console (if running locally):
```
[worker] reorderAgendaItems called
[worker] orderedIds: ['...', '...', '...']
[worker] session.agenda length: 3
[worker] session.agenda IDs: ['...', '...', '...']
[worker] Reorder successful! New order: ['...', '...', '...']
```

## Common Issues

### Issue: Nothing happens when I click
**Possible causes:**
1. Not connected to WebSocket (check connection status)
2. Not logged in as host
3. JavaScript error (check console for red errors)

### Issue: Console shows "onReorderAgenda is not defined"
**Cause:** The HostPanel component didn't receive the `onReorderAgenda` prop
**Fix:** Check that you're in connected mode with an active meeting

### Issue: Reorder message sent but UI doesn't update
**Possible causes:**
1. Worker/backend not running
2. WebSocket connection lost
3. Validation failed on backend (check worker logs)

### Issue: Items are being moved but to wrong positions
**Cause:** Bug in reorder logic
**Debug:** Check the console logs to see what orderedIds are being sent

## Code Flow

```
User clicks button
  ↓
handleMoveToTop(item) or handleMoveToBottom(item) in HostPanel
  ↓
Calculate new order: [item, ...others] or [...others, item]
  ↓
Extract IDs: newOrder.map(a => a.id)
  ↓
onReorderAgenda(orderedIds)
  ↓
reorderAgenda(orderedIds) in StandaloneApp
  ↓
sendMessage({ type: "AGENDA_REORDER", orderedIds })
  ↓
WebSocket sends to worker
  ↓
Worker receives AGENDA_REORDER message
  ↓
reorderAgendaItems(session, orderedIds)
  ↓
Validates orderedIds (must match current IDs)
  ↓
Reorders session.agenda array
  ↓
broadcastState() sends updated state to all clients
  ↓
Client receives state update
  ↓
UI re-renders with new order
```

## Expected Console Output (Success Case)

### When moving "Budget Review" to top:

**Browser Console:**
```
[HostPanel] handleMoveToTop called with item: {id: 'item-2', title: 'Budget Review', durationSec: 600, notes: ''}
[HostPanel] current agenda: [
  {id: 'item-1', title: 'Opening Remarks', durationSec: 300, notes: ''},
  {id: 'item-2', title: 'Budget Review', durationSec: 600, notes: ''},
  {id: 'item-3', title: 'Closing', durationSec: 180, notes: ''}
]
[HostPanel] new orderedIds: ['item-2', 'item-1', 'item-3']
[HostPanel] calling onReorderAgenda with: ['item-2', 'item-1', 'item-3']
[StandaloneApp] reorderAgenda called with: ['item-2', 'item-1', 'item-3']
```

**Worker Console:**
```
[worker] reorderAgendaItems called
[worker] orderedIds: ['item-2', 'item-1', 'item-3']
[worker] session.agenda length: 3
[worker] session.agenda IDs: ['item-1', 'item-2', 'item-3']
[worker] Reorder successful! New order: ['item-2', 'item-1', 'item-3']
```

**Result:** "Budget Review" now appears first in the list

## If It Still Doesn't Work

If you see all the console logs but the UI still doesn't update, the issue might be:

1. **State not being broadcast**: Check worker logs for "Broadcasting state"
2. **Client not receiving update**: Check for WebSocket message received logs
3. **React not re-rendering**: The state object might not be properly updating

Please share the console output when you test so we can diagnose the exact issue!
