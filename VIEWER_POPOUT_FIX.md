# Viewer Link and Popout Fix - Implementation Summary

## Problem
- Viewer links (Share link) returned Vercel 404 NOT_FOUND
- Popout windows returned Vercel 404 NOT_FOUND
- Both features worked locally but failed on Vercel deployment

## Root Cause
**Vercel Framework Preset Auto-Detection Override**

Vercel was auto-detecting this project as a "Vite" framework based on the `client/package.json` dependencies. This caused Vercel to apply Vite-specific routing optimizations that **completely ignored** the `vercel.json` rewrites configuration.

The specific issues:
1. Framework presets in Vercel take precedence over custom `vercel.json` rewrites
2. Vite preset was routing all requests through its own logic instead of our SPA catch-all
3. Paths like `/{roomId}` and `/{roomId}?popout=1` were being treated as missing files, resulting in 404

## Solution

### Critical Fix: Disable Framework Detection
Added `"framework": null` to `vercel.json` to explicitly disable framework auto-detection and force Vercel to use "Other" preset:

```json
{
  "framework": null,
  "rewrites": [
    { "source": "/health", "destination": "/api/health" },
    { "source": "/proxy/health", "destination": "/api/health" },
    { "source": "/proxy/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Why This Works
- `"framework": null` tells Vercel to use the "Other" preset
- "Other" preset respects custom `vercel.json` configuration
- Rewrites are now processed correctly:
  1. Specific routes first (`/health`, `/proxy/*`)
  2. Catch-all `/(.*)" last (routes everything else to index.html)
  3. `/api/*` still handled automatically as serverless functions

### Rewrite Pattern
Using the proven `/(.*)" regex pattern (not `:path*`) as recommended by Vercel community for SPA routing.

## How It Works Now

### Viewer Link Flow
1. User clicks "Share" → gets link `https://app.vercel.app/{roomId}`
2. Vercel receives request for `/{roomId}`
3. No framework preset interfering
4. Rewrite rule `/(.*)" matches
5. Vercel serves `/dist/index.html`
6. React app loads → parses roomId from URL → connects as viewer

### Popout Flow
1. User clicks "Popout" → opens `https://app.vercel.app/{roomId}?popout=1&as=attendee`
2. Vercel receives request
3. Rewrite rule `/(.*)" matches
4. Vercel serves `/dist/index.html`
5. React app loads → detects popout mode → renders `PopoutView`

### API Routes (No Regression)
- `/api/*` handled automatically by Vercel's serverless function system
- Processed BEFORE rewrites, so not affected by catch-all
- `/health` and `/proxy/api/*` explicitly rewritten to `/api/*` before catch-all

## Testing Instructions

### Manual Testing on Vercel

1. **Deploy and Create a Meeting:**
   - Deploy this branch to Vercel
   - Create a new meeting room
   - Note the room ID

2. **Test Viewer Link:**
   ```
   Open browser console (F12)
   Click "Share" button
   Check console for [DEBUG VIEWER LINK] output
   Copy the viewer link
   Open in incognito window
   Verify:
   - Page loads (NO 404 error - critical!)
   - Console shows [DEBUG URL PARSING] and [DEBUG URL PARSED]
   - Meeting view loads as attendee
   - Timer and agenda are visible
   ```

3. **Test Popout:**
   ```
   From the same meeting, click "Popout" button
   Check console for [DEBUG POPOUT] output
   Verify:
   - New popup window opens (NO 404 error - critical!)
   - Compact view renders with current item and timer
   - Timer stays in sync with main window
   ```

4. **Test API Routes (Regression Check):**
   ```
   In meeting, verify:
   - Timer controls work (Start/Pause/Reset)
   - Agenda items can be added/removed
   - Attendance updates in real-time
   
   Check browser Network tab:
   - WebSocket connection established
   - No 404 errors on /api/* endpoints
   ```

### Debug Log Examples

**Expected console output when generating viewer link:**
```
[DEBUG VIEWER LINK] {
  roomId: "abc123",
  baseUrl: "https://your-app.vercel.app",
  windowOrigin: "https://your-app.vercel.app",
  envUrl: "(not set)",
  viewerLink: "https://your-app.vercel.app/abc123"
}
```

**Expected console output when opening viewer link:**
```
[DEBUG URL PARSING] {
  fullUrl: "https://your-app.vercel.app/abc123",
  pathname: "/abc123",
  search: "",
  origin: "https://your-app.vercel.app"
}
[DEBUG URL PARSED] {
  urlRoomId: "abc123",
  urlHostKey: "(none)",
  isPopout: false,
  asMode: null
}
```

**Expected console output when opening popout:**
```
[DEBUG POPOUT] {
  roomId: "abc123",
  hostKey: "***",
  baseUrl: "https://your-app.vercel.app",
  windowOrigin: "https://your-app.vercel.app",
  windowPathname: "/abc123",
  popoutUrl: "https://your-app.vercel.app/abc123?popout=1&as=attendee&hostKey=***"
}

[DEBUG URL PARSING] {
  fullUrl: "https://your-app.vercel.app/abc123?popout=1&as=attendee&hostKey=***",
  pathname: "/abc123",
  search: "?popout=1&as=attendee&hostKey=***",
  origin: "https://your-app.vercel.app"
}
[DEBUG URL PARSED] {
  urlRoomId: "abc123",
  urlHostKey: "***",
  isPopout: true,
  asMode: "attendee"
}
```

## Cleanup After Verification

Once the fix is verified working in production:

1. **Remove debug logging from `client/src/utils/linkHelpers.js`:**
   - Remove console.log from `generateViewerLink()`
   - Remove console.log from `openPopoutWindow()`

2. **Remove debug logging from `client/src/StandaloneApp.jsx`:**
   - Remove both console.log calls from the URL parsing useEffect

3. **Commit and deploy cleanup:**
   ```bash
   git commit -am "Remove debug logging after viewer/popout fix verification"
   git push
   ```

## Technical Details

### Vercel Processing Order
1. **Serverless Functions** - `/api/*` (automatic, from `/api` directory)
2. **Framework Preset** - If detected and not set to null, can override rewrites
3. **Custom Rewrites** - From `vercel.json` (only if no framework override)
4. **Static Files** - From `outputDirectory`
5. **404** - If nothing matches

### Why `"framework": null` is Critical
- Without it: Vercel detects Vite → applies Vite preset → ignores rewrites → 404
- With it: Vercel uses "Other" preset → respects rewrites → serves index.html → works!

### Why `/(.*)" Pattern Instead of `:path*`
- `/(.*)" is the standard regex pattern used in Vercel documentation
- More widely tested and proven to work in community solutions
- `:path*` is newer syntax that might not work consistently in all scenarios

### Vercel Dashboard Alternative
Instead of `"framework": null` in vercel.json, you can also:
1. Go to Vercel Dashboard → Project Settings → General
2. Find "Framework Preset"
3. Change from "Vite" to "Other"
4. Redeploy

However, using `"framework": null` in vercel.json ensures this setting is version-controlled and consistent across all deployments.

## References

- [Vercel Community: Rewrite to index.html ignored for React + Vite SPA](https://community.vercel.com/t/rewrite-to-index-html-ignored-for-react-vite-spa-404-on-routes/8412)
- [Vercel Docs: Project Configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Docs: Framework Detection](https://vercel.com/docs/builds/configure-a-build#framework-detection)
- [Stack Overflow: Vercel + React + Vite returning 404 on page refresh](https://stackoverflow.com/questions/75846073/vercel-reactjs-vite-returning-404-on-page-refresh)
