import { distanceM as haversineM } from "./geo.js";

/**
 * utils/mapboxProbe.js
 * ============================================================
 * ONE raw Mapbox Directions call for ONE pair (a -> b). Used by the
 * provider comparison (utils/providerCompare.js) so the console can show
 * what Mapbox says about the scientist, the patient and the hub.
 *
 * It returns what Mapbox answered, nothing is decided here:
 *   meters / seconds   road distance and driving time
 *   from / to          the points Mapbox SNAPPED our coordinates to (the road),
 *                      with how many metres it moved each one
 *
 * Env (read at call time):
 *   MAPBOX_ACCESS_TOKEN   server token (MAPBOX_TOKEN also accepted)
 *   MAPBOX_PROFILE        driving-traffic | driving | walking | cycling   (default driving-traffic = LIVE traffic aware)
 *   MAPBOX_TIMEOUT_MS     default 3000
 * ============================================================
 */

export function mapboxToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN || "";
}

/**
 * Profile for a travel mode. Driving uses MAPBOX_PROFILE (default driving-traffic);
 * walking always uses "walking" (Mapbox has no traffic for pedestrians).
 */
export function mapboxProfileFor(mode) {
  return String(mode ?? "").toLowerCase().startsWith("walk") ? "walking" : mapboxProfile();
}

export function mapboxProfile() {
  const p = String(process.env.MAPBOX_PROFILE || "driving-traffic").toLowerCase();
  return ["driving", "driving-traffic", "walking", "cycling"].includes(p) ? p : "driving-traffic";
}

/** true when the profile uses live traffic (driving-traffic). */
export function mapboxTrafficAware() {
  return mapboxProfile() === "driving-traffic";
}

export function mapboxTimeoutMs() {
  const n = Number(process.env.MAPBOX_TIMEOUT_MS || 3000);
  return Number.isFinite(n) && n > 0 ? n : 3000;
}

const snap = (input, loc) => {
  if (!Array.isArray(loc) || loc.length < 2) return null;
  const p = { lat: loc[1], lng: loc[0] };
  return { ...p, movedM: Math.round(haversineM(input, p)) };
};

/**
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @param {{timeoutMs?:number, mode?:"driving"|"walking"}} [opts]
 * @returns {Promise<{provider:"mapbox",ok:boolean,meters?:number,seconds?:number,profile?:string,traffic?:string,from?:object,to?:object,ms:number,error?:string}>} never throws
 *
 * Traffic coverage is not available everywhere (e.g. Nigeria). When Mapbox rejects the
 * driving-traffic profile, the probe retries with plain "driving" and says traffic: "unaware".
 */
export async function probeMapbox(a, b, { timeoutMs, mode } = {}) {
  const first = await probeOnce(a, b, mapboxProfileFor(mode), timeoutMs);
  if (!first.ok && first.profile === "driving-traffic" && first.profileProblem) {
    const retry = await probeOnce(a, b, "driving", timeoutMs);
    return { ...retry, fellBackFrom: "driving-traffic" };
  }
  return first;
}

async function probeOnce(a, b, profile, timeoutMs) {
  const t0 = Date.now();
  const token = mapboxToken();
  if (!token) return { provider: "mapbox", ok: false, ms: 0, profile, error: "MAPBOX_ACCESS_TOKEN is not set" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || mapboxTimeoutMs());
  try {
    const coords = `${Number(a.lng)},${Number(a.lat)};${Number(b.lng)},${Number(b.lat)}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
      `?overview=false&alternatives=false&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code && data.code !== "Ok")) {
      return {
        provider: "mapbox",
        ok: false,
        ms: Date.now() - t0,
        profile,
        profileProblem: res.status === 422 || res.status === 404 || /profile/i.test(`${data.code} ${data.message}`),
        error: `HTTP ${res.status} ${data.code || ""} ${data.message || ""}`.trim(),
      };
    }
    const r = data.routes?.[0];
    if (!r) return { provider: "mapbox", ok: false, ms: Date.now() - t0, profile, error: "no route" };
    return {
      provider: "mapbox",
      ok: true,
      meters: Number(r.distance),
      seconds: Number(r.duration),
      profile,
      traffic: profile === "driving-traffic" ? "aware" : profile === "walking" ? "n/a" : "unaware",
      from: snap(a, data.waypoints?.[0]?.location),
      to: snap(b, data.waypoints?.[1]?.location),
      ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      provider: "mapbox",
      ok: false,
      ms: Date.now() - t0,
      profile,
      error: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
