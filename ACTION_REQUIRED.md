# ACTION REQUIRED: Fix Vercel Dashboard Settings

## Why Your Fixes Aren't Working

The `vercel.json` file is correct, but **Vercel Dashboard settings are overriding it**.

Even though we have the right rewrites in `vercel.json`, your Vercel project is likely set to use the "Vite" framework preset, which ignores custom rewrites and causes 404 errors.

## What You Must Do RIGHT NOW

### Step 1: Open Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Click on your Discord Meeting App project
3. Click the **"Settings"** tab

### Step 2: Change Framework Preset
1. Scroll down to **"Framework Preset"**
2. You'll probably see it's set to **"Vite"** or auto-detected
3. Click the dropdown and select **"Other"**
4. Click **"Save"**

### Step 3: Redeploy WITHOUT Cache
1. Go to the **"Deployments"** tab
2. Find the latest deployment
3. Click the three dots (⋯) on the right
4. Select **"Redeploy"**
5. **IMPORTANT:** Make sure **"Use existing Build Cache"** is **UNCHECKED**
6. Click **"Redeploy"**

### Step 4: Wait for Deployment
- Wait 2-3 minutes for the build to complete
- Watch the build logs for errors

### Step 5: Test
Open these URLs in an incognito window:

**Test Viewer Link:**
```
https://your-app.vercel.app/testroom123
```
- Should load the app (NOT 404)
- Should see `[DEBUG URL PARSING]` in console

**Test Popout:**
```
https://your-app.vercel.app/testroom123?popout=1
```
- Should load the app (NOT 404)
- Should see popout view render

## Why This Matters

**Before (Framework Preset = "Vite"):**
```
Request: /testroom123
↓
Vercel: "This is a Vite app, let me apply Vite routing"
↓
Vercel: "No file at /testroom123"
↓
Result: 404 NOT_FOUND
↓
Your vercel.json rewrites are IGNORED
```

**After (Framework Preset = "Other"):**
```
Request: /testroom123
↓
Vercel: "Framework is 'Other', use vercel.json rewrites"
↓
Vercel: Checks rewrites in order
↓
Vercel: "/(.*) matches, rewrite to /index.html"
↓
Result: Serves index.html
↓
React app loads and parses roomId from URL
```

## If It STILL Doesn't Work

### Option 1: Check Root Directory
1. In Settings → General
2. Find "Root Directory"
3. Make sure it's BLANK (not "client")
4. Save and redeploy

### Option 2: Nuclear Option - Recreate Project
1. Settings → Advanced → Delete Project
2. Re-import from GitHub
3. During import, set:
   - Framework Preset: **Other**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy

## Summary

The vercel.json is CORRECT. The problem is in your Vercel project settings.

**You MUST:**
1. Change Framework Preset to "Other"
2. Redeploy without cache
3. Test the viewer link and popout

After this change, everything should work.

## Need More Help?

See the complete guide: **VERCEL_DASHBOARD_SETTINGS.md**

It contains:
- Detailed screenshots/instructions
- All settings to check
- Verification steps
- Troubleshooting for edge cases
