/**
 * utils/geo.js
 * ------------------------------------------------------------
 * Haversine = straight-line ("as the crow flies") distance over the
 * earth's surface. Pure maths, no network, effectively free.
 *
 * ROLE IN LABLY MATCHING (two jobs):
 *   1) FREE PREFILTER - rule people out before spending a Google request.
 *   2) FALLBACK       - used when Google is unavailable / forced off.
 *
 * Matching code should NOT use this alone for final decisions;
 * it goes through utils/routeDistance.js, which picks Google or Haversine.
 */

/** @returns km, or Infinity if either point is missing coordinates. */
export function distanceKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) {
    return Infinity;
  }

  const R = 6371; // earth radius in km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Same as distanceKm but in metres. */
export function distanceM(a, b) {
  return distanceKm(a, b) * 1000;
}
