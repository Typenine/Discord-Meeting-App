/**
 * Link generation helpers for meeting invites
 * Ensures proper URL construction using VITE_PUBLIC_APP_URL or window.location.origin
 */

/**
 * Get the base URL for generating invite links
 * Priority: window.location.origin (always use current origin for consistency)
 * Ensures no trailing slash
 */
export function getLinkBaseUrl() {
  // Always use current origin to avoid any Discord-specific paths or proxy URLs
  return window.location.origin;
}

/**
 * Generate viewer link for a room
 * Uses query params to ensure Vercel's /(.*) -> /index.html rewrite catches it
 * @param {string} roomId - The room ID
 * @returns {string} Full viewer URL
 */
export function generateViewerLink(roomId) {
  const baseUrl = getLinkBaseUrl();
  // Use query params to ensure SPA routing works correctly
  const viewerLink = `${baseUrl}/?room=${roomId}&mode=viewer`;
  
  // DEBUG: Enhanced logging for Vercel 404 investigation
  console.group('🔍 [VIEWER LINK DEBUG]');
  console.log('Room ID:', roomId);
  console.log('Base URL (from getLinkBaseUrl):', baseUrl);
  console.log('window.location.origin:', window.location.origin);
  console.log('window.location.pathname:', window.location.pathname);
  console.log('window.location.href:', window.location.href);
  console.log('🎯 GENERATED VIEWER LINK:', viewerLink);
  console.log('📋 Format: /?room={roomId}&mode=viewer (query param based)');
  console.groupEnd();
  
  return viewerLink;
}

/**
 * Generate host link for a room
 * Uses query params to ensure Vercel's /(.*) -> /index.html rewrite catches it
 * @param {string} roomId - The room ID
 * @param {string} hostKey - The host key
 * @returns {string} Full host URL with hostKey query param
 */
export function generateHostLink(roomId, hostKey) {
  const baseUrl = getLinkBaseUrl();
  return `${baseUrl}/?room=${roomId}&hostKey=${hostKey}&mode=host`;
}

/**
 * Open popout window for mini-view
 * Uses query params to ensure Vercel's /(.*) -> /index.html rewrite catches it
 * @param {string} roomId - The room ID
 * @param {string} hostKey - Optional host key (included in URL but view forced to attendee mode)
 * 
 * Note: The hostKey is included in the URL to maintain host privileges on the connection,
 * but the view is forced to attendee mode via ?as=attendee to show the compact attendee UI.
 * This allows a host to use the popout while keeping their host connection active.
 */
export function openPopoutWindow(roomId, hostKey) {
  const baseUrl = window.location.origin;
  // Use query params with mode=popout to ensure SPA routing works
  const url = `${baseUrl}/?room=${roomId}&mode=popout&as=attendee${hostKey ? `&hostKey=${hostKey}` : ''}`;
  
  // DEBUG: Enhanced logging for Vercel 404 investigation
  console.group('🔍 [POPOUT DEBUG]');
  console.log('Room ID:', roomId);
  console.log('Host Key:', hostKey ? '***PRESENT***' : '(none)');
  console.log('Base URL (window.location.origin):', baseUrl);
  console.log('window.location.pathname:', window.location.pathname);
  console.log('window.location.href:', window.location.href);
  console.log('🎯 POPOUT URL:', url);
  console.log('📋 Format: /?room={roomId}&mode=popout&as=attendee (query param based)');
  console.groupEnd();
  
  window.open(
    url,
    "evw_popout",
    "popup,width=420,height=720,resizable=yes,scrollbars=yes"
  );
}

/**
 * Check if currently in popout mode
 * @returns {boolean} True if ?mode=popout is in URL
 */
export function isPopoutMode() {
  const params = new URLSearchParams(window.location.search);
  // Support both old (?popout=1) and new (?mode=popout) formats
  return params.get('mode') === 'popout' || params.get('popout') === '1';
}

/**
 * Check if URL specifies attendee view mode
 * @returns {boolean} True if ?as=attendee is in URL
 */
export function isAttendeeViewMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('as') === 'attendee';
}
