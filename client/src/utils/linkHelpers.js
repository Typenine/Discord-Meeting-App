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
  // TODO: Remove debug logging after verifying fix on Vercel (see VIEWER_POPOUT_FIX.md)
  console.log('[DEBUG VIEWER LINK]', {
    roomId,
    baseUrl,
    windowOrigin: window.location.origin,
    envUrl: import.meta.env.VITE_PUBLIC_APP_URL || '(not set)',
    viewerLink
  });
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
  
  // TODO: Remove debug logging after verifying fix on Vercel (see VIEWER_POPOUT_FIX.md)
  // Note: This is intentionally logging sensitive data for debugging 404 issues
  console.log('[DEBUG POPOUT]', {
    roomId,
    hostKey: hostKey ? '***' : '(none)',
    baseUrl,
    windowOrigin: window.location.origin,
    windowPathname: window.location.pathname,
    popoutUrl: url
  });
  
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
