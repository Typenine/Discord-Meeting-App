# Vercel 404 Fix - Testing Instructions

## Changes Made

### 1. Added Debug Header in vercel.json ✅
- Added `x-meeting-config: 1` header to all routes `/(.*)`
- This header will help verify if Vercel is applying the vercel.json configuration

### 2. Refactored URL Generation ✅
All viewer, host, and popout links now use query parameters instead of path-based routing:

**Before:**
- Viewer: `https://example.com/room123`
- Host: `https://example.com/room123?hostKey=abc`
- Popout: `https://example.com/room123?popout=1&as=attendee`

**After:**
- Viewer: `https://example.com/?room=room123&mode=viewer`
- Host: `https://example.com/?room=room123&hostKey=abc&mode=host`
- Popout: `https://example.com/?room=room123&mode=popout&as=attendee`

### 3. Added On-Screen Debug Info ✅
- **ShareModal**: Shows debug panel with window.location.origin, pathname, href, and generated URLs
- **TopBar**: Added 🔍 debug button next to Popout button to show current page info and popout URL
- **Console Logs**: Enhanced grouped console logging for all URL generation

### 4. Updated URL Parsing ✅
- Priority given to query params (`?room=X`) over path-based routing
- Backward compatible with old path formats (`/roomId`)
- Supports both `?mode=popout` and legacy `?popout=1`

## Testing Steps

### Step 1: Deploy to Vercel
1. Push this branch and create/update PR
2. Deploy to Vercel (either through PR preview or main deployment)
3. Wait for deployment to complete

### Step 2: Verify Header Configuration
1. Open the deployed app in browser
2. Open DevTools → Network tab
3. Navigate to any page in the app
4. Check response headers for `x-meeting-config: 1`
5. **If header is present**: vercel.json is being applied ✅
6. **If header is missing**: Vercel config issue (check rootDirectory/framework settings)

### Step 3: Check URL Generation
1. Create or join a meeting room
2. Click "📤 Share" button
3. Review the **DEBUG INFO** panel at bottom of modal:
   - Verify `window.location.origin` is correct
   - Verify generated URLs use query param format: `/?room=X&mode=viewer`
   - Note exact URLs shown

4. Click "🔍" button next to Popout button
   - Verify popout URL format: `/?room=X&mode=popout&as=attendee`

5. Open browser console
   - Look for grouped logs: `🔍 [VIEWER LINK DEBUG]`, `🔍 [POPOUT DEBUG]`, `🔍 [URL PARSING DEBUG]`
   - Verify all logs show query param based URLs

### Step 4: Test Viewer Link
1. Copy the viewer link from Share modal
2. Open new incognito/private browser window
3. Paste and navigate to the viewer link
4. **Expected**: App loads successfully, shows meeting room
5. **If 404**: Check Network tab for:
   - Is `x-meeting-config: 1` header present?
   - What's the exact URL that's failing?
   - Any redirects happening?

### Step 5: Test Popout Window
1. In a meeting room, click "🪟 Popout" button
2. **Expected**: New popup window opens showing compact meeting view
3. **If 404**: 
   - Check console logs for exact URL being opened
   - Check Network tab in popout window for headers
   - Verify URL format matches `/?room=X&mode=popout&as=attendee`

### Step 6: Test Backward Compatibility
1. Manually navigate to old-style URL: `https://[domain]/room123`
2. **Expected**: App should still parse and join room
3. Try with hostKey: `https://[domain]/room123?hostKey=abc`
4. **Expected**: App should parse room from path and hostKey from query

## Common Issues & Solutions

### Issue: x-meeting-config header is missing
**Diagnosis**: Vercel is not applying vercel.json
**Solutions**:
- Check Vercel dashboard → Project Settings → General
- Verify "Root Directory" is not set to `client/` (should be blank or root)
- Verify "Framework Preset" is set to "Vite" (not "Other")
- Check vercel.json is in repository root, not in client/ subdirectory

### Issue: Viewer/Popout URLs still return 404
**Diagnosis**: Even with query params, something's wrong
**Solutions**:
- Verify the `/(.*) → /index.html` rewrite in vercel.json
- Check if there are conflicting routes or serverless functions
- Try adding more specific rewrite: `{ "source": "/(.*)", "destination": "/index.html" }`

### Issue: URLs include /proxy/ or Discord paths
**Diagnosis**: Base URL detection is picking up wrong origin
**Solutions**:
- This shouldn't happen with new code (always uses window.location.origin)
- Check debug info to see what baseUrl is being computed
- Verify no VITE_PUBLIC_APP_URL env var is set with wrong value

## Cleanup After Verification

Once everything is working:
1. Remove `x-meeting-config` header from vercel.json
2. Remove debug info panels from ShareModal and TopBar
3. Simplify console.log statements (or remove if not needed)
4. Update this document with final results

## Summary

The changes ensure that:
- ✅ All share links use query parameters (caught by `/(.*) → /index.html`)
- ✅ No reliance on path-based routing that might not work on Vercel
- ✅ Always use `window.location.origin` (no proxy/Discord paths)
- ✅ Backward compatible with existing URLs
- ✅ Extensive debug logging to verify behavior in production
