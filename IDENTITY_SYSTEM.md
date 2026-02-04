# Identity System: roomId, clientId, hostKey

## Overview

The standalone meeting app uses a three-part identity system that provides secure, anonymous access without requiring user accounts or OAuth.

## Components

### 1. ClientId

**Purpose**: Uniquely identifies a user's browser session across page reloads.

**Generation**:
- Created once on first app load
- Format: `client_${timestamp}_${random}`
- Example: `client_1738614472000_abc123def456`

**Storage**:
- Stored in browser localStorage as `evw_client_id`
- Persists across page reloads and browser restarts
- Unique per browser (different browsers = different clientIds)

**Implementation**:
```javascript
const [clientId] = useState(() => {
  if (typeof window !== "undefined") {
    let id = localStorage.getItem("evw_client_id");
    if (!id) {
      id = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem("evw_client_id", id);
    }
    return id;
  }
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
});
```

**Usage**:
- Identifies users in attendance tracking
- Tracks votes per user
- Associates messages with users
- No personal information required

**Privacy**:
- Completely anonymous
- No tracking across devices
- Can be cleared by clearing localStorage
- No server-side persistence beyond active session

### 2. RoomId

**Purpose**: Identifies a specific meeting room.

**Generation**:
- Server-side when room is created
- Format: 6-character uppercase alphanumeric
- Example: `ABC123`
- Character set: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
- Collision probability: 1 in 2,176,782,336 (36^6)

**Implementation**:
```javascript
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

**URL Routing**:
- **Path-based**: `/ABC123` or `/room/ABC123`
- **Query param** (backward compatibility): `?room=ABC123`

**Usage**:
- Maps to Durable Object instance (via `idFromName()`)
- Deterministic routing (same roomId = same Durable Object)
- Safe to share publicly
- Short and easy to communicate verbally

**Lifespan**:
- Exists while at least one client is connected
- Cleaned up when all clients disconnect
- No permanent storage (ephemeral)

### 3. HostKey

**Purpose**: Grants host privileges to control the meeting.

**Generation**:
- Server-side when room is created
- Format: 16-character alphanumeric
- Example: `xY7kL9mNpQ2rS5tU`
- Character set: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`
- Collision probability: Negligible (62^16 ≈ 10^28)

**Implementation**:
```javascript
function generateHostKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

**URL Routing**:
- **Query parameter only**: `?hostKey=xY7kL9mNpQ2rS5tU`
- Never in URL path (security consideration)

**Security**:
- Must be kept secret
- Validated server-side only
- Never included in STATE broadcasts
- Cannot be guessed or brute-forced

**Usage**:
- Controls timer (start, pause, extend)
- Opens and closes votes
- Manages agenda items (add, update, delete)
- All host actions require valid hostKey

**Validation**:
```javascript
validateHostAccess(clientId, providedHostKey) {
  if (this.session.hostKey) {
    return providedHostKey === this.session.hostKey;
  }
  return this.session.hostUserId === clientId;
}
```

## URL Patterns

### Viewer Link (Public)

**Format**: `https://app.com/ABC123`

**Also supported**:
- `https://app.com/room/ABC123`
- `https://app.com?room=ABC123` (backward compatibility)

**Access**:
- ✅ View agenda and timer
- ✅ Cast votes (when host opens voting)
- ✅ See live updates
- ❌ Control timer
- ❌ Open/close votes
- ❌ Manage agenda

### Host Link (Secret)

**Format**: `https://app.com/ABC123?hostKey=xY7kL9mNpQ2rS5tU`

**Also supported**:
- `https://app.com/room/ABC123?hostKey=xY7kL9mNpQ2rS5tU`

**Access**:
- ✅ All viewer capabilities
- ✅ Control timer (start, pause, extend)
- ✅ Open and close votes
- ✅ Manage agenda items
- ✅ See "HOST" badge in UI

**Security Best Practices**:
- ⚠️ Never share host link in public channels
- ⚠️ Store host link securely (password manager)
- ⚠️ Don't post in chat/email/screenshots
- ✅ Share viewer link with all attendees
- ✅ Keep host link for yourself and co-hosts only

## WebSocket Protocol

### Connection Flow

1. **Client connects**: `wss://worker.dev/api/ws?room=ABC123`
2. **Client sends HELLO**:
   ```json
   {
     "type": "HELLO",
     "roomId": "ABC123",
     "clientId": "client_1738614472000_abc123def",
     "hostKey": "xY7kL9mNpQ2rS5tU",  // Only if host
     "displayName": "John Doe"
   }
   ```
3. **Server validates and responds**:
   ```json
   {
     "type": "HELLO_ACK",
     "isHost": true,
     "serverNow": 1738614472123
   }
   ```
4. **Server broadcasts state** (every 1s when timer running)
5. **Client sends actions** (timer controls, votes, etc.)

### Message Types

**Client → Server**:
- `HELLO` - Initial connection with identity
- `TIME_PING` - Clock synchronization
- `AGENDA_ADD` - Add agenda item (host only)
- `AGENDA_UPDATE` - Update agenda item (host only)
- `AGENDA_DELETE` - Delete agenda item (host only)
- `AGENDA_SET_ACTIVE` - Set active item (host only)
- `TIMER_START` - Start timer (host only)
- `TIMER_PAUSE` - Pause timer (host only)
- `TIMER_EXTEND` - Extend timer (host only)
- `VOTE_OPEN` - Open vote (host only)
- `VOTE_CAST` - Cast vote (anyone)
- `VOTE_CLOSE` - Close vote (host only)

**Server → Client**:
- `HELLO_ACK` - Connection acknowledged
- `TIME_PONG` - Clock synchronization response
- `STATE` - Full session state update
- `ERROR` - Error message

## Attendance Tracking

**Structure**:
```javascript
attendance: {
  "client_1738614472000_abc123def": {
    clientId: "client_1738614472000_abc123def",
    userId: null,  // For Discord mode compatibility
    displayName: "John Doe",
    joinedAt: 1738614472123
  },
  "client_1738614473000_xyz789ghi": {
    clientId: "client_1738614473000_xyz789ghi",
    userId: null,
    displayName: "Jane Smith",
    joinedAt: 1738614473456
  }
}
```

**Key**: `clientId` (unique per browser)
**Display**: Shows `displayName` in UI
**Tracking**: Persists while WebSocket connected

## Vote Tracking

**Structure**:
```javascript
vote: {
  open: true,
  question: "Should we extend the meeting?",
  options: ["Yes", "No", "Abstain"],
  votesByUserId: {
    "client_1738614472000_abc123def": 0,  // Voted "Yes"
    "client_1738614473000_xyz789ghi": 1   // Voted "No"
  }
}
```

**Key**: `clientId` (prevents duplicate votes)
**Value**: Option index (0, 1, 2, etc.)
**Privacy**: Individual votes not revealed until vote closes

## Discord Activity Mode Compatibility

The system maintains backward compatibility with Discord Activity mode:

**HELLO payload** (Discord mode):
```json
{
  "type": "HELLO",
  "roomId": "ABC123",
  "clientId": "client_1738614472000_abc123def",
  "userId": "319255380074954753",  // Discord user ID
  "user": {
    "id": "319255380074954753",
    "username": "discord_user"
  },
  "displayName": "Discord User"
}
```

**Server handling**:
- Accepts both `clientId` and `userId`
- Uses `userId` for Discord Activity mode host authorization
- Uses `clientId` for attendance tracking
- Stores both in metadata for compatibility

**Host authorization**:
- Standalone mode: Checks `hostKey`
- Discord mode: Checks `userId` against `HOST_USER_IDS`
- Both: Falls back to checking if user is session creator

## Security Considerations

### ClientId
- ✅ Anonymous (no personal information)
- ✅ Local only (not tracked server-side beyond session)
- ✅ Can be reset by clearing localStorage
- ❌ Not cryptographically secure (not intended to be)

### RoomId
- ✅ Short collision probability
- ✅ Safe to share publicly
- ❌ Not secret (anyone can join as viewer)
- ⚠️ No access control (anyone with roomId can view)

### HostKey
- ✅ Cryptographically random
- ✅ Server-side validation only
- ✅ Never in STATE broadcasts
- ✅ High entropy (62^16 combinations)
- ⚠️ Must be kept secret
- ⚠️ No password reset mechanism (by design)

### Threat Model

**Protected against**:
- ✅ Unauthorized host actions (hostKey validation)
- ✅ Vote manipulation (clientId tracking)
- ✅ Message spoofing (WebSocket validation)
- ✅ State tampering (server-side only)

**Not protected against**:
- ❌ Room enumeration (roomId is short)
- ❌ Viewer access (anyone with link can view)
- ❌ HostKey sharing (if host shares link)
- ❌ ClientId forgery (intentional, for ease of use)

## Migration from Old System

### Old System (Query Params)
```
Viewer: https://app.com?room=ABC123
Host:   https://app.com?room=ABC123&hostKey=xY7k...
```

### New System (Path-Based)
```
Viewer: https://app.com/ABC123
Host:   https://app.com/ABC123?hostKey=xY7k...
```

### Backward Compatibility
- ✅ Old URLs still work
- ✅ Server accepts both formats
- ✅ Frontend parses both patterns
- ✅ No migration required

### Benefits of Path-Based Routing
- 📱 Cleaner, more shareable URLs
- 📱 Better mobile app integration
- 📱 Easier to communicate verbally
- 📱 Standard REST conventions
- 📱 Better SEO (if needed in future)

## Best Practices

### For Developers
1. Always use `clientId` for client identification
2. Never expose `hostKey` in logs or error messages
3. Validate `hostKey` server-side only
4. Use path-based routing for new links
5. Maintain backward compatibility with query params

### For Users
1. Save host link in password manager
2. Share only viewer link with team
3. Don't post host link in public channels
4. Use browser's private/incognito mode for multiple identities
5. Clear localStorage to reset clientId if needed

### For Deployment
1. Ensure HTTPS in production (wss:// for WebSocket)
2. Configure CORS properly
3. Set up rate limiting on room creation
4. Monitor for room enumeration attacks
5. Implement cleanup for abandoned rooms

## Troubleshooting

### Issue: ClientId not persisting
**Cause**: localStorage disabled or cleared
**Solution**: Check browser privacy settings, allow localStorage

### Issue: Host controls not working
**Cause**: Missing or incorrect hostKey
**Solution**: Use the host link with hostKey parameter

### Issue: Vote showing as cast when it wasn't
**Cause**: clientId conflict (rare)
**Solution**: Clear localStorage and reload

### Issue: Room not found
**Cause**: Room expired (all clients disconnected)
**Solution**: Create a new room

## Future Enhancements

Possible improvements to consider:

1. **Persistent Rooms**: Store rooms in KV/D1 for longer lifespan
2. **Room Passwords**: Optional password for viewer access
3. **Multi-Host**: Allow multiple hostKeys per room
4. **Host Transfer**: Mechanism to change hostKey
5. **Account Linking**: Optional user accounts for identity
6. **SSO Integration**: Enterprise SSO support
7. **Audit Logs**: Track who did what (requires user accounts)
8. **Room Expiry**: Automatic cleanup after X hours
