# Dual-Mode Support Documentation

This document describes the dual-mode support system that allows the application to run in both **Standalone mode** and **Discord Activity mode** without breaking either.

## Table of Contents

1. [Overview](#overview)
2. [Mode Detection](#mode-detection)
3. [Standalone Mode](#standalone-mode)
4. [Discord Activity Mode](#discord-activity-mode)
5. [UI Indicators](#ui-indicators)
6. [Backend Implementation](#backend-implementation)
7. [Testing](#testing)
8. [Migration Guide](#migration-guide)

---

## Overview

The application supports two distinct modes of operation:

### Standalone Mode
- **Purpose:** General-purpose synced meeting app
- **Access:** Any web browser
- **Authentication:** Room + HostKey
- **Transport:** WebSocket (direct to Cloudflare Worker)
- **UI:** StandaloneApp.jsx

### Discord Activity Mode
- **Purpose:** Discord Activities embedded experience
- **Access:** Within Discord client
- **Authentication:** Discord allowlist OR hostKey fallback
- **Transport:** HTTP polling (via Vercel proxy)
- **UI:** App.jsx

---

## Mode Detection

### Detection Logic

Mode is determined by checking the hostname:

```javascript
// client/src/main.jsx
const IN_DISCORD = typeof window !== "undefined" && (
  window.location.hostname === "discordsays.com" ||
  window.location.hostname.endsWith(".discordsays.com")
);

const AppComponent = IN_DISCORD ? App : StandaloneApp;
```

### Hostname Patterns

**Discord Activity Mode:**
- `discordsays.com`
- `*.discordsays.com` (subdomains)

**Standalone Mode:**
- All other hostnames
- `localhost` (development)
- Custom domains (e.g., `meetings.company.com`)

### Security

- **Exact match:** Prevents subdomain spoofing
- **Explicit check:** Clear separation of modes
- **No mixed mode:** Each hostname maps to one mode

---

## Standalone Mode

### Characteristics

**Authentication:**
- Room ID (6 characters)
- HostKey (16 characters, secret)
- ClientId (browser-specific, anonymous)

**No Requirements:**
- ❌ No Discord OAuth
- ❌ No Discord SDK
- ❌ No `/api/token` endpoint
- ✅ Works in any browser

**Host Gating:**
- Host is whoever has the hostKey
- Server validates hostKey on HELLO
- HostKey never broadcasted to clients

### Flow

1. **Create Room:**
   ```
   User → Create Meeting
   Server → Generate roomId + hostKey
   Return: viewer link + host link
   ```

2. **Join as Host:**
   ```
   Open: /ABC123?hostKey=xY7k...
   Client → HELLO { roomId, clientId, hostKey }
   Server → Validates hostKey
   Server → Sets user as host
   ```

3. **Join as Viewer:**
   ```
   Open: /ABC123
   Client → HELLO { roomId, clientId }
   Server → User joins as viewer
   ```

### Code Locations

- **Frontend:** `client/src/StandaloneApp.jsx`
- **Backend:** `worker/src/index.mjs` (session.hostKey mode)
- **Routing:** Path-based (`/:roomId`)

---

## Discord Activity Mode

### Characteristics

**Authentication:**
- Discord User ID (from Discord SDK)
- Discord allowlist (environment variable)
- Optional: HostKey fallback (for testing)

**Requirements:**
- ✅ Discord SDK integration
- ✅ Proxy paths (`/proxy/api`)
- ✅ Discord OAuth (if using allowlist)

**Host Gating:**
- **Primary:** Discord allowlist (HOST_USER_IDS env var)
- **Fallback:** HostKey (for testing without Discord OAuth)

### Flow

1. **Start Meeting (with allowlist):**
   ```
   User (in allowlist) → Start Meeting
   Client → /api/session/start { userId }
   Server → Checks allowlist
   Server → Sets user as host
   ```

2. **Start Meeting (with hostKey fallback):**
   ```
   User (not in allowlist) → Start Meeting
   Client → HELLO { userId, hostKey }
   Server → Checks allowlist (fails)
   Server → Checks hostKey fallback
   Server → Sets user as host
   ```

3. **Join as Viewer:**
   ```
   User → Join Meeting
   Client → HELLO { userId }
   Server → User joins as viewer
   ```

### HostKey Fallback Feature

**Purpose:** Enable testing Discord Activity UI without Discord OAuth setup

**How It Works:**
1. User provides hostKey in HELLO message
2. Backend checks Discord allowlist first
3. If not in allowlist, checks hostKey
4. If hostKey matches, grants host access

**Use Cases:**
- Development/testing
- Demo environments
- Local testing without Discord

**Security:**
- HostKey stored in `session.hostKeyFallback`
- Never exposed in STATE broadcasts
- Server-side validation only

**Code:**
```javascript
// Backend: worker/src/index.mjs
validateHostAccess(clientId, providedHostKey) {
  // Standalone mode
  if (this.session.hostKey) {
    return providedHostKey === this.session.hostKey;
  }
  
  // Discord mode: userId match
  if (this.session.hostUserId === clientId) {
    return true;
  }
  
  // Discord mode: hostKey fallback
  if (providedHostKey && this.session.hostKeyFallback) {
    return providedHostKey === this.session.hostKeyFallback;
  }
  
  return false;
}
```

### Code Locations

- **Frontend:** `client/src/App.jsx`
- **Backend:** `worker/src/index.mjs` (session.hostKey === null mode)
- **Routing:** Session-based (`/api/session/:id`)

---

## UI Indicators

Both modes display a clear indicator showing:
1. Current mode (Standalone or Discord Activity)
2. User role (Host or Viewer)
3. User identity (clientId or Discord userId)

### Standalone Mode Indicator

**Location:** Top-right corner, next to title

**Appearance:**
```
┌────────────────────────────────────┐
│ 🎯 Synced Meeting App  ┌─────────┐│
│                        │ Mode:   ││
│                        │ Standalone││
│                        │         ││
│                        │ Role:   ││
│                        │ 🔑 Host ││
│                        │         ││
│                        │ ID:     ││
│                        │ client_...││
│                        └─────────┘│
└────────────────────────────────────┘
```

**Styling:**
- Background: Light blue (#e7f3ff)
- Border: Blue (#0066cc)
- Compact, unobtrusive

**Code:**
```jsx
// client/src/StandaloneApp.jsx
{mode === "connected" && (
  <div style={{
    padding: "0.5rem 1rem",
    backgroundColor: "#e7f3ff",
    border: "1px solid #0066cc",
    borderRadius: "4px",
    fontSize: "0.85rem",
    textAlign: "right"
  }}>
    <div style={{ fontWeight: "bold", color: "#0066cc" }}>
      Mode: Standalone
    </div>
    <div style={{ color: "#555" }}>
      Role: {isHost ? "🔑 Host" : "👥 Viewer"}
    </div>
    <div style={{ color: "#666", fontSize: "0.75rem", marginTop: "0.25rem" }}>
      ID: {clientId.substring(0, 20)}...
    </div>
  </div>
)}
```

### Discord Activity Mode Indicator

**Location:** Full-width banner below errors

**Appearance:**
```
┌─────────────────────────────────────────────────┐
│ Mode: Discord Activity | Role: 🔑 Host          │
│                           ID: 319255380074954753 │
└─────────────────────────────────────────────────┘
```

**Styling:**
- Background: Light purple (#f0e6ff)
- Border: Purple (#7c3aed)
- Full-width banner

**Code:**
```jsx
// client/src/App.jsx
{status === "joined" && state && (
  <div style={{
    padding: "0.5rem 1rem",
    marginBottom: "1rem",
    backgroundColor: "#f0e6ff",
    border: "1px solid #7c3aed",
    borderRadius: "4px",
    fontSize: "0.85rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}>
    <div>
      <span style={{ fontWeight: "bold", color: "#7c3aed" }}>
        Mode: Discord Activity
      </span>
      {" | "}
      <span style={{ color: "#555" }}>
        Role: {state.hostUserId === userId ? "🔑 Host" : "👥 Viewer"}
      </span>
    </div>
    <div style={{ color: "#666", fontSize: "0.75rem" }}>
      ID: {userId ? (userId.length > 20 ? userId.substring(0, 20) + "..." : userId) : "unknown"}
    </div>
  </div>
)}
```

---

## Backend Implementation

### Session State

```javascript
{
  sessionId: "ABC123",
  hostUserId: "client_123" or "discord_user_id",
  hostKey: "xY7k..." or null,        // Standalone mode only
  hostKeyFallback: "abc123" or null, // Discord mode fallback
  // ... rest of state
}
```

### Mode Determination

**Standalone Mode:**
- `session.hostKey !== null`
- Uses hostKey for validation
- ClientId-based identity

**Discord Activity Mode:**
- `session.hostKey === null`
- Uses allowlist + optional hostKey fallback
- Discord userId-based identity

### Host Validation Logic

```javascript
validateHostAccess(clientId, providedHostKey) {
  if (!this.session) return false;
  
  // Standalone room mode: check hostKey
  if (this.session.hostKey) {
    return providedHostKey === this.session.hostKey;
  }
  
  // Discord Activity mode: check userId/clientId match
  if (this.session.hostUserId === clientId) {
    return true;
  }
  
  // Discord Activity mode fallback: if hostKey provided, check it
  if (providedHostKey && this.session.hostKeyFallback) {
    return providedHostKey === this.session.hostKeyFallback;
  }
  
  return false;
}
```

### HELLO Handler

```javascript
// Extract identifiers
const clientId = msg.clientId;
const discordUserId = msg.userId || msg.user?.id;
const hostKey = msg.hostKey;
const identifier = clientId || discordUserId;

// Check Discord allowlist
const allowed = discordUserId ? isAllowedHost(discordUserId, this.hostConfig) : false;

// Determine hostKeyFallback
const hostKeyFallback = (!hostKey && msg.hostKey) ? msg.hostKey : null;

// Create/get session
const session = this.getOrCreateSession(roomId, hostKey, hostKeyFallback);

// Set host based on mode
if (!session.hostUserId) {
  if (session.hostKey) {
    // Standalone mode: hostKey match
    if (hostKey === session.hostKey) {
      session.hostUserId = identifier;
    }
  } else if (allowed && discordUserId) {
    // Discord mode: allowlist match
    session.hostUserId = discordUserId;
  } else if (!allowed && hostKeyFallback) {
    // Discord mode: hostKey fallback
    if (!session.hostKeyFallback) {
      session.hostKeyFallback = hostKeyFallback;
      session.hostUserId = identifier;
    }
  }
}
```

---

## Testing

### Test Scenarios

#### Standalone Mode

1. **Create Room:**
   - [ ] Opens in browser
   - [ ] Generates room + hostKey
   - [ ] Shows viewer and host links
   - [ ] Mode indicator shows "Standalone"

2. **Join as Host:**
   - [ ] Open host link with hostKey
   - [ ] UI shows "Role: 🔑 Host"
   - [ ] Can control timer, agenda, votes
   - [ ] ClientId displayed

3. **Join as Viewer:**
   - [ ] Open viewer link without hostKey
   - [ ] UI shows "Role: 👥 Viewer"
   - [ ] Cannot control timer/agenda
   - [ ] Can vote when open

#### Discord Activity Mode

1. **With Allowlist:**
   - [ ] User in allowlist starts meeting
   - [ ] UI shows "Discord Activity"
   - [ ] Role shows as Host
   - [ ] Discord userId displayed

2. **With HostKey Fallback:**
   - [ ] User not in allowlist
   - [ ] Provides hostKey
   - [ ] Becomes host via fallback
   - [ ] UI indicates Discord mode
   - [ ] Full host controls

3. **As Viewer:**
   - [ ] User not in allowlist
   - [ ] No hostKey provided
   - [ ] Joins as viewer
   - [ ] Read-only access

### Regression Testing

- [ ] Standalone mode: No changes to existing behavior
- [ ] Discord mode: Allowlist still works
- [ ] Both modes: All features functional
- [ ] No cross-contamination between modes

---

## Migration Guide

### For Existing Standalone Deployments

**No changes required:**
- Existing rooms continue to work
- HostKey authentication unchanged
- No breaking changes

### For Existing Discord Deployments

**No changes required:**
- Discord allowlist still works
- Discord SDK integration unchanged
- HTTP polling unchanged

**Optional enhancement:**
- Can add hostKey fallback for testing
- Doesn't affect production users

### For New Deployments

**Standalone Mode:**
1. Deploy Cloudflare Worker
2. Set `VITE_WORKER_DOMAIN` in Vercel
3. Deploy frontend
4. Access via custom domain

**Discord Activity Mode:**
1. Deploy to `discordsays.com`
2. Set `HOST_USER_IDS` environment variable
3. Configure Discord Activity
4. Access via Discord

---

## Best Practices

### Mode Selection

**Use Standalone Mode when:**
- General-purpose meetings
- Public access needed
- Custom domain desired
- No Discord requirement

**Use Discord Activity Mode when:**
- Embedding in Discord
- Discord user context needed
- Discord community meetings

### Security

**Standalone Mode:**
- Keep hostKey secret
- Don't share host link publicly
- Rotate hostKey if compromised

**Discord Activity Mode:**
- Use allowlist for production
- Use hostKey fallback for testing only
- Restrict allowlist to specific users

### Development

**Local Testing:**
- Standalone: `localhost` → Standalone mode
- Discord: Use hostKey fallback to test UI

**Production:**
- Standalone: Custom domain
- Discord: `discordsays.com` with allowlist

---

## Troubleshooting

### Mode Not Detected

**Problem:** Wrong mode loads

**Solution:**
1. Check hostname exactly
2. Verify `discordsays.com` spelling
3. Check browser console for mode detection
4. Hard refresh (Ctrl+Shift+R)

### HostKey Fallback Not Working

**Problem:** Can't become host with hostKey in Discord mode

**Solution:**
1. Verify not in allowlist (fallback only used if allowlist check fails)
2. Check hostKey matches session.hostKeyFallback
3. Ensure session created with hostKeyFallback
4. Check backend logs for validation

### UI Indicator Not Showing

**Problem:** Mode indicator missing

**Solution:**
1. Check connection status (must be connected/joined)
2. Verify React component rendering
3. Check browser console for errors
4. Refresh page

---

## Summary

The dual-mode support enables the application to serve two distinct use cases:

1. **Standalone:** General-purpose synced meetings with room + hostKey
2. **Discord Activity:** Embedded Discord experience with allowlist + optional hostKey fallback

Both modes coexist without interference, providing flexibility for different deployment scenarios while maintaining security and user experience.
