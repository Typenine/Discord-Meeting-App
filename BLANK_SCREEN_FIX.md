# Blank Screen Bug Fix - Testing Guide

## Issue Summary
User reported that the screen goes blank after clicking "Create Meeting" in preview mode.

## Root Cause
The `startMeetingAfterSetup()` function in `App.jsx` had insufficient error handling:
- When the API call failed, `post()` returned `null`
- The function did not throw an error or provide feedback
- `setStatus("joined")` was never called
- UI remained in a broken state

## Fix Applied
1. **Error Throwing**: `startMeetingAfterSetup()` now throws an error when API call fails
2. **Try-Catch Block**: Button click handler wraps async operations in try-catch
3. **Loading State**: Added `isStarting` state to prevent double-clicks
4. **User Feedback**: Button shows "⏳ Starting..." during operation
5. **Error Display**: Existing error banner shows error messages to users

## Testing Instructions

### Manual Testing Steps

#### Test 1: Normal Meeting Creation (Happy Path)
1. Open the app in Discord Activity mode or standalone
2. Enter your name
3. Click "Start New Meeting" or "Create New Meeting Room"
4. Fill in meeting name (or leave default)
5. Add at least one agenda item (optional)
6. Click "🚀 Start Meeting"

**Expected Result:**
- Button text changes to "⏳ Starting..."
- Button becomes disabled
- Meeting starts successfully
- Screen transitions to joined/meeting view
- No blank screen

#### Test 2: API Failure Simulation
To test error handling, you need to simulate an API failure:

**Option A: Network Failure**
1. Start creating a meeting
2. Open browser DevTools (F12)
3. Go to Network tab
4. Enable "Offline" mode
5. Click "🚀 Start Meeting"

**Expected Result:**
- Button shows "⏳ Starting..."
- After timeout, error banner appears with: "Network error. Please check your connection."
- Button returns to "🚀 Start Meeting"
- Button re-enables
- No blank screen

**Option B: Backend Not Running**
1. Ensure backend server is NOT running
2. Try to create a meeting
3. Click "🚀 Start Meeting"

**Expected Result:**
- Same as Option A
- Clear error message displayed
- No blank screen

#### Test 3: Double-Click Prevention
1. Start creating a meeting
2. Fill in details
3. Quickly double-click "🚀 Start Meeting"

**Expected Result:**
- Only one request is sent to backend
- Button stays disabled during first click
- Second click is ignored
- No duplicate meetings created

#### Test 4: Server Error Response
If you have control over the backend, test with:
- 500 Internal Server Error
- 403 Forbidden Error
- 404 Not Found Error

**Expected Result:**
- Appropriate error messages displayed
- Button re-enables after error
- No blank screen

### Automated Testing

Currently, this fix does not have automated tests. To add tests, you would need:

1. **Unit Tests** (Vitest/Jest):
```javascript
describe('startMeetingAfterSetup', () => {
  it('should throw error when post returns null', async () => {
    // Mock post to return null
    // Expect function to throw
  });
  
  it('should set status to joined on success', async () => {
    // Mock successful post
    // Verify setStatus called with "joined"
  });
});
```

2. **Integration Tests** (Playwright/Cypress):
```javascript
test('displays error on API failure', async ({ page }) => {
  // Mock API to fail
  await page.goto('/');
  await page.fill('input[name="name"]', 'Test User');
  await page.click('button:has-text("Start New Meeting")');
  await page.click('button:has-text("Start Meeting")');
  
  // Verify error message appears
  await expect(page.locator('.error')).toBeVisible();
});
```

## Verification Checklist

- [ ] Button shows loading state ("⏳ Starting...")
- [ ] Button is disabled during operation
- [ ] Error messages appear in banner (red box at top)
- [ ] Button re-enables after error
- [ ] No blank screens on any error
- [ ] Single-click protection works (no double-submit)
- [ ] Successful meeting creation still works
- [ ] Error handling applies to both:
  - [ ] `updateSetup()` call
  - [ ] `startMeetingAfterSetup()` call

## Related Files

**Modified:**
- `client/src/App.jsx` (lines 117, 329-340, 807-832)

**Not Modified (but related):**
- `client/src/StandaloneApp.jsx` - Already has proper error handling
- `server/src/app.js` - Backend endpoints
- `server/src/store.js` - Backend state management

## Browser Console Logs

### Before Fix
```
Failed to start meeting: TypeError: Cannot read properties of null
(no user-visible error message)
```

### After Fix
```
Failed to start meeting: Error: Failed to start meeting
Network error. Please check your connection. (visible to user)
```

## Known Issues / Future Improvements

1. **Error Specificity**: Error messages could be more specific (e.g., "Server is down" vs "Network timeout")
2. **Retry Button**: Could add "Retry" button to error banner
3. **Progress Indicator**: Could show step-by-step progress (Updating setup... → Starting meeting...)
4. **Timeout Handling**: Could add explicit timeout (e.g., 30 seconds) with better message
5. **Offline Detection**: Could detect offline state before attempting API call

## Rollback Plan

If this fix causes issues, revert with:
```bash
git revert c248e42
git push origin copilot/improve-agenda-controls
```

The original code will restore, but users will experience blank screens again.

## Success Metrics

After deployment, monitor:
- Reduction in "blank screen" bug reports
- API error rates (should be visible now)
- User session abandonment rates during meeting creation
- Console error logs

## Additional Notes

- This fix only applies to `App.jsx` (Discord Activity mode)
- `StandaloneApp.jsx` already has proper error handling (lines 426-481)
- Error messages use existing error banner component (no new UI added)
- Loading state uses existing button styles (no CSS changes)
