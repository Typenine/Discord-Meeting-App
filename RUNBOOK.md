# Operational Runbook

Quick reference for deploying and operating the Discord Meeting App.

## Deployment

### Server Setup

```bash
cd server
npm install
```

**Environment Variables** (create `.env`):

```bash
# Required for Discord OAuth (optional for basic operation)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_secret
DISCORD_REDIRECT_URI=http://localhost:8787/callback

# Host Authorization (optional - adds extra safety layer)
# If not set: anyone who starts a meeting becomes the host
# If set to *: explicitly allow all users
# If set to specific IDs: only those users can host meetings
# HOST_USER_IDS=*                    # Allow all (explicit)
# HOST_USER_IDS=user123,user456      # Only specific users can host

# Optional
PORT=8787                          # Default: 8787
```

**Start Server**:
```bash
npm start
# Server listens on http://localhost:8787
```

### Client Setup

```bash
cd client
npm install
npm run build
```

**Environment Variables** (optional, create `.env`):
```bash
VITE_API_BASE=http://localhost:8787/api
```

**Preview Build**:
```bash
npm run preview
# Client at http://localhost:5173
```

### Production Deployment

1. Build client: `cd client && npm run build`
2. Serve `client/dist` via static hosting
3. Run server: `cd server && npm start`
4. Configure reverse proxy (nginx/Apache) if needed
5. Set proper `HOST_USER_IDS` for production

## Configuration Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `HOST_USER_IDS` | _(not set)_ | Optional: Comma-separated Discord user IDs or `*` for all. Acts as allowlist when set. |
| `VITE_API_BASE` | `http://127.0.0.1:8787/api` | Client API endpoint |

**If not set**:
- `HOST_USER_IDS` → Anyone who starts a meeting becomes the host (default behavior)
- `DISCORD_*` → OAuth disabled, basic meeting features work

**If set**:
- `HOST_USER_IDS=*` → Explicitly allow all users to host
- `HOST_USER_IDS=user1,user2` → Only listed users can host (allowlist for extra security)

## Key Features

### 1. Meeting Flow Validation
- **Timer**: Decimal minutes (e.g., `2.5` min), validation blocks negative/excessive extensions
- **Agenda**: Status tracking (pending → active → completed), time spent calculation
- **Votes**: Linked to agenda items, percentage calculations
- **End Meeting**: Validates incomplete work, auto-completes active items

### 2. Discord Integration
- **Channel Context**: Store/display `channelId` and `guildId`
- **Auto-Rejoin**: localStorage tracks last session, prompts on page reload
- **Dual API Mount**: Works inside Discord (`/proxy/api`) and outside (`/api`)

### 3. Enhanced Minutes
- **Format**: Markdown with proper structure (headers, lists, emphasis)
- **Action Items**: Auto-extracted from notes using 6 patterns:
  - `TODO: task` → medium priority
  - `ACTION: task` → high priority
  - `- [ ] task` → checkbox format
  - `@username task` → assigned to user
  - `HIGH: task` → high priority
  - `CRITICAL: task` → high priority
- **Metadata**: Channel, duration, participants, vote results, attendance

### 4. Sync Method
- **HTTP Polling**: 1-second interval for state updates
- **No WebSockets**: Uses efficient polling with `sinceRevision` parameter
- **Revision-Based**: Only sends updates when state changes

## API Endpoints

### Session Management
```bash
POST /api/session/start              # Create meeting
POST /api/session/:id/join           # Join meeting
GET  /api/session/:id/state          # Get current state (polling)
POST /api/session/:id/end            # End meeting, generate minutes
```

### Agenda
```bash
POST /api/session/:id/agenda         # Add item
PUT  /api/session/:id/agenda/:itemId # Update item
DELETE /api/session/:id/agenda/:itemId # Delete item (not if active)
POST /api/session/:id/agenda/active  # Set active item
```

### Timer
```bash
POST /api/session/:id/timer/start    # Start (accepts durationMinutes)
POST /api/session/:id/timer/pause    # Pause
POST /api/session/:id/timer/extend   # Extend (validates)
```

### Voting
```bash
POST /api/session/:id/vote/open      # Open vote
POST /api/session/:id/vote/cast      # Cast vote
POST /api/session/:id/vote/close     # Close vote
```

### Health
```bash
GET /health                          # System diagnostics
```

## Monitoring

### Health Check
```bash
curl http://localhost:8787/health
```

Key indicators:
- `ok`: Overall health
- `store.persistence.consecutiveFailures`: Should be 0
- `store.sessions.active`: Number of active meetings
- `warnings`: Array of issues

### Logs
Server logs to console by default. Key patterns:
- `[store] Session created:` - New meeting started
- `[store] Meeting ended:` - Meeting completed with stats
- `[Authorization]` - Failed authorization attempts
- `[store] Failed to save sessions` - Persistence issues

### Data Location
- Sessions: `server/data/sessions.json`
- Auto-created if missing
- Requires write permissions

## Troubleshooting

### Issue: Users can't create meetings
**Solution**: 
1. If `HOST_USER_IDS` is not set, all users should be able to create meetings by default
2. If `HOST_USER_IDS` is set and users can't create meetings, check that their user IDs are in the allowlist
3. For testing, use `HOST_USER_IDS=*` to explicitly allow all users
4. For production security, set specific Discord user IDs: `HOST_USER_IDS=123456,789012`

### Issue: Persistence failures
**Solution**:
1. Check data directory: `ls -la server/data/`
2. Verify write permissions: `touch server/data/test && rm server/data/test`
3. Check disk space: `df -h`

### Issue: Timer not working
**Solution**:
1. Verify client is polling: Check browser network tab
2. Check timer state: `GET /api/session/:id/state`
3. Ensure no CORS issues (server logs will show)

### Issue: Minutes not generating
**Solution**:
1. Verify meeting has agenda items
2. Check end meeting endpoint returns minutes
3. Review server logs for errors in `minutesGenerator.js`

### Issue: Auto-rejoin not working
**Solution**:
1. Check localStorage is enabled in browser
2. Verify session still active on server
3. Clear localStorage: `localStorage.clear()` in browser console

## Security Notes

- **Host Authorization**: Two-factor validation (session owner + global config)
- **No Credentials in Client**: All auth server-side
- **CORS**: Configure for production domains
- **Rate Limiting**: Not implemented (add nginx/CloudFlare if needed)

## Performance Tips

1. **Sessions Cleanup**: Manually delete old sessions from `server/data/sessions.json`
2. **Polling Interval**: 1 second is optimal (don't reduce below 500ms)
3. **Minutes Generation**: Cached until next meeting starts
4. **Data Directory**: Use SSD for better JSON write performance

## Backup & Recovery

### Backup Sessions
```bash
cp server/data/sessions.json server/data/sessions.backup.$(date +%Y%m%d).json
```

### Restore Sessions
```bash
cp server/data/sessions.backup.20260203.json server/data/sessions.json
# Restart server
```

## Scaling Considerations

Current architecture supports:
- **Concurrent Meetings**: ~100 per server (HTTP polling load)
- **Participants per Meeting**: ~50 (JSON payload size)
- **Polling Load**: 100 meetings × 50 users × 1 req/sec = 5000 req/sec

For higher scale:
1. Add Redis for session storage
2. Implement connection pooling
3. Use load balancer across multiple servers
4. Consider WebSocket upgrade (requires architecture change)

## Rollback Procedure

1. **Stop server**: `Ctrl+C` or `systemctl stop discord-meeting-app`
2. **Restore previous version**: `git checkout <previous-tag>`
3. **Reinstall dependencies**: `cd server && npm install`
4. **Restore data**: `cp server/data/sessions.backup.json server/data/sessions.json`
5. **Start server**: `npm start`
6. **Rebuild client**: `cd client && npm run build`

## Support Contacts

- GitHub Issues: https://github.com/Typenine/Discord-Meeting-App/issues
- Documentation: See repository README.md

## Version Info

- **Last Updated**: 2026-02-03
- **Node Version**: v20.20.0+
- **Tested Browsers**: Chrome 96+, Firefox 95+, Safari 15+
