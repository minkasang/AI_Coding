/** @param {number} meters */
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return 'UNKNOWN';
  return `${(meters * 1000).toFixed(2)} mm（${meters.toFixed(4)} m）`;
}