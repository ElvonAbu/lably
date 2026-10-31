/**
 * utils/travelMode.js
 * ============================================================
 * A scientist declares HOW they travel: "driving" or "walking".
 * That one word decides which routing profile measures their ETA
 * (Google DRIVE / WALK, Mapbox driving-traffic / walking) and which
 * numbers they are notified with. Everything else in matching is shared.
 * ============================================================
 */
export const TRAVEL_MODES = ["driving", "walking"];
export const DEFAULT_TRAVEL_MODE = "driving";

/** Anything unknown (or missing, e.g. older scientist records) is "driving". */
export function normalizeTravelMode(m) {
  const v = String(m ?? "").trim().toLowerCase();
  if (v === "walking" || v === "walk" || v === "foot") return "walking";
  return "driving";
}

export function isValidTravelMode(m) {
  return TRAVEL_MODES.includes(String(m ?? "").trim().toLowerCase());
}

/** Wording for emails / logs. */
export function modeWords(m) {
  return normalizeTravelMode(m) === "walking"
    ? { verb: "walk", noun: "walking", adj: "on foot" }
    : { verb: "drive", noun: "driving", adj: "by road" };
}
