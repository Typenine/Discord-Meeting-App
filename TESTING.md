# Testing Guide: Agenda Item Details & Template Persistence

This guide describes how to verify the fixes for:
- **Part A**: Attendees can view full agenda item details including proposal metadata
- **Part B**: Templates persist across deployments and Vercel deployment URLs

## Part A: Attendee Agenda Item Details

### What Was Fixed
- Attendees can now view all proposal details (description, link, category, etc.)
- All views (host, attendee, viewer, popout) can click agenda items to see details
- AgendaItemDetailsModal displays complete proposal information

### How to Test

1. **Create a meeting with a proposal item:**
   - Start a new meeting as host
   - Add an agenda item with type "Proposal"
   - Fill in:
     - Title: "Budget Approval 2024"
     - Duration: 5 minutes
     - Notes: "Review annual budget"
     - Description: "Proposal to approve $50,000 budget for next season"
     - Link: "https://example.com/budget-proposal"
     - Category: "Budget"

2. **View as attendee:**
   - Open the viewer link in a different browser (or incognito window)
   - Join as an attendee (enter a different name)
   - Click on the proposal item in the agenda timeline
   - **Expected**: Modal opens showing:
     - Title and duration
     - Notes
     - Proposal Packet section with:
       - Description text
       - "Open Proposal Link" button (clickable)
       - Category label
       - On Ballot status (if applicable)

3. **Verify in popout window:**
   - From the attendee view, click "Open Popout Window"
   - Click any agenda item in the popout
   - **Expected**: Same modal with full details appears

### Success Criteria
✅ Attendees can click agenda items
✅ Modal shows all proposal fields
✅ Proposal link is clickable
✅ Works in main view, viewer view, and popout window
✅ No permission errors or blank modals

---

## Part B: Template Persistence Across Deployments

### What Was Fixed
- Templates now persist using Cloudflare Durable Object storage
- Templates are keyed by userId (clientId), not session
- Templates survive new deployments and new Vercel URLs
- One-time migration from localStorage to persistent storage

### How to Test

1. **Create and save a template:**
   - Start a meeting as host
   - Add several agenda items (mix of normal and proposal items)
   - Include proposal items with description, link, category
   - Click "Save as Template"
   - Name it: "Test Template 2024"
   - Verify the template appears in "Load Template" dropdown

2. **Verify persistence within same session:**
   - Refresh the page
   - Rejoin the meeting
   - Click "Load Template" dropdown
   - **Expected**: "Test Template 2024" is still there

3. **Simulate new deployment:**
   - Option A (Local testing):
     - Stop and restart the worker/server
     - Clear browser session (but NOT localStorage)
     - Start a new meeting
     - Check template list
   
   - Option B (Production testing):
     - Deploy a new version to Vercel
     - Note the new deployment URL (e.g., `app-abc123.vercel.app`)
     - Visit the NEW deployment URL
     - Start a new meeting
     - Check template list

   - **Expected**: "Test Template 2024" is still available

4. **Verify template contents:**
   - Load the saved template
   - Verify all agenda items are restored with:
     - Correct titles and durations
     - Notes preserved
     - Proposal type items retain description, link, category

5. **Test with different browser/device:**
   - On a different browser or device
   - Use the SAME credentials/userId (same localStorage)
   - Start a new meeting
   - **Expected**: Templates appear because they're tied to userId

6. **Test template operations:**
   - Save another template
   - Delete a template
   - Import/export templates (if UI exists)
   - Refresh and verify changes persist

### Success Criteria
✅ Templates persist after page refresh
✅ Templates persist after server restart
✅ Templates persist after new deployment
✅ Templates persist across different Vercel deployment URLs
✅ Templates include all proposal fields (description, link, category)
✅ Templates are user-specific (tied to userId/clientId)
✅ Old localStorage templates are migrated to server on first load

---

## Quick Verification Checklist

### Part A - Attendee Details
- [ ] Create proposal item with description + link
- [ ] Join as attendee (different browser)
- [ ] Click agenda item
- [ ] Verify modal shows all fields
- [ ] Click "Open Proposal Link" works
- [ ] Test in popout window

### Part B - Template Persistence
- [ ] Save template with proposal items
- [ ] Refresh page - template still exists
- [ ] Deploy new version - template still exists
- [ ] Load template - all fields intact
- [ ] Templates tied to userId (persist across sessions)

---

## Troubleshooting

### Part A Issues
- **Modal is empty**: Check that proposal fields (description, link, category) are being sent by server
- **Click doesn't work**: Check for pointer-events CSS or z-index issues
- **Fields missing**: Verify agenda item schema includes all proposal fields

### Part B Issues
- **Templates disappear on refresh**: Check Durable Object storage is enabled
- **Templates disappear on deploy**: Verify storage uses userId key, not session
- **Migration fails**: Check console for localStorage migration errors
- **Templates empty after load**: Verify proposal fields are included in template schema

---

## Technical Details

### Data Flow - Part A
```
Host creates proposal item → Worker stores with all fields → 
Broadcast to all clients → Attendee receives full object →
Click handler opens AgendaItemDetailsModal → 
Modal renders all proposal fields
```

### Data Flow - Part B
```
Host saves template → Worker stores in DO storage with userId key →
userId = localStorage "userId" (persistent) →
On reconnect: HELLO_ACK includes templates from storage →
Client receives and displays templates
```

### Storage Keys
- Templates: `templates:${userId}` in Durable Object storage
- userId: Persistent in browser localStorage
- Survives: Server restarts, deployments, URL changes
- Per-user: Each userId has their own template collection

---

## Files Changed

See the PR description for a complete list of modified files.
