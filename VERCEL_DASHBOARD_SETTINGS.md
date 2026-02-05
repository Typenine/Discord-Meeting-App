# CRITICAL: Vercel Dashboard Settings to Check

## The Problem
If viewer links and popout windows are still returning 404 errors despite the vercel.json fixes, the issue is likely in your **Vercel Project Settings** in the dashboard, which can override vercel.json.

## Required Dashboard Settings

### 1. Framework Preset
**Location:** Vercel Dashboard → Your Project → Settings → General → Framework Preset

**Required Setting:** Set to **"Other"** (NOT "Vite" or auto-detected)

**Why:** Even with `"framework": null` in vercel.json, dashboard settings can override it. Setting to "Other" ensures Vercel respects your custom rewrites.

**How to Fix:**
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Settings" tab
4. Scroll to "Framework Preset"
5. Change from "Vite" (or whatever it shows) to **"Other"**
6. Click "Save"
7. Redeploy (see below)

### 2. Root Directory
**Location:** Vercel Dashboard → Your Project → Settings → General → Root Directory

**Required Setting:** Leave BLANK or set to `.` (root)

**Why:** Your vercel.json and build command are at the repository root, not in a subdirectory.

**How to Check:**
1. In Settings → General
2. Find "Root Directory"
3. Should be blank OR `.` OR `/`
4. If it says `client` or anything else, change it to blank
5. Save and redeploy

### 3. Build & Development Settings
**Location:** Vercel Dashboard → Your Project → Settings → General → Build & Development Settings

**Required Settings:**
- **Build Command:** Should be blank (let vercel.json handle it) OR `npm run build`
- **Output Directory:** Should be blank (let vercel.json handle it) OR `dist`
- **Install Command:** Leave as default OR `npm install`

**How to Fix:**
1. In Settings → General
2. Find "Build & Development Settings"
3. Click "Override" if needed
4. Set Build Command: `npm run build` (or leave blank to use vercel.json)
5. Set Output Directory: `dist` (or leave blank to use vercel.json)
6. Save

### 4. Environment Variables
**Location:** Vercel Dashboard → Your Project → Settings → Environment Variables

**Check These:**
- Make sure you don't have any variable that would interfere (like `FRAMEWORK` or `BUILD_COMMAND`)
- Required variables (from VERCEL_DEPLOYMENT.md):
  - `HOST_USER_IDS` (optional, for host authorization)
  - `DISCORD_CLIENT_ID` (optional, for OAuth)
  - `DISCORD_CLIENT_SECRET` (optional, for OAuth)
  - `DISCORD_REDIRECT_URI` (optional, for OAuth)

## How to Redeploy After Changing Settings

### Option 1: Redeploy Latest Deployment
1. Go to Deployments tab
2. Find the latest deployment
3. Click the three dots (⋯) on the right
4. Select **"Redeploy"**
5. Check **"Use existing Build Cache"** = OFF (unchecked)
6. Click "Redeploy"

### Option 2: Trigger New Deployment
1. Go to your repository
2. Make a small change (add a space to a comment)
3. Commit and push
4. Vercel will automatically deploy

### Option 3: Manual Redeploy via CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

## Verification After Deployment

### 1. Check Deployment Logs
1. Go to Deployments tab
2. Click on the latest deployment
3. Check "Building" logs
4. Look for:
   - ✅ `npm run build` executed successfully
   - ✅ Files copied to `dist/`
   - ✅ `dist/index.html` exists
   - ❌ Any errors or warnings

### 2. Check Deployed Files
1. In the deployment details
2. Click "Source" tab
3. Browse the files
4. Verify:
   - ✅ `vercel.json` exists at root with correct content
   - ✅ `dist/index.html` exists
   - ✅ `dist/assets/` contains JS and CSS files
   - ✅ `api/[...path].js` exists

### 3. Test the URLs
Open browser console (F12) and test:

**Test 1: Root Page**
```
URL: https://your-app.vercel.app/
Expected: Loads the app homepage
```

**Test 2: API Health**
```
URL: https://your-app.vercel.app/api/health
Expected: Returns JSON (not 404, not index.html)
```

**Test 3: Viewer Link (Critical)**
```
URL: https://your-app.vercel.app/testroom123
Expected: Loads index.html, app parses "testroom123" as roomId
Actual: Check console for [DEBUG URL PARSING] logs
```

**Test 4: Popout (Critical)**
```
URL: https://your-app.vercel.app/testroom123?popout=1
Expected: Loads index.html, app detects popout mode
Actual: Check console for [DEBUG URL PARSING] logs
```

## Common Issues and Solutions

### Issue: Still Getting 404 Even After Dashboard Changes
**Possible Causes:**
1. Cache not cleared during redeploy
2. vercel.json not being read
3. Build failed but deployment shows as successful
4. DNS/CDN caching (wait 5-10 minutes)

**Solution:**
1. Force redeploy without cache
2. Check deployment logs carefully
3. Try deploying to a new project to rule out cached settings

### Issue: Dashboard Says "Framework Preset: None" But Still 404
**Solution:**
- Delete and recreate the Vercel project
- Or deploy via Vercel CLI with explicit settings

### Issue: Works Locally But Not on Vercel
**Causes:**
- Local dev server (vite dev) handles SPA routing differently
- Vercel uses production build which requires rewrites

**Solution:**
- Test with `npm run build` + `npm run preview` locally
- This simulates production environment

## If All Else Fails

### Nuclear Option: Recreate Vercel Project
1. In Vercel Dashboard, go to Settings → Advanced
2. Scroll to "Delete Project"
3. Delete the project
4. Re-import from GitHub
5. During import:
   - Framework Preset: **Other**
   - Root Directory: (leave blank)
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. Deploy

This ensures no cached settings interfere.

## Expected Result

After fixing dashboard settings and redeploying:

✅ **Viewer Link:** `https://your-app.vercel.app/abc123`
- Loads the app (index.html)
- Console shows: `[DEBUG URL PARSING]` with roomId: "abc123"
- Meeting loads as viewer

✅ **Popout:** `https://your-app.vercel.app/abc123?popout=1&as=attendee`
- Loads the app (index.html)
- Console shows: `[DEBUG URL PARSED]` with isPopout: true
- Compact popout view renders

✅ **API:** `https://your-app.vercel.app/api/health`
- Returns JSON response (not HTML, not 404)

## Summary

The vercel.json file is correct, but **Vercel Dashboard settings can override it**. You MUST:
1. Set Framework Preset to "Other"
2. Verify Root Directory is blank
3. Check Build & Output settings
4. Redeploy without cache

If issues persist after dashboard changes, delete and recreate the Vercel project.
