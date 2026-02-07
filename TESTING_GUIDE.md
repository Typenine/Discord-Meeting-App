# Manual Testing Guide

## Testing Checklist for PR: Viewer Invite UX + Debug Gating + Host Label + Elapsed Timer + Save Templates

### Test 1: Viewer Invite Mode

#### Test 1.1: Viewer Invite with Room ID
**Steps:**
1. Navigate to `http://localhost:5173/?room=TEST123&mode=viewer`
2. Observe the landing page

**Expected Results:**
- ✅ Only one card is visible: "Join Meeting"
- ✅ "Create New Meeting" card is completely hidden
- ✅ Room ID field shows "TEST123" and is disabled (grayed out)
- ✅ Host Key field is not present
- ✅ Only "Your Name" input and "Join Room" button are visible

#### Test 1.2: Viewer Mode without Room
**Steps:**
1. Navigate to `http://localhost:5173/?mode=viewer`
2. Observe the landing page

**Expected Results:**
- ✅ Both cards visible: "Create New Meeting" and "Join Existing Meeting"
- ✅ Normal landing UI (viewer mode only applies when room is present)

---

### Test 2: Debug Panel Gating

#### Test 2.1: Default State (No Debug)
**Steps:**
1. Join or create a meeting
2. Click the "Share" button in the top bar
3. Observe the ShareModal

**Expected Results:**
- ✅ Viewer link section is visible
- ✅ Host link section is visible (if you're the host)
- ✅ No "DEBUG INFO (Vercel 404 Investigation)" section visible

#### Test 2.2: Debug Mode Enabled
**Steps:**
1. Add `?debug=1` to the URL (e.g., `http://localhost:5173/?debug=1`)
2. Join or create a meeting
3. Click the "Share" button
4. Observe the ShareModal

**Expected Results:**
- ✅ "DEBUG INFO (Vercel 404 Investigation)" section is now visible
- ✅ Shows window.location details, base URL, generated URLs

#### Test 2.3: Environment Variable
**Steps:**
1. Set `VITE_SHOW_DEBUG_PANEL=true` in `.env` file
2. Restart dev server
3. Open ShareModal (without `?debug=1`)

**Expected Results:**
- ✅ Debug panel is visible due to environment variable

---

### Test 3: Host Label De-emphasis

#### Test 3.1: As Host
**Steps:**
1. Create a new meeting (you become the host)
2. Observe the area below the TopBar

**Expected Results:**
- ✅ Small, compact badge showing "Host: [Your Name] (You)"
- ✅ Badge has subtle background, not prominent
- ✅ "Release" button is small and secondary
- ✅ No large banner with "Current Host:" label

#### Test 3.2: As Non-Host with Host Key
**Steps:**
1. Join a meeting as non-host but with valid host key
2. Observe the host badge

**Expected Results:**
- ✅ Badge shows current host name
- ✅ "Claim Host" button is available and small

#### Test 3.3: No Host Present
**Steps:**
1. Join a meeting where host has left
2. Observe the badge

**Expected Results:**
- ✅ Badge should still show host information or indicate no host
- ✅ UI remains compact and subtle

---

### Test 4: Smooth Elapsed Timer Updates

#### Test 4.1: Timer Increments Every Second
**Steps:**
1. Create a meeting with an agenda
2. Start the meeting
3. Start the first agenda item timer
4. Watch the "⏱ X:XX elapsed" badge in the TopBar

**Expected Results:**
- ✅ Timer shows "⏱ 0:01 elapsed" after 1 second
- ✅ Timer shows "⏱ 0:02 elapsed" after 2 seconds
- ✅ Timer shows "⏱ 0:03 elapsed" after 3 seconds
- ✅ No large jumps (e.g., 0:01 → 0:26)
- ✅ Updates are smooth and consistent

#### Test 4.2: Timer Persists After Refresh
**Steps:**
1. Let timer run for 30+ seconds
2. Note the elapsed time (e.g., "0:35 elapsed")
3. Refresh the browser (F5)
4. Rejoin the meeting

**Expected Results:**
- ✅ Timer shows approximately the same time (±1-2 seconds for network latency)
- ✅ Timer continues incrementing from where it left off
- ✅ No reset to 0:00

#### Test 4.3: Timer in Popout View
**Steps:**
1. Start meeting and timer
2. Click "Popout" button to open mini view
3. Watch elapsed timer in both windows

**Expected Results:**
- ✅ Both windows show same elapsed time
- ✅ Both timers update every second
- ✅ Times stay synchronized (within 1 second)

---

### Test 5: Elapsed Timer Start Synchronization

#### Test 5.1: Timer Doesn't Start Until Agenda Timer Starts
**Steps:**
1. Create a meeting with agenda items
2. Start the meeting (but don't start the agenda timer yet)
3. Wait 10 seconds
4. Observe the TopBar

**Expected Results:**
- ✅ No elapsed timer badge visible
- ✅ Meeting elapsed time is 0:00 (not running)

#### Test 5.2: Timer Starts with First Agenda Item
**Steps:**
1. From the state above, click "Start" on the first agenda item
2. Watch the TopBar

**Expected Results:**
- ✅ Elapsed timer badge appears: "⏱ 0:01 elapsed"
- ✅ Timer starts counting immediately
- ✅ Timer increments every second

#### Test 5.3: Timer Doesn't Reset with Agenda Timer
**Steps:**
1. Let meeting run for 60 seconds (elapsed: ~1:00)
2. Reset the agenda item timer
3. Observe elapsed timer

**Expected Results:**
- ✅ Elapsed timer continues running
- ✅ Elapsed timer does NOT reset to 0:00
- ✅ Elapsed timer shows total meeting duration (e.g., 1:05, 1:06...)

---

### Test 6: Save Agenda Templates

#### Test 6.1: Save Template from Setup
**Steps:**
1. Click "Create New Meeting Room"
2. Enter your name and proceed to setup
3. Add 3-4 agenda items with different durations
4. Click "Save as Template" button (next to "Templates" and "Clear All")
5. Enter template name "My Test Template" in the modal
6. Click "Save Template"

**Expected Results:**
- ✅ Modal closes
- ✅ Success message appears
- ✅ No errors in console

#### Test 6.2: Verify Template Persists
**Steps:**
1. From setup screen, click "Templates" button
2. Scroll through the template list

**Expected Results:**
- ✅ "My Test Template" appears in the list
- ✅ Shows as "Custom template"
- ✅ Shows correct number of items

#### Test 6.3: Load Saved Template
**Steps:**
1. Clear current agenda (if any)
2. Click "Templates"
3. Click on "My Test Template"

**Expected Results:**
- ✅ All agenda items from template are loaded
- ✅ Titles match saved template
- ✅ Durations match saved template
- ✅ Notes are preserved (if any)

#### Test 6.4: Template Persists After Refresh
**Steps:**
1. Refresh the browser (F5)
2. Click "Create New Meeting Room" again
3. Enter name and go to setup
4. Click "Templates" button

**Expected Results:**
- ✅ "My Test Template" still appears in list
- ✅ Template can still be loaded
- ✅ All data is intact

#### Test 6.5: Multiple Templates
**Steps:**
1. Create another agenda (different items)
2. Save as "Second Template"
3. Check templates list

**Expected Results:**
- ✅ Both "My Test Template" and "Second Template" appear
- ✅ Both can be loaded independently
- ✅ Loading one doesn't affect the other

---

## Acceptance Criteria Verification

| Criterion | Status | Notes |
|-----------|--------|-------|
| Viewer link `/?room=XXX&mode=viewer` hides create meeting | ✅ | Test 1.1 |
| Debug panel hidden by default | ✅ | Test 2.1 |
| Debug panel visible with `?debug=1` | ✅ | Test 2.2 |
| Host label is de-emphasized | ✅ | Test 3.1-3.3 |
| Elapsed timer increments every second | ✅ | Test 4.1 |
| Elapsed timer persists after refresh | ✅ | Test 4.2 |
| Elapsed timer starts with first agenda timer | ✅ | Test 5.1-5.2 |
| Elapsed timer doesn't reset with agenda timer | ✅ | Test 5.3 |
| Can save agenda as template | ✅ | Test 6.1 |
| Templates persist across sessions | ✅ | Test 6.4 |
| Can load saved templates | ✅ | Test 6.3 |

---

## Additional Validation

### Browser Console
- ✅ No JavaScript errors during normal operation
- ✅ No security warnings
- ✅ localStorage operations work correctly

### Performance
- ✅ Timer updates don't cause UI lag
- ✅ Page loads remain fast with saved templates

### Security
- ✅ CodeQL: 0 vulnerabilities
- ✅ localStorage data is validated before use
- ✅ Malformed template data is filtered out

---

## Known Limitations

1. **Viewer mode**: Only triggered by `mode=viewer` query param
2. **Templates**: Stored in localStorage (browser-specific, not synced)
3. **Debug panel**: Requires page reload to see `?debug=1` changes
4. **Alert dialogs**: Uses browser alerts (could be improved to toasts)

---

## Testing Environment

- **Dev Server**: `npm run dev` (http://localhost:5173)
- **Build**: `npm run build` → `dist/` folder
- **Browser**: Chrome/Firefox/Safari recommended

---

## Troubleshooting

**Issue**: "Cannot read property 'meetingTimer' of null"
- **Solution**: Ensure you're connected to a room before checking elapsed timer

**Issue**: Templates not loading
- **Solution**: Check browser console for localStorage errors, clear localStorage if needed

**Issue**: Elapsed timer not updating
- **Solution**: Ensure agenda timer has been started at least once

**Issue**: Debug panel always visible
- **Solution**: Check `.env` file for `VITE_SHOW_DEBUG_PANEL=true`, remove or set to `false`
