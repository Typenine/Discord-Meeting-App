# Control Room Feature Enhancements

This document describes the enhancements made to the Control Room feature to improve host enforcement, persistence, self-checks, and UI clarity.

## Overview

The Control Room is the host's interface for managing meetings, including agenda items, timers, and voting. These enhancements ensure robust operation, clear feedback, and reliable state management.

## Features

### 1. Host Enforcement

**Implementation:**
- Integrated global host authorization with session-level host checks
- All privileged operations validate both session ownership AND global authorization
- Unauthorized users receive clear 403 responses with actionable messages

**Configuration:**
- Set `HOST_USER_IDS` environment variable to comma-separated list of authorized Discord user IDs
- Use `HOST_USER_IDS=*` to allow all users (development/testing only)
- Empty or missing `HOST_USER_IDS` denies all host access

**Protected Operations:**
- Create new meetings
- Add/update/delete agenda items
- Start/pause/extend timer
- Open/close votes
- End meetings and generate minutes

**Validation Logic:**
```javascript
// A user must be BOTH:
// 1. The session host (hostUserId matches)
// 2. Globally authorized (in HOST_USER_IDS config)
function validateHostAccess(session, userId) {
  return isSessionHost(userId) && isGloballyAuthorized(userId);
}
```

### 2. Persistence

**Implementation:**
- All state changes automatically persisted to JSON file storage
- Atomic writes ensure data integrity
- Session state survives server restarts/crashes

**Health Tracking:**
- Monitors save success/failure counts
- Tracks consecutive failures
- Logs timestamps of last save operations
- Validates data directory writability

**Data Location:**
- Default: `server/data/sessions.json`
- Created automatically if missing
- Backed by in-memory cache for fast reads

**Diagnostic Information:**
```javascript
{
  lastSaveSuccess: timestamp,
  lastSaveFailure: timestamp,
  consecutiveFailures: number,
  totalSaves: number,
  totalFailures: number,
  dataDirWritable: boolean
}
```

### 3. Self-Checks & Diagnostics

**Health Endpoint:** `GET /health`

Returns comprehensive system status:

```json
{
  "ok": true,
  "timestamp": "2026-02-03T17:00:00.000Z",
  "config": {
    "redirectUri": "...",
    "clientId": "...",
    "secretConfigured": true,
    "secretLength": 18
  },
  "hostAuth": {
    "allowAll": false,
    "hostIdsCount": 2,
    "configured": true
  },
  "store": {
    "sessions": {
      "total": 5,
      "active": 3,
      "ended": 2
    },
    "persistence": {
      "totalSaves": 47,
      "totalFailures": 0,
      "consecutiveFailures": 0,
      "dataDirWritable": true
    }
  },
  "warnings": []
}
```

**Warning Detection:**
- Missing Discord client credentials
- Persistence failures (3+ consecutive)
- Non-writable data directory
- Configuration issues

**API Request Logging:**
All API operations logged with:
- HTTP method and path
- Response status code
- Request duration
- User ID
- Error details (if failed)

**Authorization Logging:**
Failed authorization attempts logged with:
- Session ID
- User ID attempting operation
- Operation name
- Timestamp

### 4. UI Clarity & Feedback

**Visual Indicators:**

1. **Health Status Banner** (Top of page)
   - Shows system warnings if any
   - Dismissible
   - Yellow background for warnings

2. **Error Banner** (Below health)
   - Red background for errors
   - Authorization errors highlighted with lock icon
   - Clear, actionable messages
   - Dismissible

3. **Host Status Badge** (In meeting)
   - Green "✓ HOST ACCESS" badge for authorized hosts
   - Gray "ATTENDEE" badge for non-hosts
   - Prominently displayed in status bar

4. **System Diagnostics Panel** (Hosts only)
   - Collapsible `<details>` element
   - Shows configuration status
   - Displays persistence health
   - Session statistics
   - Real-time system status indicator (✅/⚠️)

**Error Messages:**

All error responses include:
- Error code (`error` field)
- Human-readable message (`message` field)
- Context-specific guidance

Examples:
```json
// Unauthorized host
{
  "error": "unauthorized_host",
  "message": "You are not authorized to create meetings. Contact an administrator."
}

// Host access required
{
  "error": "forbidden",
  "message": "Host access required"
}
```

**Health Monitoring:**
- Initial health check on page load
- Periodic re-checks every 30 seconds during meetings
- Automatic warning display if health degrades
- Console logging for debugging

## Usage

### For Developers

**Server Setup:**
1. Configure environment variables in `server/.env`:
   ```
   HOST_USER_IDS=user123,user456
   DISCORD_CLIENT_ID=...
   DISCORD_CLIENT_SECRET=...
   DISCORD_REDIRECT_URI=...
   ```

2. Start the server:
   ```bash
   cd server
   npm install
   npm start
   ```

3. Monitor logs for diagnostic information

**Client Setup:**
1. Build the client:
   ```bash
   cd client
   npm install
   npm run build
   ```

2. Set `VITE_API_BASE` if needed for custom API endpoint

### For Hosts

**Starting a Meeting:**
1. Enter your name
2. Click "Start new meeting"
3. If unauthorized, you'll see a clear error message
4. If authorized, meeting starts and you get the HOST ACCESS badge

**Viewing Diagnostics:**
1. Click "📊 System Diagnostics" panel (hosts only)
2. Check configuration status
3. Monitor persistence health
4. View session statistics

**Handling Errors:**
- Read error messages carefully
- Check diagnostics panel for system issues
- Contact administrator if authorization issues persist

### For Administrators

**Authorizing Hosts:**
1. Add Discord user IDs to `HOST_USER_IDS` in server environment
2. Restart server to apply changes
3. User IDs can be found in Discord developer mode

**Monitoring System Health:**
- Check `/health` endpoint regularly
- Monitor server logs for authorization attempts
- Watch for persistence failures
- Verify data directory permissions

**Troubleshooting:**

| Issue | Solution |
|-------|----------|
| Users can't create meetings | Add their Discord ID to `HOST_USER_IDS` |
| Persistence failures | Check data directory permissions |
| Config warnings | Set missing environment variables |
| Health check fails | Verify server configuration |

## Technical Details

### Architecture

```
┌─────────────┐
│   Client    │
│   (React)   │
└──────┬──────┘
       │ HTTP Polling (1s interval)
       │ Health Check (30s interval)
       ▼
┌─────────────┐
│   Express   │
│   Server    │
├─────────────┤
│  API Router │
│  + Logging  │
│  + CORS     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Store     │
│  (store.js) │
├─────────────┤
│ • Sessions  │
│ • Host Auth │
│ • Health    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   File      │
│  Persistence│
│ sessions.json│
└─────────────┘
```

### Key Files

- `server/src/index.js` - Express server, API routes, CORS, logging
- `server/src/store.js` - Session management, persistence, host validation
- `server/src/meeting.js` - Meeting state logic (legacy, kept for reference)
- `client/src/App.jsx` - React UI with error handling and diagnostics

### Security Considerations

1. **Host Authorization**
   - Two-factor validation (session + global)
   - Logged authorization failures for audit
   - No privilege escalation possible

2. **Data Protection**
   - Sessions stored locally only
   - No sensitive data in client localStorage
   - CORS configured for development (tighten in production)

3. **Error Handling**
   - Generic errors to prevent information disclosure
   - Detailed logging server-side only
   - User-friendly messages client-side

## Testing

### Manual Tests

1. **Host Enforcement**
   - ✅ Authorized user can create meetings
   - ✅ Unauthorized user receives 403 error
   - ✅ Session host who loses global auth is blocked
   - ✅ Non-hosts can't perform privileged operations

2. **Persistence**
   - ✅ State survives server restart
   - ✅ Agenda items persist
   - ✅ Active meeting status maintained
   - ✅ Failure handling works correctly

3. **Self-Checks**
   - ✅ Health endpoint returns diagnostics
   - ✅ Warnings appear for config issues
   - ✅ Persistence metrics update correctly
   - ✅ System status reflects actual state

4. **UI Clarity**
   - ✅ Error messages display clearly
   - ✅ Host badge shows correctly
   - ✅ Diagnostics panel accessible to hosts
   - ✅ Health warnings visible

### Automated Tests

(No existing test infrastructure, manual testing performed)

## Future Enhancements

Potential improvements:
- Add automated backup/restore functionality
- Implement session expiration/cleanup
- Add metrics collection for analysis
- Create admin dashboard for monitoring
- Add email notifications for critical issues
- Implement rate limiting for API operations
- Add session replay for debugging
