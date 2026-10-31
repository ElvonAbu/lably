// 850 -> "850 m", 1240 -> "1.2 km". Returns "" when the distance is unknown.
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
