/*
 * Shared "last confirmed location" store.
 *
 * Lives outside any component so BOTH LocationSearch and Home
 * (the "Where are you?" button) read/write the same record —
 * that's what stops the location being forgotten when the user
 * backs out of the booking flow or navigates between pages.
 *
 * sessionStorage (not localStorage) on purpose: a confirmed
 * location should survive navigation and refresh within the
 * session, but not silently persist as stale data days later.
 */

const LAST_LOCATION_KEY = "lably_last_location";

export function loadLastLocation() {
  try {
    const raw = sessionStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lng !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveLastLocation(place) {
  if (!place || place.lat == null || place.lng == null) return;

  try {
    sessionStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: place.lat,
        lng: place.lng,
        address: place.address || "",
      })
    );
  } catch (error) {
    console.warn("LABLY failed to cache location:", error);
  }
}

export function clearLastLocation() {
  try {
    sessionStorage.removeItem(LAST_LOCATION_KEY);
  } catch {
    /* ignore */
  }
}