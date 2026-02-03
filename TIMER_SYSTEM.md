# Robust Synced Timer System

## Overview

The robust synced timer system ensures that all clients see a synchronized countdown that updates every second, without requiring server-side tick broadcasts. This is achieved through:

1. **Server-authoritative timestamps** - Server stores absolute end time (`endsAtMs`)
2. **Client-side rendering** - Each client calculates and renders countdown locally
3. **Clock synchronization** - TIME_PING/PONG calibrates server offset every 30 seconds
4. **State-based transitions** - Server only broadcasts on timer state changes

## Timer State Structure

### Backend State (Durable Object)

```javascript
timer: {
  running: boolean,              // Is timer currently running?
  endsAtMs: number | null,       // Absolute end timestamp (when running)
  durationSec: number,           // Duration for current agenda item
  pausedRemainingSec: null,      // Remaining seconds when paused
  updatedAtMs: number            // Server timestamp of last state change
}
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                      STOPPED                                 │
│  running: false                                              │
│  endsAtMs: null                                              │
│  pausedRemainingSec: null                                    │
│  durationSec: <from agenda item>                            │
└────────────┬────────────────────────────────────────────────┘
             │ START
             │ endsAtMs = now + durationSec*1000
             ▼
┌─────────────────────────────────────────────────────────────┐
│                      RUNNING                                 │
│  running: true                                               │
│  endsAtMs: <absolute timestamp>                              │
│  pausedRemainingSec: null                                    │
└────────────┬──────────────────────────┬─────────────────────┘
             │ PAUSE                    │ timer reaches 0
             │ pausedRemainingSec =     │ (client detects)
             │   ceil((endsAtMs-now)/1000)
             ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      PAUSED                                  │
│  running: false                                              │
│  endsAtMs: null                                              │
│  pausedRemainingSec: <remaining seconds>                     │
└────────────┬────────────────────────────────────────────────┘
             │ RESUME
             │ endsAtMs = now + pausedRemainingSec*1000
             ▼
          (back to RUNNING)

          RESET from any state → STOPPED
```

## Timer Operations

### START

**When:** Timer is stopped (`running=false`, `pausedRemainingSec=null`)

**Action:**
```javascript
function timerStart(session) {
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.durationSec * 1000;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}
```

**Effect:**
- Timer starts running from `durationSec`
- Clients calculate remaining time using `endsAtMs`

### PAUSE

**When:** Timer is running (`running=true`)

**Action:**
```javascript
function timerPause(session) {
  const serverNowMs = Date.now();
  const remainingMs = Math.max(0, session.timer.endsAtMs - serverNowMs);
  session.timer.pausedRemainingSec = Math.ceil(remainingMs / 1000);
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.updatedAtMs = serverNowMs;
}
```

**Effect:**
- Captures remaining time in `pausedRemainingSec`
- Clears `endsAtMs` so clients stop counting down
- Clients display frozen countdown

### RESUME

**When:** Timer is paused (`running=false`, `pausedRemainingSec !== null`)

**Action:**
```javascript
function timerResume(session) {
  const serverNowMs = Date.now();
  session.timer.running = true;
  session.timer.endsAtMs = serverNowMs + session.timer.pausedRemainingSec * 1000;
  session.timer.pausedRemainingSec = null;
  session.timer.updatedAtMs = serverNowMs;
}
```

**Effect:**
- Resumes countdown from paused time
- New `endsAtMs` set for clients to continue

### RESET

**When:** Any state

**Action:**
```javascript
function timerReset(session) {
  const serverNowMs = Date.now();
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.pausedRemainingSec = null;
  // durationSec stays the same
  session.timer.updatedAtMs = serverNowMs;
}
```

**Effect:**
- Returns to stopped state
- Duration remains set to agenda item duration
- Clients display `durationSec`

### EXTEND

**When:** Any state

**Action:**
```javascript
if (session.timer.running && session.timer.endsAtMs != null) {
  // Extend running timer
  session.timer.endsAtMs += seconds * 1000;
} else if (session.timer.pausedRemainingSec !== null) {
  // Extend paused timer
  session.timer.pausedRemainingSec += seconds;
} else {
  // Extend duration for stopped timer
  session.timer.durationSec += seconds;
}
session.timer.updatedAtMs = Date.now();
```

**Effect:**
- Adds (or subtracts) time in appropriate state field
- Clients see updated countdown

## Client-Side Rendering

### Timer Display Logic

```javascript
useEffect(() => {
  if (state.timer.running && state.timer.endsAtMs) {
    // Timer is RUNNING - calculate remaining time
    const updateTimer = () => {
      const serverNow = Date.now() + serverTimeOffset;
      const remaining = Math.max(0, Math.ceil((state.timer.endsAtMs - serverNow) / 1000));
      setLocalTimer(remaining);
    };
    
    updateTimer(); // Initial value
    const interval = setInterval(updateTimer, 1000); // Update every second
    
    return () => clearInterval(interval);
  } else if (state.timer.pausedRemainingSec !== null) {
    // Timer is PAUSED - show paused time
    setLocalTimer(state.timer.pausedRemainingSec);
  } else {
    // Timer is STOPPED - show duration
    setLocalTimer(state.timer.durationSec || 0);
  }
}, [state?.timer, serverTimeOffset]);
```

### Key Points

1. **Running State:** Client calculates `remaining = (endsAtMs - serverNow) / 1000`
   - Uses server offset for accuracy
   - Updates every 1 second with setInterval
   - Independent of server broadcasts

2. **Paused State:** Client displays `pausedRemainingSec`
   - Static value, no countdown
   - Shows exact time when paused

3. **Stopped State:** Client displays `durationSec`
   - Shows full duration of agenda item
   - Ready to start

## Clock Synchronization

### TIME_PING/PONG Protocol

**Purpose:** Calibrate client's understanding of server time

**Flow:**
```
Client                          Server
  │                               │
  ├──TIME_PING (clientSentAt)────>│
  │                               │
  │<────TIME_PONG (clientSentAt,  │
  │              serverNow)────────┤
  │                               │
```

**Client Calculation:**
```javascript
// When TIME_PONG received
const now = Date.now();
const rtt = now - msg.clientSentAt;  // Round-trip time
const serverNow = msg.serverNow + (rtt / 2);  // Estimate server time
const offset = serverNow - now;  // Offset to add to local time
setServerTimeOffset(offset);
```

**Frequency:**
- Initial: Immediately on connection
- Periodic: Every 30 seconds
- On reconnect: Immediately

### Why This Works

1. **RTT/2 Method:**
   - Assumes symmetric network latency
   - Splits round-trip time in half
   - Good enough for timer sync (±500ms typical)

2. **Regular Calibration:**
   - Accounts for clock drift
   - Adapts to network changes
   - Maintains sync over long sessions

3. **Offset Application:**
   - Added to `Date.now()` for all timer calculations
   - Transparent to rest of code
   - Single source of truth

## Message Flow

### State Change Flow

```
Host Client                Durable Object             Other Clients
    │                           │                           │
    ├─TIMER_START──────────────>│                           │
    │                           │                           │
    │<─────STATE (running=true)─┤                           │
    │                           │                           │
    │                           ├─STATE (running=true)──────>│
    │                           │                           │
    │                           │                           │
    │  [Both clients render countdown locally]              │
    │                           │                           │
    │                           │  [30 seconds pass]        │
    │                           │                           │
    ├─TIME_PING────────────────>│                           │
    │<─TIME_PONG (offset)───────┤                           │
    │                           │                           │
    ├─TIMER_PAUSE──────────────>│                           │
    │                           │                           │
    │<─STATE (running=false,────┤                           │
    │        pausedRemainingSec)│                           │
    │                           │                           │
    │                           ├─STATE (paused)───────────>│
    │                           │                           │
```

### Key Observations

1. **No Server Ticking:**
   - Server does NOT send updates every second
   - Only sends STATE on transitions (START, PAUSE, RESUME, RESET, EXTEND)
   - Reduces message volume by ~99% compared to tick-based systems

2. **Client Independence:**
   - Each client renders independently
   - No coordination needed between clients
   - Network jitter doesn't affect smooth countdown

3. **Bandwidth Efficient:**
   - TIME_PONG: ~100 bytes every 30 seconds
   - STATE: ~1-2KB only on transitions
   - Scales to many clients with minimal overhead

## UI States

### Timer Display

```
┌─────────────────────────────────────┐
│           Timer                     │
├─────────────────────────────────────┤
│                                     │
│           05:42                     │  ← Large countdown
│        ▶️ Running                   │  ← Status indicator
│                                     │
└─────────────────────────────────────┘
```

**Status Indicators:**
- ▶️ Running - Timer is counting down
- ⏸ Paused - Timer is paused
- ⏹ Stopped - Timer is at initial duration

### Host Controls

**When Stopped:**
```
[▶️ Start] [🔄 Reset] [+60s] [-30s]
```

**When Running:**
```
[⏸ Pause] [🔄 Reset] [+60s] [-30s]
```

**When Paused:**
```
[▶️ Resume] [🔄 Reset] [+60s] [-30s]
```

**Button Logic:**
- START: Only enabled when `durationSec > 0`
- PAUSE: Only shown when running
- RESUME: Only shown when paused
- RESET: Always available
- EXTEND: Works in all states

### Non-Host View

**Attendees see:**
- Timer countdown (synchronized)
- Status indicator
- NO control buttons (host only)

## Error Handling

### Timer Reaches Zero

**Client Behavior:**
```javascript
const remaining = Math.max(0, Math.ceil((endsAtMs - serverNow) / 1000));
```

- Client uses `Math.max(0, ...)` to prevent negative display
- Countdown stops at 00:00
- No automatic state change

**Server Behavior:**
- Timer continues in running state
- Host can PAUSE, RESET, or EXTEND
- Server doesn't auto-stop (host decision)

### Network Disconnection

**Client Behavior:**
1. Timer continues to count locally using last known `endsAtMs`
2. Reconnect triggers:
   - New TIME_PING for offset calibration
   - STATE resync from server
3. Client adjusts to authoritative server state

**Server Behavior:**
- Timer state preserved in Durable Object
- Reconnecting client gets current state
- No special handling needed

### Clock Skew

**Mitigation:**
1. TIME_PING/PONG every 30 seconds
2. RTT/2 compensates for network latency
3. Offset applied consistently to all calculations

**Typical Accuracy:**
- ±1 second across clients
- Good enough for meeting timers
- Better than human reaction time

## Performance Characteristics

### Message Volume

**Per Client Per Hour:**
- TIME_PONG: 120 messages (every 30s) × 100 bytes = 12 KB
- STATE: ~10 transitions × 2 KB = 20 KB
- **Total: ~32 KB/hour** (very low)

**Comparison to Tick-Based:**
- Tick-based: 3600 messages × 2 KB = 7.2 MB/hour
- **Savings: 99.5%**

### CPU Usage

**Server:**
- No timer interval
- No periodic broadcasts
- Only processes state changes
- **Near zero idle CPU**

**Client:**
- One setInterval per client
- Simple arithmetic every second
- **Negligible CPU usage**

### Scalability

**Supports:**
- 100+ concurrent clients per room
- Multiple rooms per Durable Object
- No performance degradation

**Bottlenecks:**
- WebSocket message fan-out (Cloudflare handles this)
- State serialization (minimal, only on changes)

## Best Practices

### For Implementation

1. **Always use server timestamps:**
   ```javascript
   const serverNowMs = Date.now(); // On server
   ```

2. **Always apply offset on client:**
   ```javascript
   const serverNow = Date.now() + serverTimeOffset; // On client
   ```

3. **Use Math.ceil for remaining seconds:**
   ```javascript
   Math.ceil((endsAtMs - serverNow) / 1000) // Shows 1 when 0.1s left
   ```

4. **Broadcast on every state change:**
   ```javascript
   session.timer.updatedAtMs = Date.now();
   this.broadcastState();
   ```

### For Testing

1. **Test clock skew:**
   - Manually adjust client clock
   - Verify TIME_PING/PONG compensates
   - Check countdown accuracy

2. **Test disconnection:**
   - Close WebSocket mid-countdown
   - Verify timer continues locally
   - Check resync on reconnect

3. **Test state transitions:**
   - START → PAUSE → RESUME → RESET
   - Verify each transition
   - Check all clients stay synced

4. **Test multiple clients:**
   - Open 3+ browser windows
   - Control from one (host)
   - Verify others stay synced within 1 second

## Migration from Old System

### Old Timer State
```javascript
timer: {
  running: boolean,
  endsAtMs: number | null,
  remainingSec: number  // ❌ Used for both paused and stopped
}
```

### New Timer State
```javascript
timer: {
  running: boolean,
  endsAtMs: number | null,
  durationSec: number,           // ✅ Duration from agenda
  pausedRemainingSec: number | null,  // ✅ Explicit paused state
  updatedAtMs: number            // ✅ Change timestamp
}
```

### Key Differences

1. **Paused vs Stopped:**
   - Old: `remainingSec` used for both (ambiguous)
   - New: `pausedRemainingSec` vs `durationSec` (explicit)

2. **Resume Support:**
   - Old: Could not distinguish pause from stop
   - New: RESUME only works when `pausedRemainingSec !== null`

3. **Audit Trail:**
   - Old: No timestamp tracking
   - New: `updatedAtMs` for debugging and logging

4. **Server Ticking:**
   - Old: Server updated `remainingSec` every second
   - New: Server never updates countdown (client-side)

## Troubleshooting

### Timer Drifts Between Clients

**Symptom:** Clients show different times (>2 second difference)

**Causes:**
1. Network latency variation
2. Clock skew
3. Missed TIME_PONG responses

**Solution:**
- Check TIME_PING/PONG frequency (30s)
- Verify offset calculation
- Test with lower latency network

### Timer Jumps When STATE Received

**Symptom:** Countdown jumps forward/backward on state update

**Causes:**
1. Old `endsAtMs` in state
2. Incorrect offset application
3. Race condition in useEffect

**Solution:**
- Ensure state updates trigger timer recalculation
- Verify dependency array includes all timer fields
- Check order of operations in useEffect

### Timer Doesn't Start

**Symptom:** START button does nothing

**Causes:**
1. `durationSec` is 0
2. Not host (permissions)
3. Already running

**Solution:**
- Check agenda item has duration set
- Verify host authentication
- Check timer state before START

### Timer Runs Negative

**Symptom:** Timer shows negative numbers

**Causes:**
1. Missing `Math.max(0, ...)` in calculation
2. Server time far in past

**Solution:**
- Always clamp to 0 minimum
- Check TIME_PING/PONG offset
- Verify server time is correct

## Future Enhancements

### Possible Improvements

1. **Auto-stop at zero:**
   - Server could auto-pause when time expires
   - Requires server-side expiry check

2. **Timer completion events:**
   - Broadcast TIMER_DONE when countdown finishes
   - Could trigger agenda item progression

3. **Multi-timer support:**
   - Multiple concurrent timers
   - Independent control per timer

4. **Timer history:**
   - Log all timer transitions
   - Analytics on timer usage

5. **Configurable precision:**
   - Option for 0.1s precision
   - Higher TIME_PING frequency for accuracy

## Summary

The robust synced timer system provides:

✅ **Server-authoritative** - `endsAtMs` is the source of truth
✅ **Client-rendered** - Smooth 1-second countdown updates
✅ **Clock-synchronized** - TIME_PING/PONG calibrates offset
✅ **Bandwidth-efficient** - No server tick broadcasts
✅ **State-explicit** - Clear running/paused/stopped states
✅ **Host-controlled** - Only host can START/PAUSE/RESUME/RESET
✅ **Multi-client** - All clients stay synced within 1 second

This design scales to many clients while maintaining accuracy and minimizing server overhead.
