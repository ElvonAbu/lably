import { getDistanceMode } from "./routeDistance.js";

/**
 * utils/distancePolicy.js
 * ============================================================
 * THE RULE: LABLY's limits (rings, and the 2.25 km hub limit) are ROAD
 * distances. So a number only counts as "road-verified" if Google produced it
 * (fresh or from cache).
 *
 * When Google could NOT answer (timeout, error, breaker open, no key, out of
 * stage budget, or EVERY FREE POOL used up for the month), routeDistance falls back to Haversine. A Haversine number is
 * NOT a road distance, so it must not silently qualify a scientist.
 * What happens to such an "unverified" number is decided HERE, explicitly:
 *
 *   UNVERIFIED_POLICY=strict    (default)  unverified -> null -> NOT eligible
 *       this stage. They are not marked notified, so the NEXT stage (12 s
 *       later) re-checks them and Google gets another chance.
 *       Trade-off: if Google is down for the WHOLE 48 s - or every free
 *       allowance is used up until the 1st (Pacific) and GOOGLE_ALLOW_PAID
 *       is off - nobody is notified and the patient ends in NoCoverage.
 *   UNVERIFIED_POLICY=estimate  unverified -> straight-line x DETOUR_FACTOR
 *       (default 1.3, a rough "roads are ~30% longer than the crow flies").
 *       Keeps matching alive in an outage, but those scientists are only
 *       ESTIMATED to be inside the road limit.
 *
 * MINUTES follow the same rule (usableMinutes below): a real Google duration is
 * used as-is. Without one, strict -> null (cannot verify the time); estimate ->
 * metres x DETOUR_FACTOR at ASSUMED_KMH (default 25 km/h, a rough urban speed).
 *
 * EXCEPTION (explicit, for testing): DISTANCE_MODE=haversine means YOU chose
 * straight-line for this run, so Haversine numbers are used as-is.
 * ============================================================
 */

function assumedKmh() {
  const v = Number(process.env.ASSUMED_KMH || 25);
  return Number.isFinite(v) && v >= 5 ? v : 25;
}

/** Walking speed for ESTIMATES only (default 5 km/h). Real Google / Mapbox walking durations are used whenever available. */
function assumedWalkKmh() {
  const v = Number(process.env.ASSUMED_WALK_KMH || 5);
  return Number.isFinite(v) && v >= 1 && v <= 12 ? v : 5;
}

export function policyConfig() {
  const p = process.env.UNVERIFIED_POLICY === "estimate" ? "estimate" : "strict";
  const f = Number(process.env.DETOUR_FACTOR || 1.3);
  return {
    unverifiedPolicy: p,
    detourFactor: Number.isFinite(f) && f >= 1 ? f : 1.3,
    assumedKmh: assumedKmh(),
    distanceMode: getDistanceMode(),
  };
}

/**
 * @param {{meters:number, source:"google"|"mapbox"|"haversine"}} d  result from routeDistance*
 * @returns {number|null} metres to compare against a limit, or null = "cannot verify"
 */
export function usableMeters(d) {
  if (!d || !Number.isFinite(d.meters)) return null;
  if (d.source !== "haversine") return d.meters; // road-verified (Google or Mapbox)
  const { unverifiedPolicy, detourFactor, distanceMode } = policyConfig();
  if (distanceMode === "haversine") return d.meters; // you chose straight-line for this run
  if (unverifiedPolicy === "estimate") return d.meters * detourFactor;
  return null; // strict
}

/**
 * Driving minutes to compare against a stage's time band.
 * @param {{meters:number, seconds?:number, source:"google"|"mapbox"|"haversine"}} d  result from routeDistance*
 * @returns {number|null} minutes, or null = "cannot verify"
 */
export function usableMinutes(d) {
  if (!d || !Number.isFinite(d.meters)) return null;
  if (d.source !== "haversine" && Number.isFinite(d.seconds)) return d.seconds / 60; // road-verified (in the answer's own travel mode)
  const { unverifiedPolicy, detourFactor, distanceMode, assumedKmh: driveKmh } = policyConfig();
  const kmh = d.travelMode === "walking" ? assumedWalkKmh() : driveKmh; // a walker is estimated at walking speed
  const estimate = (m) => (m / 1000 / kmh) * 60;
  if (d.source === "haversine" && distanceMode === "haversine") return estimate(d.meters); // chosen straight-line run
  if (unverifiedPolicy === "estimate") return estimate(d.meters * detourFactor);
  return null; // strict
}
