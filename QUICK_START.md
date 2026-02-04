# Quick Start Guide: Standalone Synced Meeting App

## Overview

This guide helps you get started with the newly implemented standalone synced meeting app.

## What Changed?

### Before (Discord Activity Only)
- Required Discord OAuth
- HTTP polling for updates
- Single mode only

### After (Two Modes)
- ✅ **Standalone Mode**: WebSocket-based, no auth required
- ✅ **Discord Activity Mode**: Preserved, unchanged

## Quick Start (3 Steps)

### 1. Create a Room

1. Open the app in your browser (not in Discord)
2. Enter your name
3. Click "Create New Meeting Room"
4. **Save the Host Link** (you'll need this to control the meeting!)

### 2. Share Links

- **Viewer Link**: Share with attendees (safe to post publicly)
  ```
  https://your-app.com/ABC123
  ```

- **Host Link**: Keep this secret! (gives you control)
  ```
  https://your-app.com/ABC123?hostKey=xY7kL9mNpQ2rS5tU
  ```

**Note**: The new URL format uses path-based routing (e.g., `/ABC123`) instead of query parameters for cleaner, more shareable links.

### 3. Start Meeting

As **Host**, you can:
- ✅ Add agenda items with durations
- ✅ Start/pause/extend timer
- ✅ Open and close votes
- ✅ See results

As **Attendee**, you can:
- ✅ View agenda and timer
- ✅ Vote when host opens voting
- ✅ See live updates

## Features Demo

### Room Creation

```
┌─────────────────────────────────────┐
│ 🎯 Synced Meeting App               │
├─────────────────────────────────────┤
│                                     │
│ Your Name: [John Host_________]    │
│                                     │
│ [Create New Meeting Room]          │
│                                     │
│ ─────────────────────────────────  │
│                                     │
│ Join Existing Room                  │
│ Room ID: [______]                   │
│ Host Key: [______] (optional)       │
│ [Join Room]                         │
└─────────────────────────────────────┘
```

### Link Modal (After Creation)

```
┌─────────────────────────────────────┐
│ 🎉 Room Created!                    │
│ Room ID: ABC123                     │
├─────────────────────────────────────┤
│ 👥 Viewer Link (share with team):  │
│ ┌─────────────────────────────────┐ │
│ │ https://app.com/ABC123          │ │
│ └─────────────────────────────────┘ │
│ [📋 Copy Viewer Link]              │
│                                     │
│ 🔑 Host Link (keep secret!):       │
│ ┌─────────────────────────────────┐ │
│ │ https://app.com/ABC123          │ │
│ │ ?hostKey=xY7kL9mNpQ2rS5tU        │ │
│ └─────────────────────────────────┘ │
│ [📋 Copy Host Link]                │
│                                     │
│ [Start Meeting] ←──────────────────│
└─────────────────────────────────────┘
```

### Meeting Interface (Host View)

```
┌──────────────────────────────────────────────┐
│ Room: ABC123                    ✓ HOST      │
├──────────────────────────────────────────────┤
│ Attendance (3)                               │
│ • John Host                                  │
│ • Alice Viewer                               │
│ • Bob Participant                            │
├──────────────────────────────────────────────┤
│ Agenda (2 items)                             │
│ • Opening Remarks (300s) [ACTIVE]            │
│   [Set Active] [Delete]                      │
│ • Main Discussion (600s)                     │
│   [Set Active] [Delete]                      │
│                                              │
│ Add Agenda Item:                             │
│ [Title_________] [Duration_] [Add]          │
├──────────────────────────────────────────────┤
│ Timer                                        │
│ ┌────────────────────────────────────────┐  │
│ │           4:52                          │  │
│ │         ⏸ Running                      │  │
│ └────────────────────────────────────────┘  │
│ [▶️ Start] [⏸ Pause] [+60s] [-30s]        │
├──────────────────────────────────────────────┤
│ Voting                                       │
│ Should we extend the meeting?                │
│ • Yes (2 votes - 67%)                       │
│ • No (1 vote - 33%)                         │
│ • Abstain (0 votes - 0%)                    │
│ Votes cast: 3                               │
│ [Close Vote]                                │
└──────────────────────────────────────────────┘
```

### Meeting Interface (Attendee View)

```
┌──────────────────────────────────────────────┐
│ Room: ABC123                 ATTENDEE       │
├──────────────────────────────────────────────┤
│ Attendance (3)                               │
│ • John Host                                  │
│ • Alice Viewer                               │
│ • Bob Participant                            │
├──────────────────────────────────────────────┤
│ Agenda (2 items)                             │
│ • Opening Remarks (300s) [ACTIVE]            │
│ • Main Discussion (600s)                     │
├──────────────────────────────────────────────┤
│ Timer                                        │
│ ┌────────────────────────────────────────┐  │
│ │           4:52                          │  │
│ │         ⏸ Running                      │  │
│ └────────────────────────────────────────┘  │
├──────────────────────────────────────────────┤
│ Voting                                       │
│ Should we extend the meeting?                │
│ • Yes [Vote] ← Click to vote                │
│ • No [Vote]                                 │
│ • Abstain [Vote]                            │
│ Votes cast: 2                               │
└──────────────────────────────────────────────┘
```

## Timer Synchronization Explained

### How It Works

1. **Server**: Sets `endsAtMs = Date.now() + 300000` (5 minutes)
2. **Server**: Broadcasts STATE every 1 second
3. **Client**: Calculates `remaining = endsAtMs - (Date.now() + offset)`
4. **Client**: Updates display every 1 second
5. **TIME_PING/PONG**: Measures and corrects clock offset every 10 seconds

### Result

All clients show the same timer value (±1 second precision):

```
Server: 4:52
Client A: 4:52  ← Perfect sync
Client B: 4:52  ← Perfect sync
Client C: 4:51  ← Within acceptable range
```

## Voting Workflow

### 1. Host Opens Vote

```
Host clicks "Open Vote"
→ Server broadcasts STATE with vote.open = true
→ All clients see vote question and options
```

### 2. Attendees Vote

```
Attendee clicks "Vote" on "Yes"
→ Client sends VOTE_CAST { optionIndex: 0 }
→ Server adds to votesByUserId[userId] = 0
→ Server broadcasts STATE with updated vote count
→ All clients see "Votes cast: 1, 2, 3..."
```

### 3. Host Closes Vote

```
Host clicks "Close Vote"
→ Server tallies votes
→ Server adds to closedResults[]
→ Server broadcasts STATE with results
→ All clients see results with percentages
```

## Security Model

### Room ID
- **Format**: 6 characters (ABC123)
- **Purpose**: Identifies the room
- **Security**: Public, safe to share
- **Collision**: Low probability with 36^6 = 2 billion combinations

### Host Key
- **Format**: 16 characters (xY7kL9mNpQ2rS5tU)
- **Purpose**: Grants host privileges
- **Security**: Secret, keep private
- **Validation**: Server-side only
- **Transmission**: Only during initial HELLO, never in STATE broadcasts

### Attack Resistance

❌ **Cannot**: Guess hostKey (36^16 = 10^24 combinations)  
❌ **Cannot**: Extract hostKey from WebSocket messages  
❌ **Cannot**: Spoof host actions (server validates every action)  
✅ **Can**: Join as viewer (intended behavior)  

## Troubleshooting

### Timer Not Syncing?

1. Check browser console for TIME_PONG messages
2. Verify WebSocket connection is active (look for "Connected")
3. Check if `serverTimeOffset` is being calculated

### Host Controls Not Working?

1. Verify you're using the Host Link (with hostKey)
2. Check for ERROR messages in browser console
3. Ensure WebSocket is connected

### Room Not Found?

1. Verify room ID is correct (case-sensitive: ABC123 ≠ abc123)
2. Check that room is still active (rooms expire when everyone leaves)
3. Try creating a new room

### WebSocket Connection Fails?

1. Check that VITE_WORKER_DOMAIN is configured correctly
2. Verify Cloudflare Worker is deployed and running
3. Check browser console for connection errors
4. Ensure your network allows WebSocket connections

## Development vs Production

### Local Development

```bash
# Terminal 1: Start worker
cd worker
npm run dev

# Terminal 2: Start client
cd client
npm run dev

# Open http://localhost:5173
```

**Config**:
- WebSocket: `ws://localhost:8787/api/ws`
- API: `http://localhost:8787/api/room/create`

### Production

**Cloudflare Worker**:
```bash
cd worker
wrangler deploy
# Note: https://your-worker.workers.dev
```

**Vercel Environment**:
```
VITE_WORKER_DOMAIN = your-worker.workers.dev
```

**URLs**:
- WebSocket: `wss://your-worker.workers.dev/api/ws`
- API: `https://your-worker.workers.dev/api/room/create`

## Best Practices

### For Hosts

✅ **DO**: Save the host link in a password manager  
✅ **DO**: Share only the viewer link with team  
✅ **DO**: Add agenda items before starting timer  
✅ **DO**: Close votes to show results  
❌ **DON'T**: Post host link in public channels  
❌ **DON'T**: Share host link via insecure methods  

### For Attendees

✅ **DO**: Join promptly when meeting starts  
✅ **DO**: Vote when polls are open  
✅ **DO**: Watch the timer  
❌ **DON'T**: Try to control the meeting without host link  

## FAQs

**Q: Can I have multiple hosts?**  
A: Yes! Anyone with the host link has host privileges.

**Q: How long do rooms last?**  
A: Rooms exist as long as someone is connected. When everyone leaves, the room is cleaned up.

**Q: Can I rejoin after disconnecting?**  
A: Yes! Use the same room link to rejoin. The app will automatically reconnect if you lose connection temporarily.

**Q: Is this compatible with Discord Activity mode?**  
A: Yes! Discord Activity mode is fully preserved. The app automatically detects if you're in Discord and uses the appropriate mode.

**Q: What happens if I lose the host link?**  
A: You'll need to create a new room. There's no way to recover a lost hostKey for security reasons.

**Q: Can viewers see who voted for what?**  
A: No. Vote results show counts and percentages only. Individual votes are private.

## Next Steps

1. **Deploy**: Follow deployment instructions in STANDALONE_MODE.md
2. **Test**: Run through scenarios in TEST_PLAN.md
3. **Use**: Start hosting your first synced meeting!
4. **Feedback**: Report any issues on GitHub

## Support

- **Documentation**: See STANDALONE_MODE.md for detailed info
- **Testing**: See TEST_PLAN.md for comprehensive test scenarios
- **Implementation**: See IMPLEMENTATION_COMPLETE.md for technical details
- **Issues**: Report on GitHub repository

---

**Status**: ✅ Ready to use  
**Version**: 1.0.0  
**Last Updated**: 2026-02-03
