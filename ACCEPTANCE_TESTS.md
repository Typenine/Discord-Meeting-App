# Acceptance Test Checklist - Viewer Link & Popout Fix

## Prerequisites
- [ ] Branch deployed to Vercel
- [ ] Vercel deployment URL: __________________
- [ ] Browser with console access (Chrome/Firefox)
- [ ] Incognito/Private browsing window available

## Test 1: Create Meeting and Get Links
- [ ] Navigate to Vercel deployment URL
- [ ] Create a new meeting room
- [ ] Note room ID: __________________
- [ ] Meeting loads successfully
- [ ] Host controls visible

## Test 2: Viewer Link Generation
- [ ] Click "Share" button in meeting
- [ ] Share modal opens
- [ ] Viewer link is displayed
- [ ] Open browser console (F12)
- [ ] Verify `[DEBUG VIEWER LINK]` log appears
- [ ] Note viewer link from console: __________________
- [ ] Close share modal

## Test 3: Viewer Link Access (Critical)
- [ ] Copy the viewer link
- [ ] Open NEW incognito/private window
- [ ] Paste and navigate to viewer link
- [ ] **VERIFY: Page loads (NO 404 error)**
- [ ] Open console in incognito window
- [ ] Verify `[DEBUG URL PARSING]` log appears
- [ ] Verify `[DEBUG URL PARSED]` shows correct roomId
- [ ] **VERIFY: Meeting view loads as attendee**
- [ ] **VERIFY: Current agenda item visible**
- [ ] **VERIFY: Timer is visible and synchronized**
- [ ] Verify NO host controls visible
- [ ] Keep this window open for sync testing

## Test 4: Popout Generation
- [ ] Return to original host window
- [ ] Click "Popout" button
- [ ] Verify `[DEBUG POPOUT]` log in console
- [ ] Note popout URL from console: __________________

## Test 5: Popout Window Opens (Critical)
- [ ] Verify popup window opens
- [ ] **VERIFY: NO 404 error in popup**
- [ ] Open console in popup window (F12)
- [ ] Verify `[DEBUG URL PARSING]` log appears
- [ ] Verify `[DEBUG URL PARSED]` shows `isPopout: true`
- [ ] **VERIFY: Compact popout view renders**
- [ ] **VERIFY: Current agenda item title visible**
- [ ] **VERIFY: Large timer display visible**
- [ ] **VERIFY: Participant count visible**

## Test 6: Timer Synchronization
- [ ] In host window, start the timer
- [ ] Verify timer starts in:
  - [ ] Host window
  - [ ] Viewer window (incognito)
  - [ ] Popout window
- [ ] Pause timer in host window
- [ ] Verify timer pauses in all windows
- [ ] Resume timer in host window
- [ ] Verify timer resumes in all windows
- [ ] Times are synchronized across all windows (within 1 second)

## Test 7: Agenda Changes Sync
- [ ] In host window, add a new agenda item
- [ ] Verify new item appears in:
  - [ ] Viewer window
  - [ ] Popout window
- [ ] In host window, move to next agenda item
- [ ] Verify current item updates in:
  - [ ] Viewer window
  - [ ] Popout window

## Test 8: API Endpoints (Regression Test)
- [ ] In host window, open Network tab
- [ ] Filter for "ws" (WebSocket)
- [ ] Verify WebSocket connection is established
- [ ] Verify NO 404 errors for WebSocket
- [ ] Filter for "api"
- [ ] Verify NO 404 errors for any `/api/*` requests
- [ ] Timer controls work without errors
- [ ] Agenda modifications work without errors

## Test 9: Direct Navigation
- [ ] Close all windows except host
- [ ] Copy the room URL with hostKey from address bar
- [ ] Open new tab
- [ ] Paste and navigate to URL
- [ ] **VERIFY: Page loads (NO 404)**
- [ ] **VERIFY: Host view loads with controls**
- [ ] Close this tab

## Test 10: Direct Popout URL Navigation
- [ ] Copy the popout URL from earlier (Test 4)
- [ ] Open new tab
- [ ] Paste and navigate to popout URL
- [ ] **VERIFY: Page loads (NO 404)**
- [ ] **VERIFY: Popout view renders correctly**
- [ ] Close this tab

## Test 11: URL Patterns
Test these URL patterns directly (replace {roomId} with actual room ID):

- [ ] `/{roomId}` - Viewer link
  - [ ] Loads successfully (NO 404)
  - [ ] Shows attendee view

- [ ] `/{roomId}?hostKey={key}` - Host link
  - [ ] Loads successfully (NO 404)
  - [ ] Shows host controls

- [ ] `/{roomId}?popout=1&as=attendee` - Popout
  - [ ] Loads successfully (NO 404)
  - [ ] Shows compact popout view

- [ ] `/room/{roomId}` - Alternative pattern
  - [ ] Loads successfully (NO 404)
  - [ ] Shows attendee view

## Test 12: Edge Cases
- [ ] Navigate to `/` (root)
  - [ ] Shows home/create page (NOT 404)

- [ ] Navigate to `/nonexistent`
  - [ ] Shows home page or appropriate UI (NOT Vercel 404)

- [ ] Navigate to `/api/health`
  - [ ] Returns JSON health status (NOT 404)
  - [ ] NOT index.html

## Summary
- [ ] All critical tests passed (no 404 errors)
- [ ] Viewer links work publicly
- [ ] Popout opens successfully
- [ ] Timer synchronization works
- [ ] No API regression
- [ ] Ready to remove debug logs

## Issues Found
_(List any issues encountered during testing)_

1. 
2. 
3. 

## Sign-off
- Tested by: __________________
- Date: __________________
- Vercel deployment: __________________
- All tests passed: [ ] YES  [ ] NO
