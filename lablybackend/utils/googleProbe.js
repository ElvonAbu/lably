import { distanceM as haversineM } from "./geo.js";
import { reserve, refund, getUsageSnapshot } from "./googleUsage.js";

/**
 * utils/googleProbe.js
 * ============================================================
 * ONE raw Google Routes API (computeRoutes) call for ONE pair (a -> b), used
 * by the provider comparison (utils/providerCompare.js) so the console can
 * show what Google says about the scientist, the patient and the hub.
 *
 * Returns what Google answered:
 *   meters / seconds   road distance and driving time
 *   from / to          the points Google SNAPPED our coordinates to (leg
 *                      start / end location), with how many metres it moved them
 *
 * TRAFFIC: by default it asks Routes PRO with TRAFFIC_AWARE (live + historical
 * traffic, 5,000 free / month). If the Pro allowance is used up it falls back to
 * Essentials (TRAFFIC_UNAWARE) and the result says traffic: "unaware" so the
 * console never pretends. Set COMPARE_TRAFFIC=false to compare WITHOUT traffic
 * (Essentials only, 10,000 free / month).
 * COMPARE_PRO_RESERVE (default 1500) keeps that many Pro units free for the matcher.
 * Both go through the same ledger the matcher uses (utils/googleUsage.js), so a
 * probe can never push the project past its internal limit.
 *
 * Env: GOOGLE_MAPS_API_KEY, GOOGLE_TRAVEL_MODE, GOOGLE_TIMEOUT_MS (shared with the matcher)
 * ============================================================
 */

const URL_V2 = "https://routes.googleapis.com/directions/v2:computeRoutes";

const snap = (input, loc) => {
  if (loc?.latitude == null || loc?.longitude == null) return null;
  const p = { lat: loc.latitude, lng: loc.longitude };
  return { ...p, movedM: Math.round(haversineM(input, p)) };
};

/** @returns {Promise<{provider:"google",ok:boolean,meters?:number,seconds?:number,from?:object,to?:object,ms:number,error?:string}>} never throws */
export async function probeGoogle(a, b, { timeoutMs, mode: wantedMode } = {}) {
  const t0 = Date.now();
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!key) return { provider: "google", ok: false, ms: 0, error: "GOOGLE_MAPS_API_KEY is not set" };

  // the scientist's declared mode wins; otherwise GOOGLE_TRAVEL_MODE; default DRIVE
  let mode = wantedMode
    ? String(wantedMode).toLowerCase().startsWith("walk") ? "WALK" : "DRIVE"
    : String(process.env.GOOGLE_TRAVEL_MODE || "DRIVE").toUpperCase();
  if (!["DRIVE", "WALK", "BICYCLE"].includes(mode)) mode = "DRIVE";

  // traffic-aware (Pro) first, unless COMPARE_TRAFFIC=false; Essentials = no traffic
  const wantTraffic = mode === "DRIVE" && String(process.env.COMPARE_TRAFFIC ?? "true").toLowerCase() !== "false";
  let sku = null;
  // Keep COMPARE_PRO_RESERVE units of the Pro allowance for the MATCHER (when Google decides
  // matching, probes must not use up the traffic-aware allowance the matcher needs).
  let proHasRoom = wantTraffic;
  if (wantTraffic) {
    const reserveForMatcher = Number(process.env.COMPARE_PRO_RESERVE ?? 1500);
    const pro = (await getUsageSnapshot()).skus.routes_pro;
    proHasRoom = pro.remainingToLimit > (Number.isFinite(reserveForMatcher) ? reserveForMatcher : 1500);
  }
  if (proHasRoom && (await reserve("routes_pro", 1))) sku = "routes_pro";
  else if (await reserve("routes_essentials", 1)) sku = "routes_essentials";
  if (!sku) {
    return { provider: "google", ok: false, ms: 0, error: "Google free allowance (Routes Pro and Essentials) used up" };
  }
  const aware = sku === "routes_pro";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || Number(process.env.GOOGLE_TIMEOUT_MS || 3000));
  try {
    const ll = (p) => ({ latitude: Number(p.lat), longitude: Number(p.lng) });
    const body = {
      origin: { location: { latLng: ll(a) } },
      destination: { location: { latLng: ll(b) } },
      travelMode: mode,
      computeAlternativeRoutes: false,
    };
    if (mode === "DRIVE") body.routingPreference = aware ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE";

    const res = await fetch(URL_V2, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.legs.startLocation,routes.legs.endLocation",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status < 500) await refund(sku, 1, 1); // rejected, not billed
      const e = Array.isArray(data) ? data[0]?.error : data?.error;
      return { provider: "google", ok: false, ms: Date.now() - t0, error: `HTTP ${res.status} ${e?.message || ""}`.trim() };
    }
    const r = data.routes?.[0];
    if (!r) return { provider: "google", ok: false, ms: Date.now() - t0, error: "no route" };
    const leg = r.legs?.[0];
    return {
      provider: "google",
      ok: true,
      meters: Number(r.distanceMeters ?? 0),
      seconds: parseFloat(r.duration),
      traffic: mode !== "DRIVE" ? "n/a" : aware ? "aware" : "unaware",
      from: snap(a, leg?.startLocation?.latLng),
      to: snap(b, leg?.endLocation?.latLng),
      ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      provider: "google",
      ok: false,
      ms: Date.now() - t0,
      error: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
