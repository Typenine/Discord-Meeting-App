/**
 * Format seconds as MM:SS or +MM:SS for overtime (negative values)
 * @param {number} seconds - Total seconds to format (can be negative for overtime)
 * @returns {string} Formatted time string in MM:SS or +MM:SS format
 */
export function formatTime(seconds) {
  const isOvertime = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return isOvertime ? `+${formatted}` : formatted;
}
