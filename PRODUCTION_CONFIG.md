# Production Configuration Guide

## Overview

This guide explains how to properly configure the Discord Meeting App for production deployment on Vercel, ensuring it connects to your Cloudflare Worker without trying to reach localhost or 127.0.0.1.

---

## Problem Fixed

**Before:** Production deployments would fall back to:
- `http://127.0.0.1:8787/api` (in old versions)
- `/api` (attempting same-origin API)
- Resulting in failed API calls and broken functionality

**After:** Production deployments require explicit configuration and fail fast with clear error messages if misconfigured.

---

## Required Environment Variables

### For Vercel Deployment

Set these in your Vercel project settings (Settings → Environment Variables):

#### Option 1: VITE_WORKER_DOMAIN (Recommended)

```bash
VITE_WORKER_DOMAIN=your-worker.workers.dev
```

**Usage:**
- Automatically constructs API URL: `https://${VITE_WORKER_DOMAIN}/api`
- Used for WebSocket: `wss://${VITE_WORKER_DOMAIN}/api/ws`
- Single variable for both HTTP and WebSocket
- Consistent configuration

**Example:**
```bash
VITE_WORKER_DOMAIN=discord-agenda-worker.myusername.workers.dev
```

#### Option 2: VITE_API_BASE (Alternative)

```bash
VITE_API_BASE=https://your-worker.workers.dev/api
```

**Usage:**
- Explicit full API URL
- Useful if API is on a different domain
- Overrides VITE_WORKER_DOMAIN for HTTP API
- WebSocket still uses VITE_WORKER_DOMAIN

**Example:**
```bash
VITE_API_BASE=https://custom-domain.com/api
VITE_WORKER_DOMAIN=custom-domain.com
```

**Note:** You still need VITE_WORKER_DOMAIN for WebSocket connections.

---

## Configuration by Mode

### Discord Activity Mode

**Hostname:** `discordsays.com` or `*.discordsays.com`

**API URL:** `/proxy/api` (automatically configured)

**No environment variables needed** - uses Discord's proxy

### Standalone Mode (WebSocket)

**Hostname:** Any domain except discordsays.com

**Requirements:**
- `VITE_WORKER_DOMAIN` (required)
- `VITE_API_BASE` (optional override)

**WebSocket URL:** `wss://${VITE_WORKER_DOMAIN}/api/ws`

**HTTP API URL:** 
- `${VITE_API_BASE}` (if set)
- OR `https://${VITE_WORKER_DOMAIN}/api` (default)

---

## Configuration Priority

The app determines the API base URL in this order:

1. **Discord Activity Mode Check**
   - If hostname ends with `discordsays.com`
   - Uses `/proxy/api`
   - Ignores all other configuration

2. **VITE_API_BASE**
   - If explicitly set
   - Uses this value exactly
   - Overrides VITE_WORKER_DOMAIN

3. **VITE_WORKER_DOMAIN**
   - Constructs `https://${domain}/api`
   - Fallback if VITE_API_BASE not set

4. **Development Mode**
   - If `import.meta.env.DEV === true`
   - Uses `http://localhost:8787/api`
   - No configuration needed

5. **Production + No Config**
   - Returns `null`
   - Logs clear error message
   - API calls will fail immediately

---

## Local Development

### No Configuration Needed

For local development, the app automatically uses:
- HTTP API: `http://localhost:8787/api`
- WebSocket: `ws://localhost:8787/api/ws`

### Steps

1. Start Cloudflare Worker:
   ```bash
   cd worker
   npm run dev
   # Listens on http://localhost:8787
   ```

2. Start Vite dev server:
   ```bash
   cd client
   npm run dev
   # Automatically connects to localhost:8787
   ```

### Testing Production Config Locally

To test production configuration locally:

```bash
cd client
echo "VITE_WORKER_DOMAIN=my-worker.workers.dev" > .env.local
npm run build
npm run preview
```

This builds in production mode and uses your Worker domain.

---

## Deployment Steps

### 1. Deploy Cloudflare Worker

```bash
cd worker
npm install
wrangler deploy
```

**Note the Worker URL** (e.g., `https://discord-agenda-worker.myusername.workers.dev`)

### 2. Configure Vercel Environment Variables

In Vercel Dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add variable:
   - **Name:** `VITE_WORKER_DOMAIN`
   - **Value:** `discord-agenda-worker.myusername.workers.dev` (without https://)
   - **Environments:** Production, Preview (optional), Development (optional)

### 3. Deploy to Vercel

```bash
git push origin main
# Vercel auto-deploys
```

Or manually:
```bash
cd client
vercel --prod
```

### 4. Verify Configuration

1. Open your Vercel deployment
2. Open browser DevTools → Console
3. Should see no errors about missing configuration
4. Should see no requests to 127.0.0.1 or localhost

---

## Error Messages

### "Production requires VITE_API_BASE or VITE_WORKER_DOMAIN"

**Cause:** Deployed to production without setting environment variables

**Solution:**
1. Go to Vercel project settings
2. Add `VITE_WORKER_DOMAIN` environment variable
3. Redeploy

### "VITE_WORKER_DOMAIN not configured"

**Cause:** WebSocket trying to connect but variable not set

**Solution:** Same as above

### Network requests fail to "/api"

**Cause:** Old deployment without environment variables

**Solution:**
1. Set `VITE_WORKER_DOMAIN` in Vercel
2. Trigger new deployment

---

## Troubleshooting

### Check Current Configuration

Open browser console and run:
```javascript
// Check if in Discord mode
console.log("IN_DISCORD:", window.location.hostname.endsWith("discordsays.com"));

// Check environment (production vs development)
console.log("PRODUCTION:", import.meta.env.PROD);
console.log("DEVELOPMENT:", import.meta.env.DEV);
```

### Verify Environment Variables

In Vercel:
1. Go to Settings → Environment Variables
2. Confirm `VITE_WORKER_DOMAIN` is set
3. Confirm it's applied to Production environment
4. Check recent deployments to see if variable was included

### Check Network Requests

1. Open browser DevTools → Network tab
2. Reload the page
3. Filter by "Fetch/XHR"
4. Should see requests to your Worker domain
5. Should NOT see requests to:
   - `127.0.0.1`
   - `localhost`
   - `/api` on Vercel domain (unless in Discord mode)

### Common Issues

**Issue:** Requests to `https://your-app.vercel.app/api`
**Cause:** Missing VITE_WORKER_DOMAIN
**Solution:** Add environment variable and redeploy

**Issue:** CORS errors
**Cause:** Worker domain doesn't allow your Vercel domain
**Solution:** Configure CORS in Worker (already done in this repo)

**Issue:** WebSocket connection fails
**Cause:** VITE_WORKER_DOMAIN not set or incorrect
**Solution:** Verify domain is correct (no https:// prefix)

---

## Environment Variable Examples

### Single Worker Domain

```bash
# Vercel Environment Variables
VITE_WORKER_DOMAIN=discord-agenda-worker.myusername.workers.dev
```

**Result:**
- HTTP API: `https://discord-agenda-worker.myusername.workers.dev/api`
- WebSocket: `wss://discord-agenda-worker.myusername.workers.dev/api/ws`

### Custom API Domain

```bash
# Vercel Environment Variables
VITE_WORKER_DOMAIN=ws.example.com
VITE_API_BASE=https://api.example.com/v1
```

**Result:**
- HTTP API: `https://api.example.com/v1` (from VITE_API_BASE)
- WebSocket: `wss://ws.example.com/api/ws` (from VITE_WORKER_DOMAIN)

### Multiple Environments

**Production:**
```bash
VITE_WORKER_DOMAIN=discord-agenda-prod.myusername.workers.dev
```

**Preview:**
```bash
VITE_WORKER_DOMAIN=discord-agenda-preview.myusername.workers.dev
```

**Development:**
- No variables needed (uses localhost)

---

## Security Considerations

### Environment Variables

- ✅ VITE_WORKER_DOMAIN is safe to expose (it's in client-side code)
- ✅ VITE_API_BASE is safe to expose (it's in client-side code)
- ⚠️ Never put secrets in VITE_* variables (they're public)
- ⚠️ Worker domain should have CORS configured

### CORS Configuration

Your Cloudflare Worker should allow requests from your Vercel domain:

```javascript
// In worker/src/index.mjs
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Or specific domain
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
```

---

## Best Practices

### Development
- ✅ Use local Worker (no env vars)
- ✅ Test both modes (Discord and Standalone)
- ✅ Verify WebSocket connections work

### Staging/Preview
- ✅ Use dedicated preview Worker
- ✅ Set VITE_WORKER_DOMAIN for preview deployments
- ✅ Test before promoting to production

### Production
- ✅ Use production Worker
- ✅ Set VITE_WORKER_DOMAIN in Vercel
- ✅ Monitor for 127.0.0.1 requests (should be zero)
- ✅ Test both modes after deployment

---

## Migration from Old Versions

### If you had 127.0.0.1 fallback

**Before:** App fell back to `http://127.0.0.1:8787/api` in production

**After:** App requires explicit configuration

**Steps:**
1. Deploy Cloudflare Worker
2. Note the Worker URL
3. Set VITE_WORKER_DOMAIN in Vercel
4. Redeploy frontend
5. Verify no 127.0.0.1 requests

### If you had /api fallback

**Before:** App fell back to `/api` (same-origin)

**After:** App requires explicit configuration

**Steps:** Same as above

---

## Summary

### Required Configuration

| Environment | Discord Mode | Standalone Mode |
|-------------|--------------|-----------------|
| Local Dev | None | None |
| Production | None | VITE_WORKER_DOMAIN |
| Preview | None | VITE_WORKER_DOMAIN |

### Quick Setup

1. Deploy Worker: `wrangler deploy`
2. Set Vercel env var: `VITE_WORKER_DOMAIN=your-worker.workers.dev`
3. Deploy frontend: `git push`
4. Verify: No 127.0.0.1 requests

---

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

**Last Updated:** 2026-02-04
**Version:** 1.0
