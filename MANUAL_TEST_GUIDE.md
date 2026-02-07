# Manual Test Guide: Proposal Support & Category Timeboxing

## Overview
This guide provides step-by-step instructions for testing the new league-meeting proposal support and category timeboxing features.

## Prerequisites
- Running instance of Discord-Meeting-App
- Access to host controls
- Separate browser/window for testing attendee view

---

## Test 1: Create Normal Agenda Item (Baseline)
**Purpose:** Verify existing functionality still works

### Steps:
1. Open Host Panel → Agenda Management
2. Fill in "New Agenda Item":
   - Title: "Welcome & Roll Call"
   - Duration: 5 minutes
   - Notes: "Verify quorum"
   - Type: Leave as "Normal Item"
3. Click "Add Item"

### Expected Results:
- ✅ Item appears in agenda list
- ✅ Shows duration pill
- ✅ Can be set as active
- ✅ Can be edited inline
- ✅ Timer works when active

---

## Test 2: Create Proposal Item
**Purpose:** Test new proposal type functionality

### Steps:
1. In "New Agenda Item" form:
   - Title: "Rule Change: Draft Eligibility"
   - Duration: 15 minutes
   - Notes: "Discuss eligibility requirements"
   - Type: Select "Proposal Item"
   - Description: "Proposal to change draft eligibility from 2 years to 3 years of membership"
   - Link: "https://example.com/proposal-doc"
   - Category: "Rules"
2. Click "Add Item"

### Expected Results:
- ✅ Item appears with "📋 Proposal" badge
- ✅ Shows "🏷️ Rules" category badge
- ✅ Quick actions menu includes "🗳️ Add to Ballot" option
- ✅ Inline editing shows all proposal fields
- ✅ Can switch type between Normal and Proposal

---

## Test 3: Ballot Queue Management
**Purpose:** Test ballot queue functionality

### Steps:
1. Find the proposal item created in Test 2
2. Click the "⋯" menu button
3. Click "🗳️ Add to Ballot"
4. Scroll down to "Ballot Queue" section

### Expected Results:
- ✅ Proposal shows "🗳️ On Ballot" badge
- ✅ Appears in Ballot Queue section
- ✅ Shows description in ballot queue
- ✅ Can remove from ballot (menu shows "❌ Remove from Ballot")
- ✅ Removing updates badge and queue immediately

---

## Test 4: Category Timeboxing
**Purpose:** Test category budget warnings

### Steps:
1. Create three items in "Rules" category:
   - Item 1: 15 minutes
   - Item 2: 20 minutes  
   - Item 3: 25 minutes
2. Check if "Category Timeboxing" section appears
3. Note the total duration shown (60 minutes)

### Expected Results:
- ✅ Category Timeboxing section visible
- ✅ Shows "🏷️ Rules" with correct item count (3 items)
- ✅ Total Duration shows correctly (1:00:00)
- ✅ Progress bar shows 100% if budget is set
- ✅ If over budget, shows red warning with "⚠️ X:XX over!"

---

## Test 5: Attendee View - Proposal Packet (PopoutView)
**Purpose:** Test attendee can see proposal information

### Steps:
1. Set the proposal item as active
2. Open a new browser window/incognito mode
3. Join the same meeting as attendee
4. Look at the PopoutView (compact overlay)

### Expected Results:
- ✅ Shows "📋 Proposal Packet" section
- ✅ Displays proposal description
- ✅ Shows "🔗 View Proposal Document" link
- ✅ Link opens in new tab when clicked
- ✅ Regular notes (if any) also visible

---

## Test 6: Attendee View - Proposal Packet (RoomLayout)
**Purpose:** Test full-screen attendee view

### Steps:
1. As attendee, view the main meeting room (not popout)
2. Current agenda item should be the active proposal

### Expected Results:
- ✅ Shows larger "📋 Proposal Packet" section
- ✅ Description displayed with proper formatting
- ✅ "🔗 View Full Proposal Document" button visible
- ✅ Button has hover effect
- ✅ Link opens in new tab

---

## Test 7: Attendee View - Ballot Queue
**Purpose:** Test attendees can see ballot queue (read-only)

### Steps:
1. As host, mark 2-3 proposals as "On Ballot"
2. As attendee, scroll down in PopoutView or RoomLayout

### Expected Results:
- ✅ "🗳️ BALLOT QUEUE" section visible
- ✅ Shows all proposals marked on ballot
- ✅ Displays proposal descriptions
- ✅ Shows numbered list (1, 2, 3...)
- ✅ No remove/edit buttons (read-only for attendees)
- ✅ Host view shows remove (×) buttons

---

## Test 8: Vote Integration
**Purpose:** Test auto-populate vote from proposal

### Steps:
1. Set a proposal as active agenda item
2. Scroll to "Voting" section
3. Look for hint message above vote form

### Expected Results:
- ✅ Shows "💡 Tip: The current item is a proposal"
- ✅ Button says "Use Proposal for Vote"
- ✅ Clicking button populates Question with proposal description
- ✅ Options auto-set to "Approve,Reject,Abstain"
- ✅ Can still edit before opening vote
- ✅ Opening vote works normally

---

## Test 9: Inline Editing Proposal Fields
**Purpose:** Test editing existing proposal

### Steps:
1. Click on a proposal item to enter inline edit mode
2. Modify:
   - Type (switch between Normal/Proposal)
   - Description
   - Link URL
   - Category
3. Click outside or press Enter to save

### Expected Results:
- ✅ All fields editable
- ✅ Type selector shows current value
- ✅ Proposal fields visible only when type="proposal"
- ✅ Changes saved immediately
- ✅ Badges update to reflect changes
- ✅ Removing category removes category badge

---

## Test 10: Backward Compatibility
**Purpose:** Ensure existing meetings still work

### Steps:
1. Load a meeting that was created before this update
2. View existing agenda items
3. Create new items using old flow (don't specify proposal fields)

### Expected Results:
- ✅ Existing items display normally
- ✅ No errors in console
- ✅ All old functionality works
- ✅ New items default to type="normal"
- ✅ Optional fields gracefully handled when empty
- ✅ Timer, voting, attendance all work

---

## Test 11: Duplicate with Proposal Fields
**Purpose:** Test duplication copies all fields

### Steps:
1. Select proposal item with all fields filled
2. Open quick actions menu (⋯)
3. Click "📋 Duplicate"

### Expected Results:
- ✅ Creates copy with "(Copy)" suffix
- ✅ Copies all fields: description, link, category
- ✅ Copies type (proposal vs normal)
- ✅ onBallot resets to false (not copied)

---

## Test 12: Category Budget Warnings
**Purpose:** Test over-budget warnings

### Steps:
1. Create 3 items in "Budget" category totaling 45 minutes
2. Manually note that category shows 45 minutes
3. Add another 20-minute item to same category

### Expected Results:
- ✅ Total shows 1:05:00
- ✅ Without budget set, no warnings
- ✅ Warning UI would appear if budget < total
- ✅ Progress bar visual indicator
- ✅ "✓ X remaining" or "⚠️ X over" message

---

## Known Limitations

1. **Category Budget Setting**: Currently displays calculated budgets but UI for setting custom budgets not fully implemented in this phase
2. **Auto-distribute**: Category time auto-distribution is not implemented (planned future enhancement)
3. **Category Validation**: Categories are free-form text, no predefined list

---

## Troubleshooting

### Issue: Proposal fields don't appear
- **Solution**: Ensure type is set to "Proposal Item"
- Check browser console for errors

### Issue: Ballot queue not showing
- **Solution**: At least one proposal must have onBallot=true
- Refresh browser if stale

### Issue: Changes not saving
- **Solution**: Check network tab for failed API calls
- Verify host permissions
- Check server logs

---

## Success Criteria

✅ All 12 tests pass without errors
✅ No console warnings or errors
✅ Backward compatibility maintained
✅ Performance acceptable (no lag when adding items)
✅ UI responsive on different screen sizes
