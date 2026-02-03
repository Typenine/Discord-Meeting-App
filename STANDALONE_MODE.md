# Standalone Synced Meeting App

## Overview

The Discord Meeting App now supports **two modes**:

1. **Standalone Mode** (NEW): WebSocket-based, room + hostKey authentication
2. **Discord Activity Mode** (PRESERVED): HTTP polling-based, Discord OAuth

The app automatically detects which mode to use based on the hostname.

## Architecture

### Standalone Mode

```
┌─────────────────────────────────────────┐
│  Frontend (Vercel)                      │
│  - Vite + React static files            │
│  - StandaloneApp.jsx                    │
└─────────────────────────────────────────┘
               │
               ▼ WebSocket (wss://)
┌─────────────────────────────────────────┐
│  Cloudflare Worker (separate domain)    │
│  - Room creation API (/api/room/create) │
│  - WebSocket handler (/api/ws)          │
│  - Token exchange (/api/token)          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Durable Object (MeetingRoom)           │
│  - Session state (agenda, timer, votes) │
│  - Attendance tracking                  │
│  - Timer loop (broadcasts every 1s)     │
│  - Host validation (hostKey or userId)  │
└─────────────────────────────────────────┘
```

**Important**: The frontend (Vercel) and backend (Cloudflare Worker) run on separate domains because Vercel doesn't support WebSocket proxying.

## Deployment

### 1. Deploy Cloudflare Worker

```bash
cd worker
npm install
wrangler deploy
```

This will give you a worker URL like: `https://discord-agenda-activity-worker.yourusername.workers.dev`

### 2. Configure Frontend Environment

Create `client/.env.production`:

```bash
VITE_WORKER_DOMAIN=discord-agenda-activity-worker.yourusername.workers.dev
```

### 3. Deploy Frontend to Vercel

```bash
cd client
npm install
npm run build
```

Push to GitHub, and Vercel will automatically deploy.

### Environment Variables

**Cloudflare Worker** (via Wrangler or Dashboard):
- `DISCORD_CLIENT_ID` - Discord OAuth (optional, for Activity mode)
- `DISCORD_CLIENT_SECRET` - Discord OAuth (optional)
- `DISCORD_REDIRECT_URI` - Discord OAuth (optional)
- `HOST_USER_IDS` - Comma-separated Discord user IDs allowed to host (optional)

**Vercel** (Project Settings > Environment Variables):
- `VITE_WORKER_DOMAIN` - Your Cloudflare Worker domain (required for production)

Example:
```
VITE_WORKER_DOMAIN=discord-agenda-activity-worker.yourusername.workers.dev
```

## Security

### ✅ No Discord OAuth Required
- Standalone mode works without Discord authentication
- Anonymous users can create and join rooms
- Host authentication via secure hostKey

### ✅ Host Controls Gated
- All host actions validated server-side
- HostKey never sent to non-host clients
- WebSocket messages from non-hosts rejected

### ✅ No Credentials in Client
- HostKey only stored in client localStorage (optional)
- Server validates every host action
- No API keys or secrets in client code

## Discord Activity Mode (Preserved)

The original Discord Activity mode still works:

- Detected by hostname ending in `.discordsays.com`
- Uses HTTP polling instead of WebSocket
- Uses Discord OAuth for authentication
- Uses Discord user IDs for host authorization

## Development

### Local Development

1. Start Cloudflare Worker:
```bash
cd worker
wrangler dev --port 8787
```

2. Start Vite dev server:
```bash
cd client
npm run dev
```

3. Open http://localhost:5173

### WebSocket Connection

In development, the client connects to:
- `ws://localhost:8787/api/ws` (local worker)

In production:
- `wss://your-domain.com/api/ws` (deployed worker)

## Troubleshooting

### Timer not syncing
- Check browser console for TIME_PONG responses
- Verify WebSocket connection is active
- Check serverTimeOffset value

### Host controls not working
- Verify hostKey in URL matches room's hostKey
- Check WebSocket connection is active
- Look for ERROR messages in browser console

### Room not found
- Verify room ID is correct (case-sensitive)
- Check Cloudflare Worker logs
- Ensure Durable Object is properly configured

## Future Enhancements

- [ ] Persistent storage (save meetings to KV or D1)
- [ ] Meeting minutes export
- [ ] Screen sharing integration
- [ ] Breakout rooms
- [ ] Recording capability
- [ ] Calendar integration
