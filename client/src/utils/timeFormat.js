/**
 * Format seconds as MM:SS
 * @param {number} seconds - Total seconds to format
 * @returns {string} Formatted time string in MM:SS format
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
