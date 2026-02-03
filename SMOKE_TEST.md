# 5-Minute Smoke Test

Quick validation of core meeting flow after deployment.

## Prerequisites

- Server running on port 8787 (or configured port)
- Client accessible at http://localhost:5173 (or configured URL)

## Test Script

### 1. Start Meeting (30 seconds)

```bash
# Test: Create meeting with Discord context
curl -X POST http://localhost:8787/api/session/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "username": "TestHost", "channelId": "channel-999", "guildId": "guild-888"}'

# Expected: Returns sessionId, channelId, guildId
# Save the sessionId for next steps
```

**UI Test**: Open browser → Enter name → Click "Start new meeting" → See meeting ID

### 2. Join Meeting (15 seconds)

```bash
# Test: Join as second user
SESSION_ID="<from-step-1>"
curl -X POST http://localhost:8787/api/session/$SESSION_ID/join \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-456", "username": "TestAttendee"}'

# Expected: Returns session state with 2 attendees
```

**UI Test**: Open incognito window → Enter meeting ID → Click "Join meeting" → See 2 participants

### 3. Add Agenda (30 seconds)

```bash
# Test: Add agenda with action items
curl -X POST http://localhost:8787/api/session/$SESSION_ID/agenda \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "title": "Sprint Planning", "durationSec": 120}'

# Get agenda ID
AGENDA_ID=$(curl -s http://localhost:8787/api/session/$SESSION_ID/state?userId=test-123 | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Add notes with action items
curl -X PUT http://localhost:8787/api/session/$SESSION_ID/agenda/$AGENDA_ID \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "notes": "TODO: Review design\nACTION: Bob to send email\n- [ ] Update docs\n@alice fix bug"}'

# Expected: Agenda item status: "active", notes saved
```

**UI Test**: Add agenda item → See "pending" status → First item auto-activates

### 4. Timer (30 seconds)

```bash
# Test: Start timer with decimal minutes
curl -X POST http://localhost:8787/api/session/$SESSION_ID/timer/start \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "durationMinutes": 0.5}'

# Expected: Timer shows 30 seconds (0.5 * 60)

# Test: Timer validation
curl -X POST http://localhost:8787/api/session/$SESSION_ID/timer/extend \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "seconds": -100}'

# Expected: Error "invalid_extension"
```

**UI Test**: Start timer → See countdown → Pause works → Extend works

### 5. Vote (45 seconds)

```bash
# Test: Open vote
curl -X POST http://localhost:8787/api/session/$SESSION_ID/vote/open \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "question": "Approve priorities?", "options": ["Yes", "No", "Abstain"]}'

# Cast votes
curl -X POST http://localhost:8787/api/session/$SESSION_ID/vote/cast \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123", "optionIndex": 0}'

curl -X POST http://localhost:8787/api/session/$SESSION_ID/vote/cast \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-456", "optionIndex": 0}'

# Close vote
curl -X POST http://localhost:8787/api/session/$SESSION_ID/vote/close \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123"}'

# Expected: Vote closed, results show 2 votes for "Yes" (100%)
```

**UI Test**: Open vote → Cast vote → See tally update → Close vote → Results appear

### 6. End Meeting (60 seconds)

```bash
# Test: End meeting and generate minutes
curl -X POST http://localhost:8787/api/session/$SESSION_ID/end \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-123"}'

# Expected: Markdown minutes with:
# - Channel context (<#channel-999>)
# - 4 extracted action items (TODO, ACTION, checkbox, @mention)
# - Vote results with percentage
# - Attendance list
# - Summary statistics
```

**UI Test**: End meeting → See minutes displayed → Verify Markdown formatting

### 7. Auto-Rejoin (30 seconds)

**UI Test Only**:
1. Start a meeting
2. Refresh the page
3. See auto-rejoin prompt
4. Click "Rejoin Meeting"
5. Verify back in meeting

## Expected Results

✅ **Meeting Flow**: Start → Join → Agenda → Timer → Vote → End → Minutes  
✅ **Discord Context**: channelId and guildId displayed  
✅ **Action Items**: 4+ items extracted from notes  
✅ **Timer Validation**: Negative extension blocked  
✅ **Vote Results**: Percentages calculated  
✅ **Minutes Format**: Markdown with proper structure  
✅ **Auto-Rejoin**: Prompt appears and works  

## Quick Health Check

```bash
curl http://localhost:8787/health | python3 -m json.tool
```

Expected fields:
- `ok`: true/false
- `store.sessions.total`: > 0 after tests
- `store.persistence.totalSaves`: > 0 after tests
- `hostAuth.configured`: true

## Rollback Plan

If smoke test fails:
1. Check server logs: `tail -f server/logs/app.log` (if configured)
2. Verify environment: `HOST_USER_IDS` set (use `*` for testing)
3. Check data directory writable: `ls -la server/data/`
4. Revert: `git revert <commit-hash>`

## Performance Baseline

- Session creation: < 100ms
- State polling: < 50ms
- Minutes generation: < 500ms
- Timer updates: 1s interval (via polling)

## Notes

- **No WebSockets**: All sync via HTTP polling (1-second interval)
- **Works in Discord**: Dual API mount at `/api` and `/proxy/api`
- **Works outside Discord**: Direct API access at `/api`
- **Backward Compatible**: Old sessions load without migration
