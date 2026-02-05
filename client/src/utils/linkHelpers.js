/**
 * Link generation helpers for meeting invites
 * Ensures proper URL construction using VITE_PUBLIC_APP_URL or window.location.origin
 */

/**
 * Get the base URL for generating invite links
 * Priority: VITE_PUBLIC_APP_URL > window.location.origin
 * Ensures no trailing slash
 */
export function getLinkBaseUrl() {
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  
  if (envUrl && envUrl.trim()) {
    // Remove trailing slash if present
    return envUrl.trim().replace(/\/$/, '');
  }
  
  // Fallback to current origin
  return window.location.origin;
}

/**
 * Generate viewer link for a room
 * @param {string} roomId - The room ID
 * @returns {string} Full viewer URL
 */
export function generateViewerLink(roomId) {
  const baseUrl = getLinkBaseUrl();
  const viewerLink = `${baseUrl}/${roomId}`;
  
  // DEBUG: Enhanced logging for Vercel 404 investigation
  console.group('🔍 [VIEWER LINK DEBUG]');
  console.log('Room ID:', roomId);
  console.log('Base URL (from getLinkBaseUrl):', baseUrl);
  console.log('window.location.origin:', window.location.origin);
  console.log('window.location.pathname:', window.location.pathname);
  console.log('VITE_PUBLIC_APP_URL:', import.meta.env.VITE_PUBLIC_APP_URL || '(not set)');
  console.log('🎯 GENERATED VIEWER LINK:', viewerLink);
  console.groupEnd();
  
  return viewerLink;
}

/**
 * Generate host link for a room
 * @param {string} roomId - The room ID
 * @param {string} hostKey - The host key
 * @returns {string} Full host URL with hostKey query param
 */
export function generateHostLink(roomId, hostKey) {
  const baseUrl = getLinkBaseUrl();
  return `${baseUrl}/${roomId}?hostKey=${hostKey}`;
}

/**
 * Open popout window for mini-view
 * @param {string} roomId - The room ID
 * @param {string} hostKey - Optional host key (included in URL but view forced to attendee mode)
 * 
 * Note: The hostKey is included in the URL to maintain host privileges on the connection,
 * but the view is forced to attendee mode via ?as=attendee to show the compact attendee UI.
 * This allows a host to use the popout while keeping their host connection active.
 */
export function openPopoutWindow(roomId, hostKey) {
  const baseUrl = window.location.origin;
  // Always open as attendee view with popout flag
  const url = `${baseUrl}/${roomId}?popout=1&as=attendee${hostKey ? `&hostKey=${hostKey}` : ''}`;
  
  // DEBUG: Enhanced logging for Vercel 404 investigation
  console.group('🔍 [POPOUT DEBUG]');
  console.log('Room ID:', roomId);
  console.log('Host Key:', hostKey ? '***PRESENT***' : '(none)');
  console.log('Base URL (window.location.origin):', baseUrl);
  console.log('window.location.pathname:', window.location.pathname);
  console.log('window.location.href:', window.location.href);
  console.log('🎯 POPOUT URL:', url);
  console.groupEnd();
  
  window.open(
    url,
    "evw_popout",
    "popup,width=420,height=720,resizable=yes,scrollbars=yes"
  );
}

/**
 * Check if currently in popout mode
 * @returns {boolean} True if ?popout=1 is in URL
 */
export function isPopoutMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('popout') === '1';
}

/**
 * Check if URL specifies attendee view mode
 * @returns {boolean} True if ?as=attendee is in URL
 */
export function isAttendeeViewMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('as') === 'attendee';
}
