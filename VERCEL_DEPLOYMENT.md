# Vercel Deployment Guide

This repository is configured for automatic deployment to Vercel with both frontend and backend support.

## Architecture

- **Frontend**: Vite-built React app (client/dist) served as static files
- **Backend**: Vercel Serverless Functions handle all /api/* requests
- **API Routes**: 
  - `/api/*` → Serverless function in `/api/[...path].js`
  - `/health` → Rewritten to `/api/health`
  - `/proxy/api/*` → Rewritten to `/api/*` (for Discord Activity)

## Deployment

### Automatic Deployment
Push to the main branch or create a pull request. Vercel will automatically:
1. Install dependencies from root package.json
2. Build the client with `cd client && npm install && npm run build`
3. Deploy client/dist as static files
4. Deploy /api directory as serverless functions

### Environment Variables
Configure these in Vercel Dashboard → Settings → Environment Variables:

**Required for OAuth (optional for basic meetings)**:
- `DISCORD_CLIENT_ID` - Your Discord application client ID
- `DISCORD_CLIENT_SECRET` - Your Discord application client secret  
- `DISCORD_REDIRECT_URI` - OAuth redirect URI (e.g., https://your-app.vercel.app/callback)

**Optional for host authorization**:
- `HOST_USER_IDS` - Comma-separated Discord user IDs or "*" to allow all users

### Manual Deployment
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Verification

After deployment, verify:

1. **Health endpoint**: `curl https://your-app.vercel.app/api/health`
   - Should return JSON with `{"ok": true/false, ...}`
   - NOT a 404 error

2. **Create meeting**: 
   - Open https://your-app.vercel.app
   - Enter username and click "Start new meeting"
   - Check browser DevTools Network tab
   - Should see POST to `/api/session/start` (same origin)
   - Should NOT see any requests to `127.0.0.1`

3. **Discord Activity**:
   - Routes `/proxy/api/*` should work (rewritten to `/api/*`)

## Local Development

The server can still be run locally for development:

```bash
# Start backend server
cd server
npm install
npm start
# Listens on http://localhost:8787

# In another terminal, start frontend dev server  
cd client
npm install  
npm run dev
# Listens on http://localhost:5173

# Set VITE_API_BASE to point to local server
cd client
echo "VITE_API_BASE=http://localhost:8787/api" > .env.local
npm run dev
```

## Troubleshooting

### 404 on /api/health
- Ensure `/api/[...path].js` exists
- Check Vercel build logs for errors
- Verify root package.json has express and dotenv dependencies

### Meeting creation fails
- Check environment variables are set in Vercel
- Verify browser network requests go to same origin
- Check Vercel function logs for errors

### Discord Activity not working
- Verify `/proxy/api/*` rewrite in vercel.json
- Test that `/proxy/api/health` returns same as `/api/health`

## Files Changed

- `vercel.json` - Build and rewrite configuration
- `package.json` (root) - Serverless function dependencies
- `api/[...path].js` - Catch-all serverless function
- `server/src/app.js` - Express app factory (reusable)
- `server/src/index.js` - Standalone server (uses app factory)
- `client/src/App.jsx` - Fixed API base URL (no 127.0.0.1 fallback)
