# Test Plan for Standalone Synced Meeting App

## Pre-Deployment Checklist

### ✅ Code Changes
- [x] Worker: Room creation endpoint (`/api/room/create`)
- [x] Worker: WebSocket handler with TIME_PING/PONG
- [x] Worker: HostKey validation for all host actions
- [x] Worker: Timer broadcasts every second
- [x] Worker: Agenda CRUD operations
- [x] Worker: Vote open/close/cast operations
- [x] Frontend: StandaloneApp component with WebSocket
- [x] Frontend: Room creation UI
- [x] Frontend: Viewer/Host link display
- [x] Frontend: Local timer tick (1s interval)
- [x] Frontend: TIME_PING/PONG implementation
- [x] Frontend: Mode detection (Discord vs Standalone)
- [x] Build: Client builds successfully
- [x] Build: Worker syntax validated

### 📝 Documentation
- [x] STANDALONE_MODE.md created
- [x] Deployment instructions
- [x] Architecture diagrams
- [x] Security documentation
- [x] Environment variable examples

## Manual Testing Scenarios

### Test 1: Room Creation (Host)

**Steps:**
1. Open app in browser (not Discord)
2. Enter name: "Host User"
3. Click "Create New Meeting Room"
4. Note the room ID and both URLs

**Expected:**
- Room ID is 6 characters (e.g., ABC123)
- Alert shows viewer URL and host URL
- Host URL contains hostKey parameter
- WebSocket connects successfully
- Status shows "HOST"

### Test 2: Join as Viewer

**Steps:**
1. Open viewer URL in new browser/tab
2. Enter name: "Viewer User"
3. Wait for connection

**Expected:**
- WebSocket connects successfully
- Status shows "ATTENDEE"
- Can see room ID
- Cannot see host controls (no Add Agenda button)
- Cannot see timer controls

### Test 3: Host Adds Agenda Item

**Steps:**
1. As host, enter agenda title: "Opening Remarks"
2. Enter duration: 300 (5 minutes = 300 seconds)
3. Click "Add"

**Expected:**
- Agenda item appears immediately for host
- Agenda item appears within 1 second for viewer
- Item shows "(300s)"
- Item is marked as ACTIVE (first item)

### Test 4: Timer Synchronization

**Steps:**
1. As host, click "Start" timer
2. Watch timer on both host and viewer screens
3. Wait 10 seconds
4. Compare timer values

**Expected:**
- Timer starts on both screens immediately
- Both timers show same value (±1 second)
- Timer updates every second
- Format shows MM:SS (e.g., 4:50, 4:49, 4:48)
- Running indicator shows on both screens

### Test 5: Timer Controls (Host Only)

**Steps:**
1. As host, click "Pause"
2. Verify timer stops on both screens
3. As host, click "+60s"
4. Verify time increases on both screens
5. As host, click "Start" again

**Expected:**
- Pause stops timer for all participants
- Extend adds time correctly
- Start resumes timer
- Viewer cannot see these buttons
- All changes sync within 1 second

### Test 6: Open Vote (Host)

**Steps:**
1. As host, enter question: "Should we extend the meeting?"
2. Leave options as: Yes,No,Abstain
3. Click "Open Vote"

**Expected:**
- Vote appears on both screens immediately
- Question displays correctly
- Three options visible
- Viewer sees "Vote" buttons
- Host does NOT see "Vote" buttons (only "Close Vote")
- Vote count shows 0

### Test 7: Cast Vote (Viewer)

**Steps:**
1. As viewer, click "Vote" on "Yes"
2. Check vote count
3. Try to vote again

**Expected:**
- Vote is cast successfully
- Vote count increases to 1
- "Vote" button becomes disabled
- Host sees vote count increase

### Test 8: Close Vote (Host)

**Steps:**
1. As host, click "Close Vote"
2. View results

**Expected:**
- Vote closes on both screens
- Results show with counts and percentages
- Vote moves to "Past Votes" section
- Host can open new vote

### Test 9: Multiple Agenda Items

**Steps:**
1. As host, add 3 agenda items with different durations
2. Click "Set Active" on second item
3. Start timer
4. Switch to third item while timer is running

**Expected:**
- All items appear in list
- Active item changes immediately on both screens
- ACTIVE badge moves to correct item
- Timer resets when switching items (if not running)
- If timer is running, it continues

### Test 10: TIME_PING/PONG Calibration

**Steps:**
1. Open browser DevTools > Network > WS
2. Watch WebSocket messages
3. Look for TIME_PING and TIME_PONG

**Expected:**
- TIME_PING sent every 10 seconds
- TIME_PONG received with serverNow
- Client calculates and applies offset
- Timer stays synchronized

### Test 11: Reconnection Handling

**Steps:**
1. Connect as viewer
2. Stop worker (or close WebSocket)
3. Restart worker
4. Wait 3 seconds

**Expected:**
- Client detects disconnection
- Shows "Connection error. Retrying..."
- Automatically reconnects after 3 seconds
- Session state restored
- Timer continues from correct value

### Test 12: Discord Activity Mode (Preserve)

**Steps:**
1. Deploy to discordsays.com domain
2. Open in Discord Activity
3. Verify HTTP polling still works

**Expected:**
- App detects Discord mode
- Uses old App component (not StandaloneApp)
- HTTP polling works
- All features from before still work
- No breaking changes

## Security Testing

### Test S1: HostKey Protection

**Steps:**
1. Connect as viewer (no hostKey)
2. Try to send AGENDA_ADD via browser console
3. Try to send TIMER_START via browser console

**Expected:**
- Server rejects with "not_host" error
- No changes appear on any screen
- Error logged in browser console

### Test S2: HostKey Privacy

**Steps:**
1. Connect as viewer
2. Open DevTools > Network > WS
3. View STATE messages

**Expected:**
- hostKey is NOT in state object
- Only host sees their own hostKey in localStorage
- Viewers cannot discover hostKey from network traffic

### Test S3: Multiple Hosts

**Steps:**
1. Open host URL in first tab
2. Open same host URL in second tab
3. Try host actions in both

**Expected:**
- Both tabs have host access
- Both can control the meeting
- Actions from either tab sync to all participants

## Performance Testing

### Test P1: Large Agenda (50 items)

**Steps:**
1. Add 50 agenda items via script
2. Measure WebSocket message size
3. Check UI responsiveness

**Expected:**
- Messages stay under 100KB
- UI renders smoothly
- Timer still updates every second

### Test P2: Many Participants (10 concurrent)

**Steps:**
1. Open 10 browser tabs/windows
2. Connect all to same room
3. Start timer and open vote

**Expected:**
- All clients receive updates within 2 seconds
- Server handles load without errors
- Timer stays synchronized across all clients

## Cross-Browser Testing

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Error Scenarios

### Test E1: Invalid Room ID

**Steps:**
1. Enter room ID: "INVALID"
2. Try to join

**Expected:**
- Connection fails gracefully
- Error message displayed
- Can retry with correct ID

### Test E2: Lost HostKey

**Steps:**
1. Join as host
2. Refresh page without hostKey in URL
3. Try host actions

**Expected:**
- Reconnects as viewer
- Cannot perform host actions
- Must use host link to regain control

## Deployment Verification

### After Deploying to Production

- [ ] `/api/room/create` returns valid room data
- [ ] WebSocket connects via wss://
- [ ] Timer synchronizes across devices
- [ ] Voting works end-to-end
- [ ] Host controls properly gated
- [ ] Discord Activity mode unaffected
- [ ] No console errors
- [ ] All links work (viewer and host)

## Rollback Plan

If critical issues found:
1. Revert PR to previous commit
2. Redeploy Cloudflare Worker to previous version
3. Redeploy Vercel to previous version
4. Notify users of temporary downtime

## Success Criteria

✅ All manual tests pass
✅ All security tests pass
✅ No regressions in Discord Activity mode
✅ Documentation complete and accurate
✅ Environment variables properly configured
✅ Build succeeds without errors
✅ No high-severity vulnerabilities in npm audit
