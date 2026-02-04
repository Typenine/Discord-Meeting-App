# Voting System Documentation

Complete documentation for the voting system with clientId-based identity and structured options.

## Overview

The voting system allows the host to create polls with custom questions and options. Attendees can cast one vote each, and results are tallied in real-time. When the host closes the vote, results are stored in history with full statistics.

## Requirements Met

Per the problem statement, the backend vote state includes:

- ✅ `open: boolean` - Whether voting is currently active
- ✅ `question: string` - The question being voted on
- ✅ `options: Array<{ id, label }>` - Structured options with unique IDs
- ✅ `votesByClientId: Record<clientId, optionId>` - One vote per client

## State Structure

### Backend Vote State

```javascript
{
  vote: {
    open: false,                    // Whether a vote is currently open
    question: "",                   // The vote question
    options: [                      // Array of option objects
      { id: "opt1", label: "Yes" },
      { id: "opt2", label: "No" },
      { id: "opt3", label: "Abstain" }
    ],
    votesByClientId: {              // Map of clientId → optionId
      "client_1738614472000_abc": "opt1",
      "client_1738614473000_def": "opt2"
    },
    closedResults: [                // History of past votes
      {
        ts: 1738614480000,
        agendaId: "a123",
        question: "Approve proposal?",
        options: [...],
        tally: { "opt1": 5, "opt2": 3, "opt3": 1 },
        totalVotes: 9
      }
    ]
  }
}
```

## Core Operations

### 1. Open Vote

**Host action:** Create a new vote with question and options.

**Backend Function:**
```javascript
function openVote(session, { question, options }) {
  session.vote.open = true;
  session.vote.question = question;
  // Convert options to structured format
  session.vote.options = options.map((opt, idx) => {
    if (typeof opt === 'object' && opt.id && opt.label) {
      return opt; // Already structured
    }
    // Convert string to object
    const label = typeof opt === 'string' ? opt : String(opt);
    return { id: `opt${idx + 1}`, label };
  });
  session.vote.votesByClientId = {};
}
```

**Input (from frontend):**
```javascript
{
  type: "VOTE_OPEN",
  question: "What time works best?",
  options: ["Morning", "Afternoon", "Evening"]
}
```

**Result:**
```javascript
{
  open: true,
  question: "What time works best?",
  options: [
    { id: "opt1", label: "Morning" },
    { id: "opt2", label: "Afternoon" },
    { id: "opt3", label: "Evening" }
  ],
  votesByClientId: {}
}
```

### 2. Cast Vote

**Attendee action:** Vote for one option.

**Backend Function:**
```javascript
function castVote(session, { userId, optionId }) {
  if (!session.vote.open) return false;
  // Validate option exists
  const optionExists = session.vote.options.some(opt => opt.id === optionId);
  if (!optionExists) return false;
  // Store vote (overwrites previous vote if any)
  session.vote.votesByClientId[userId] = optionId;
  return true;
}
```

**Message:**
```javascript
{
  type: "VOTE_CAST",
  optionId: "opt1"
}
```

**Key Features:**
- One vote per clientId
- Subsequent votes overwrite previous vote
- Invalid optionId rejected
- State broadcasted to all clients immediately

### 3. Close Vote

**Host action:** End voting and calculate results.

**Backend Function:**
```javascript
function closeVote(session) {
  if (!session.vote.open) return null;

  // Count votes by option id
  const tally = {};
  session.vote.options.forEach(opt => {
    tally[opt.id] = 0;
  });
  
  for (const optionId of Object.values(session.vote.votesByClientId)) {
    if (tally[optionId] !== undefined) {
      tally[optionId] += 1;
    }
  }

  const result = {
    ts: Date.now(),
    agendaId: session.activeAgendaId,
    question: session.vote.question,
    options: session.vote.options,
    tally,
    totalVotes: Object.keys(session.vote.votesByClientId).length,
  };

  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = "";
  session.vote.options = [];
  session.vote.votesByClientId = {};

  return result;
}
```

**Result:**
```javascript
{
  ts: 1738614480000,
  agendaId: "a1738614472000_abc12",
  question: "What time works best?",
  options: [
    { id: "opt1", label: "Morning" },
    { id: "opt2", label: "Afternoon" },
    { id: "opt3", label: "Evening" }
  ],
  tally: {
    "opt1": 5,   // 5 votes for Morning
    "opt2": 3,   // 3 votes for Afternoon
    "opt3": 1    // 1 vote for Evening
  },
  totalVotes: 9
}
```

## Frontend Implementation

### Component State

```javascript
// Form inputs for creating votes
const [voteQuestion, setVoteQuestion] = useState("");
const [voteOptions, setVoteOptions] = useState("Yes,No,Abstain");
```

### Actions

```javascript
// Host: Open new vote
const openVote = (question, options) => {
  sendMessage({ type: "VOTE_OPEN", question, options });
};

// Host: Close current vote
const closeVote = () => {
  sendMessage({ type: "VOTE_CLOSE" });
};

// Attendee: Cast vote
const castVote = (optionId) => {
  sendMessage({ type: "VOTE_CAST", optionId });
};
```

### Active Vote Display

Shows live tally as votes are cast:

```jsx
{state.vote.open && (
  <div>
    <strong>{state.vote.question}</strong>
    <ul>
      {state.vote.options.map((opt) => {
        const voteCount = Object.values(state.vote.votesByClientId)
          .filter(v => v === opt.id).length;
        const hasVoted = state.vote.votesByClientId[clientId] === opt.id;
        
        return (
          <li key={opt.id}>
            {opt.label} ({voteCount} vote{voteCount !== 1 ? 's' : ''})
            {!isHost && (
              <button
                onClick={() => castVote(opt.id)}
                disabled={state.vote.votesByClientId[clientId] !== undefined}
                style={{
                  backgroundColor: hasVoted ? "#28a745" : "#007bff"
                }}
              >
                {hasVoted ? "✓ Voted" : "Vote"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
    <div>Votes cast: {Object.keys(state.vote.votesByClientId).length}</div>
    {isHost && <button onClick={closeVote}>Close Vote</button>}
  </div>
)}
```

**Key Features:**
- **Live tally:** Shows vote count for each option as votes come in
- **Visual feedback:** Voted option turns green with "✓ Voted" text
- **Disabled after voting:** Button becomes unclickable after voting
- **Total count:** Shows total number of votes cast

### Past Votes Display

Shows history of closed votes with results:

```jsx
{state.vote.closedResults?.length > 0 && (
  <details>
    <summary>Past Votes ({state.vote.closedResults.length})</summary>
    <ul>
      {state.vote.closedResults.map((result, idx) => (
        <li key={idx}>
          <strong>{result.question}</strong>
          <ul>
            {result.options.map((opt) => {
              const voteCount = result.tally[opt.id] || 0;
              const percentage = result.totalVotes > 0
                ? Math.round((voteCount / result.totalVotes) * 100)
                : 0;
              
              return (
                <li key={opt.id}>
                  {opt.label}: {voteCount} vote{voteCount !== 1 ? 's' : ''} ({percentage}%)
                </li>
              );
            })}
          </ul>
          <div>Total votes: {result.totalVotes}</div>
        </li>
      ))}
    </ul>
  </details>
)}
```

## Message Protocol

### VOTE_OPEN (Host → Server)

Opens a new vote.

```javascript
{
  type: "VOTE_OPEN",
  question: "Approve the proposal?",
  options: ["Yes", "No", "Abstain"]
}
```

**Server Response:** Broadcasts STATE with `vote.open = true`

### VOTE_CAST (Attendee → Server)

Casts a vote for an option.

```javascript
{
  type: "VOTE_CAST",
  optionId: "opt1"
}
```

**Server Response:** Broadcasts STATE with updated `votesByClientId`

### VOTE_CLOSE (Host → Server)

Closes the current vote and calculates results.

```javascript
{
  type: "VOTE_CLOSE"
}
```

**Server Response:** Broadcasts STATE with `vote.open = false` and results in `closedResults`

## Permission Model

### Host Permissions
- ✅ Open vote
- ✅ Close vote
- ✅ View live results
- ❌ Cannot cast vote (host doesn't vote)

### Attendee Permissions
- ❌ Cannot open vote
- ❌ Cannot close vote
- ✅ Cast one vote
- ✅ View live tally
- ✅ Change vote (overwrite previous)

## Example Flows

### Complete Vote Flow

1. **Host opens vote:**
   ```
   Question: "Break for lunch?"
   Options: "Yes, hungry", "No, let's continue", "Take 5 min only"
   ```

2. **Server creates structured options:**
   ```javascript
   options: [
     { id: "opt1", label: "Yes, hungry" },
     { id: "opt2", label: "No, let's continue" },
     { id: "opt3", label: "Take 5 min only" }
   ]
   ```

3. **Attendees vote:**
   ```
   Client A → opt1
   Client B → opt1
   Client C → opt2
   Client D → opt1
   Client E → opt3
   ```

4. **Live tally updates:**
   ```
   Yes, hungry (3 votes)
   No, let's continue (1 vote)
   Take 5 min only (1 vote)
   
   Votes cast: 5
   ```

5. **Host closes vote:**
   ```javascript
   {
     question: "Break for lunch?",
     options: [...],
     tally: { "opt1": 3, "opt2": 1, "opt3": 1 },
     totalVotes: 5
   }
   ```

6. **Results displayed:**
   ```
   Break for lunch?
   - Yes, hungry: 3 votes (60%)
   - No, let's continue: 1 vote (20%)
   - Take 5 min only: 1 vote (20%)
   Total votes: 5
   ```

### Changing Vote

```
1. Client A votes "opt1" → votesByClientId["client_A"] = "opt1"
2. Client A changes mind, votes "opt2" → votesByClientId["client_A"] = "opt2"
3. Final tally includes only the latest vote (opt2)
```

## Backward Compatibility

The system supports both old and new formats for a smooth transition.

### Old Format (Pre-requirement)

```javascript
// Old state
{
  options: ["Yes", "No", "Abstain"],
  votesByUserId: {
    "user_123": 0,  // Index-based
    "user_456": 1
  }
}

// Old tally (array)
tally: [5, 3, 1]
```

### New Format (Post-requirement)

```javascript
// New state
{
  options: [
    { id: "opt1", label: "Yes" },
    { id: "opt2", label: "No" },
    { id: "opt3", label: "Abstain" }
  ],
  votesByClientId: {
    "client_1738614472000_abc": "opt1",  // ID-based
    "client_1738614473000_def": "opt2"
  }
}

// New tally (object)
tally: { "opt1": 5, "opt2": 3, "opt3": 1 }
```

### Frontend Compatibility Layer

The frontend handles both formats:

```javascript
// Extract option details (works with both formats)
const optionId = opt.id || opt;           // Use id if object, else string
const optionLabel = opt.label || opt;     // Use label if object, else string

// Extract vote count (works with both formats)
const voteCount = typeof result.tally === 'object'
  ? (result.tally[optionId] || 0)         // New format (object)
  : (result.tally[result.options.indexOf(opt)] || 0);  // Old format (array)
```

## Benefits of New Structure

### 1. Option IDs
- Stable references to options
- Reordering options doesn't break votes
- Can track specific option across multiple votes

### 2. ClientId-based Votes
- Works in standalone mode (no Discord auth)
- Privacy: clientId is anonymous
- Persistent across page reloads (localStorage)

### 3. Live Tally
- Real-time feedback during voting
- Builds engagement
- No surprises when vote closes

### 4. Visual Feedback
- Users know which option they voted for
- Green button confirms vote was received
- Prevents confusion

## Edge Cases

### Multiple Votes from Same Client

```
Client A votes "opt1" → votesByClientId["client_A"] = "opt1"
Client A votes "opt2" → votesByClientId["client_A"] = "opt2"  // Overwrites
Result: Only "opt2" is counted
```

### Invalid Option ID

```javascript
castVote(session, { userId: "client_A", optionId: "opt999" });
// Returns false, vote not recorded
```

### Vote When No Vote Open

```javascript
castVote(session, { userId: "client_A", optionId: "opt1" });
// Returns false if session.vote.open === false
```

### Close When No Vote Open

```javascript
closeVote(session);
// Returns null, no result created
```

### Zero Votes

```javascript
// Vote closed with no votes cast
{
  tally: { "opt1": 0, "opt2": 0, "opt3": 0 },
  totalVotes: 0
}
```

## Performance Considerations

### Message Volume

**Per vote cast:**
- 1 VOTE_CAST message (client → server)
- 1 STATE broadcast (server → all clients)
- Message size: ~2KB

**For 10 clients voting:**
- 10 incoming messages
- 10 STATE broadcasts
- Total: ~40KB

### Computation

**Tally calculation:**
- O(n) where n = number of votes
- Typically < 100 votes per poll
- Negligible CPU impact

### Storage

**Per vote result:**
- ~500 bytes (question + options + tally)
- 100 votes = 50KB
- Stored in Durable Object state

## Best Practices

### For Hosts

1. **Clear questions:** Make the question unambiguous
2. **Distinct options:** Avoid overlapping choices
3. **Reasonable count:** 2-5 options work best
4. **Wait for votes:** Give attendees time before closing
5. **Announce results:** Discuss outcome after closing

### For System Design

1. **One vote per client:** Enforced server-side
2. **Immediate broadcast:** Low latency for live tally
3. **Stable IDs:** Use generated IDs, not indices
4. **Preserve history:** Keep closed results for review
5. **Graceful degradation:** Handle missing clientId

## Testing Checklist

### Unit Tests (Backend)

- [ ] openVote() converts string options to objects
- [ ] openVote() preserves pre-structured options
- [ ] castVote() validates optionId exists
- [ ] castVote() rejects invalid optionId
- [ ] castVote() overwrites previous vote
- [ ] castVote() rejects vote when not open
- [ ] closeVote() creates correct tally
- [ ] closeVote() handles zero votes
- [ ] closeVote() preserves option structure

### Integration Tests

- [ ] Host opens vote → all clients see it
- [ ] Attendee casts vote → tally updates
- [ ] Second vote from same client → overwrites
- [ ] Host closes vote → results appear
- [ ] Past votes display correctly
- [ ] Non-host cannot open/close
- [ ] Host cannot cast vote

### UI Tests

- [ ] Vote button disabled after voting
- [ ] Voted option turns green
- [ ] Live tally shows correct counts
- [ ] Percentage calculation is accurate
- [ ] Past votes expand/collapse
- [ ] Form clears after opening vote

## Troubleshooting

### Votes Not Updating

**Symptom:** Cast vote doesn't show in tally

**Causes:**
- WebSocket disconnected
- Invalid optionId
- Vote already closed

**Solution:**
- Check WebSocket connection
- Verify optionId in STATE message
- Confirm vote.open === true

### Button Not Disabled

**Symptom:** Can click vote button multiple times

**Causes:**
- clientId not set
- votesByClientId not in state
- React state not updating

**Solution:**
- Check clientId in localStorage
- Verify STATE message includes votesByClientId
- Check React component dependencies

### Tally Incorrect

**Symptom:** Vote count doesn't match visual display

**Causes:**
- Filtering logic error
- Old vote still in votesByClientId
- Multiple STATE messages overlapping

**Solution:**
- Verify filter: `Object.values(votesByClientId).filter(v => v === optionId)`
- Check votesByClientId is cleared on new vote
- Ensure STATE updates are sequential

## Future Enhancements

### Possible Additions

1. **Anonymous voting:** Hide tally until close
2. **Weighted votes:** Host vote counts more
3. **Multiple choice:** Allow voting for multiple options
4. **Vote deadline:** Auto-close after time limit
5. **Vote templates:** Save common vote configurations
6. **Export results:** Download as CSV/JSON
7. **Vote on agenda items:** Link votes to specific items
8. **Conditional options:** Show options based on previous votes

### API Extensions

```javascript
// Future: Anonymous voting
{
  type: "VOTE_OPEN",
  question: "...",
  options: [...],
  anonymous: true  // Hide tally until close
}

// Future: Multiple choice
{
  type: "VOTE_CAST",
  optionIds: ["opt1", "opt3"]  // Vote for multiple
}

// Future: Vote deadline
{
  type: "VOTE_OPEN",
  question: "...",
  options: [...],
  endsAtMs: Date.now() + 60000  // Auto-close in 1 minute
}
```

## Summary

The voting system provides:

✅ **Structured options** with stable IDs
✅ **ClientId-based votes** for standalone mode
✅ **Live tally** with real-time updates
✅ **One vote per client** enforced server-side
✅ **Visual feedback** for voted options
✅ **Vote history** with full statistics
✅ **Backward compatibility** with old format
✅ **Permission control** (host vs attendee)

The implementation meets all requirements from the problem statement and provides a robust, user-friendly voting experience.
