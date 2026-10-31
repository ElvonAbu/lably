import { EventEmitter } from "node:events";
import { distanceM as haversineM } from "./geo.js";
import { SKUS, reserve, refund, getUsageSnapshot } from "./googleUsage.js";
import { mapboxToken } from "./mapboxProbe.js";
import { normalizeTravelMode } from "./travelMode.js";

/**
 * utils/routeDistance.js
 * ============================================================
 * "How far is A from B?" for LABLY matching. Nothing else.
 *
 * ORDER OF PREFERENCE (per pair):
 *   1. CACHE      - already measured in the last few minutes? reuse it.
 *   2. ROAD API   - Google, then Mapbox, tier by tier (below).
 *                     * routeDistance()          -> ONE pair (Compute Routes / Directions)
 *                     * routeDistancesToPoint()  -> MANY origins -> ONE destination (Matrix)
 *   3. HAVERSINE  - straight-line fallback (distancePolicy decides if it may be used).
 *
 * TRAVEL MODE (per call: opts.travelMode = "driving" | "walking")
 *   A scientist's declared mode decides how THEIR ETA is measured:
 *     driving -> Google DRIVE (Pro = traffic aware) / Mapbox driving-traffic
 *     walking -> Google WALK  (no Pro, no traffic)  / Mapbox walking
 *   Cached answers are kept per mode, so a walker and a driver never share a number.
 *
 * TIERS (spend the FREE monthly allowances in this order)
 *   GOOGLE_TIER_ORDER=pro,essentials,mapbox,legacy   (default)
 *     pro        Google Routes API, TRAFFIC_AWARE   (5,000 free / month / API)   driving only
 *     essentials Google Routes API, TRAFFIC_UNAWARE (10,000 free)
 *     mapbox     Mapbox Directions / Matrix: driving-traffic (live traffic where covered,
 *                plain driving where it is not, e.g. Nigeria) or walking. 100,000 free / month
 *     legacy     Google Directions / Distance Matrix (Legacy) (10,000 free)
 *   Every call first asks utils/googleUsage.js for a unit of that SKU's
 *   allowance (requests for Routes, ELEMENTS for Matrix). When a SKU reaches
 *   its INTERNAL limit (default 90% of the free cap) the next tier is used.
 *   A Matrix batch is SPLIT across tiers, so no free element is wasted.
 *   FAILOVER: if a provider FAILS (timeout, 5xx, 429), the next tier of the OTHER
 *   provider answers instead (Google down -> Mapbox, Mapbox down -> Google).
 *   When every free pool is used up:
 *     GOOGLE_ALLOW_PAID=false (default) -> Haversine (distancePolicy decides)
 *     GOOGLE_ALLOW_PAID=true            -> GOOGLE_OVERFLOW_TIER keeps serving
 *                                          and the provider bills it.
 *
 * PROTECTIONS:
 *   - Stage deadline : stop starting calls when a stage's time budget
 *                      is nearly used up (opts.deadlineAt).
 *   - Circuit breaker: PER PROVIDER. After repeated failures (or a 429) stop calling
 *                      THAT provider for a while; the other one keeps serving.
 *   - Cache TTL      : cached answers expire (default 5 min).
 *   - Lazy env       : config is read at CALL time.
 *   - "API not enabled" / bad token: a 403 / REQUEST_DENIED / 401 is NOT an outage.
 *                      That API family is skipped for a while and the next tier is tried;
 *                      nothing is counted as used because it was not billed.
 *
 * TEST SWITCH (dev only):
 *   DISTANCE_MODE=auto       (default) cache -> Google -> Haversine
 *   DISTANCE_MODE=haversine  never touch Google (no key needed)
 *   DISTANCE_MODE=google     same as auto (kept for clarity; "mapbox" is accepted as an old alias)
 *   Can be changed at runtime with POST /match-dev/route-mode.
 *
 * Needs Node 18+ (global fetch).
 * ============================================================
 */

/** The matcher uses the TIER chain above. (Shown in the console comparison log.) */
export const PRIMARY_PROVIDER = "tiered";

const CACHE_MAX = 500; // hard cap on cached pairs
const MIN_GOOGLE_CALL_MS = 300; // never START a Google call with less time than this left
const LEGACY_MATRIX_CHUNK = 25; // Distance Matrix (Legacy): max 25 origins per request
const V2_MATRIX_CHUNK = 100; // Compute Route Matrix: well under its element limits
const FAMILY_SKIP_MS = Number(process.env.GOOGLE_FAMILY_SKIP_MS || 10 * 60 * 1000);

const ROUTES_V2_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_V2_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const LEGACY_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const LEGACY_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

const TIER_NAMES = ["pro", "essentials", "mapbox", "legacy"];
const MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox";
const MAPBOX_MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox";
const MAPBOX_PROFILES = { DRIVE: "driving-traffic", WALK: "walking", BICYCLE: "cycling" };

/** Which provider a SKU belongs to (each has its own circuit breaker). */
const providerOf = (sku) => (SKUS[sku].family === "mapbox" ? "mapbox" : "google");

/** Read config at call time. */
function cfg(opts = {}) {
  // The scientist's declared mode ("driving" | "walking") wins; otherwise GOOGLE_TRAVEL_MODE.
  let mode = opts.travelMode
    ? normalizeTravelMode(opts.travelMode) === "walking" ? "WALK" : "DRIVE"
    : String(process.env.GOOGLE_TRAVEL_MODE || "DRIVE").toUpperCase();
  if (!["DRIVE", "WALK", "BICYCLE"].includes(mode)) {
    // TWO_WHEELER is billed as an ENTERPRISE feature (only 1,000 free/month,
    // and Legacy cannot do it), so it is not supported by this free-tier router.
    if (!warnedMode) {
      warnedMode = true;
      console.warn(`LABLY GOOGLE_TRAVEL_MODE=${mode} is not supported here, using DRIVE`);
    }
    mode = "DRIVE";
  }
  const order = String(process.env.GOOGLE_TIER_ORDER || "pro,essentials,mapbox,legacy")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s, i, a) => TIER_NAMES.includes(s) && a.indexOf(s) === i);
  const overflow = String(process.env.GOOGLE_OVERFLOW_TIER || "essentials").trim().toLowerCase();
  return {
    key: process.env.GOOGLE_MAPS_API_KEY || "",
    mapboxToken: mapboxToken(),
    // driving -> driving-traffic (or MAPBOX_PROFILE=driving to turn traffic off), walking -> walking
    mapboxProfile:
      mode === "DRIVE"
        ? String(process.env.MAPBOX_PROFILE || "driving-traffic").toLowerCase() === "driving"
          ? "driving"
          : "driving-traffic"
        : MAPBOX_PROFILES[mode] || "driving",
    travelMode: mode,
    modeName: mode === "WALK" ? "walking" : "driving",
    timeoutMs: Number(process.env.GOOGLE_TIMEOUT_MS || 2500),
    // CACHE TTL: how long a measured pair is trusted (default 5 minutes)
    cacheTtlMs: Number(process.env.GOOGLE_CACHE_TTL_MS || 5 * 60 * 1000),
    // CIRCUIT BREAKER: open after N consecutive failures, for this long
    breakerFailures: Number(process.env.GOOGLE_BREAKER_FAILURES || 3),
    breakerOpenMs: Number(process.env.GOOGLE_BREAKER_OPEN_MS || 60 * 1000),
    order: order.length ? order : ["pro", "essentials", "mapbox", "legacy"],
    allowPaid: String(process.env.GOOGLE_ALLOW_PAID || "").toLowerCase() === "true",
    overflowTier: TIER_NAMES.includes(overflow) ? overflow : "essentials",
  };
}
let warnedMode = false;

// ---------------------------------------------------------------
// GOOGLE HEALTH LISTENER
// ---------------------------------------------------------------
// Tracks whether Google is "essentially down" and announces CHANGES only.
//   state "up"      Google answered (startup probe or any real call)
//   state "down"    circuit breaker tripped (3 failures in a row, a 429),
//                   no key configured, or BOTH API families denied the key
//   state "off"     DISTANCE_MODE=haversine: Google bypassed on purpose
// index.js listens:   googleEvents.on("status", ({state, reason, previous}) => ...)
//
// RECOVERY: while the breaker is open no real calls happen, so we schedule ONE
// probe right after the pause ends. Cost: 1 request per pause, plus 1 at
// startup (the first checkGoogle() call of the process honours
// GOOGLE_STARTUP_PROBE=false; later calls, e.g. POST /match-dev/google-check,
// always probe). Probes spend a real unit of the free allowance and are
// counted in the ledger like any other call.
export const googleEvents = new EventEmitter();

let googleState = { state: "unknown", reason: "not checked yet", since: Date.now() };
let recheckTimer = null;
let probedOnce = false;

function setGoogleState(state, reason) {
  if (googleState.state === state && googleState.reason === reason) return googleState;
  const previous = googleState.state;
  googleState = { state, reason, since: Date.now() };
  googleEvents.emit("status", { ...googleState, previous });
  return googleState;
}

/** Called after any successful Google answer. Announces only on a change. */
function markUp(reason = "responding") {
  if (googleState.state !== "up") {
    setGoogleState("up", googleState.state === "down" ? `recovered: ${reason}` : reason);
  }
}

function scheduleRecheck(ms) {
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => {
    recheckTimer = null;
    probe().catch(() => {});
  }, ms + 250);
  recheckTimer.unref?.(); // never keep the process alive just for a probe
}

export function getGoogleStatus() {
  return { ...googleState };
}

// ---------------------------------------------------------------
// MAPBOX HEALTH LISTENER (same idea as Google's, announces CHANGES only)
// ---------------------------------------------------------------
//   state "up"    a Mapbox call answered
//   state "down"  token missing / rejected, or its circuit breaker tripped
// index.js listens:   mapboxEvents.on("status", ({state, reason, previous}) => ...)
export const mapboxEvents = new EventEmitter();
let mapboxState = { state: "unknown", reason: "not checked yet", since: Date.now() };

function setMapboxState(state, reason) {
  if (mapboxState.state === state && mapboxState.reason === reason) return mapboxState;
  const previous = mapboxState.state;
  mapboxState = { state, reason, since: Date.now() };
  mapboxEvents.emit("status", { ...mapboxState, previous });
  return mapboxState;
}

function markMapboxUp(reason = "responding") {
  if (mapboxState.state !== "up") setMapboxState("up", mapboxState.state === "down" ? `recovered: ${reason}` : reason);
}

export function getMapboxStatus() {
  return { ...mapboxState };
}

/** A successful answer from this SKU's provider marks THAT provider healthy. */
function markProviderUp(sku, reason) {
  if (providerOf(sku) === "mapbox") markMapboxUp(reason);
  else markUp(reason);
}

/** Probe Mapbox now (startup, or POST /match-dev/mapbox-check). Costs 1 Mapbox request. */
export async function checkMapbox() {
  const c = cfg();
  if (currentMode() === "haversine") return setMapboxState("down", "DISTANCE_MODE=haversine (Mapbox bypassed)");
  if (!c.mapboxToken) return setMapboxState("down", "MAPBOX_ACCESS_TOKEN is not set");
  if (!(await reserve("routes_mapbox", 1))) return getMapboxStatus();
  try {
    stats.probes += 1;
    await fetchDirectionsMapbox(PROBE_A, PROBE_B, c, c.timeoutMs);
    resetBreaker("mapbox");
    markMapboxUp("probe ok");
  } catch (err) {
    if (err?.refund) await refund("routes_mapbox", 1, 1);
    if (err?.noRoute) markMapboxUp("probe answered");
    else if (err?.denied) setMapboxState("down", err.message);
    else setMapboxState("down", err?.message || "probe failed");
  }
  return getMapboxStatus();
}

const PROBE_A = { lat: 6.4541, lng: 3.3947 };
const PROBE_B = { lat: 6.455, lng: 3.3955 };

/**
 * Probe Google now (startup, after a breaker pause, or POST /match-dev/google-check).
 * Ignores the breaker on purpose: its job is to find out if Google is back.
 */
export async function checkGoogle() {
  const first = !probedOnce;
  probedOnce = true;
  if (first && String(process.env.GOOGLE_STARTUP_PROBE || "true").toLowerCase() === "false") {
    return getGoogleStatus(); // startup probe disabled (saves 1 request per nodemon restart)
  }
  return probe();
}

async function probe() {
  const c = cfg();
  if (currentMode() === "haversine") {
    return setGoogleState("off", "DISTANCE_MODE=haversine");
  }
  if (!c.key) {
    return setGoogleState("down", "GOOGLE_MAPS_API_KEY is not set");
  }
  try {
    stats.probes += 1;
    // Google tiers only: a Mapbox answer must never mark GOOGLE healthy
    const out = await tieredDirections(PROBE_A, PROBE_B, { ...c, order: c.order.filter((t) => t !== "mapbox") }, {});
    if (!out) {
      // Nothing to probe with (every free pool is used and paid overflow is off,
      // or every API family is currently skipped). That is not an outage.
      return getGoogleStatus();
    }
    resetBreaker("google");
    markUp("probe ok");
  } catch (err) {
    if (err?.noRoute) {
      // Google answered ("no route" for the probe points), so it is reachable
      resetBreaker("google");
      markUp("probe answered");
    } else {
      stats.googleFailures += 1;
      tripBreaker(err?.retryAfterMs || c.breakerOpenMs, err?.message || "probe failed");
    }
  }
  return getGoogleStatus();
}

// ---------------------------------------------------------------
// TEST SWITCH + USAGE COUNTERS (so you can SEE google vs haversine)
// ---------------------------------------------------------------
let modeOverride = null; // null = use env, else "auto" | "haversine" | "google"

function normalizeMode(m) {
  return m === "mapbox" ? "google" : m; // old name still accepted
}

function currentMode() {
  const m = normalizeMode(modeOverride || process.env.DISTANCE_MODE || "auto");
  return ["auto", "haversine", "google"].includes(m) ? m : "auto";
}

// In-process counters since boot / last reset. The MONTHLY per-SKU numbers
// (what Google bills on) live in utils/googleUsage.js, see routeStatus().
const stats = {
  cacheHits: 0,
  directionsRequests: 0, // HTTP calls to Compute Routes / Directions (any tier)
  matrixRequests: 0, // HTTP calls to Compute Route Matrix / Distance Matrix (any tier)
  matrixElements: 0, // origin x destination pairs sent to Matrix (what Matrix is billed on)
  probes: 0,
  googleFailures: 0,
  haversineUsed: 0, // pairs answered by Haversine
};

/** Current mode ("auto" | "haversine" | "google"), after the runtime override. */
export function getDistanceMode() {
  return currentMode();
}

export function setDistanceMode(mode) {
  const m = normalizeMode(mode);
  if (!["auto", "haversine", "google", null, undefined].includes(m)) {
    throw new Error('mode must be "auto", "haversine" or "google"');
  }
  modeOverride = m ?? null;
  if (currentMode() === "haversine") {
    setGoogleState("off", "DISTANCE_MODE=haversine");
  } else if (googleState.state === "off") {
    probe().catch(() => {}); // leaving haversine mode: re-probe
  }
}

/** Clears cache, breaker, API-family skips and counters (dev/testing). NOT the monthly usage ledger. */
export function resetRouteState() {
  if (recheckTimer) clearTimeout(recheckTimer);
  recheckTimer = null;
  cache.clear();
  resetBreaker("google");
  resetBreaker("mapbox");
  mapboxState = { state: "unknown", reason: "not checked yet", since: Date.now() };
  for (const f of Object.values(families)) {
    f.skipUntil = 0;
    f.reason = "";
  }
  for (const k of Object.keys(stats)) stats[k] = 0;
}

// ---------------------------------------------------------------
// CACHE (with TTL)
// ---------------------------------------------------------------
// WHY IT EXISTS
//   One search asks about the same pair (scientist -> patient,
//   scientist -> hub) in several stages. We measure a pair once,
//   remember it, and reuse it, so Google is hit once per pair, not
//   once per stage. It is also what makes the free allowances last.
//
// TTL = "time to live"
//   Every entry stores expiresAt = now + ttl (default 5 min).
//   - WITHOUT a TTL an entry lived until 500 newer ones pushed it out.
//     On a quiet server that can be days: stale after road closures, and
//     long-term storage of Google results is restricted by Google's terms.
//     Keep this short (minutes), never days.
//   - 5 min is far longer than one 48s search, short enough that stale data
//     doesn't linger. A scientist who moves gets a NEW key anyway (rounded
//     coordinates change); the TTL is the safety net for everything else.
//   - Expired entries are deleted lazily in cacheGet() and in bulk in
//     cacheSet() when the cache is full. No background timer is needed.
//
// KEY IS DIRECTIONAL (from -> to)
//   One-way streets mean A->B can differ from B->A. The scientist travels
//   scientist -> patient, so that is the direction we store and ask for.
//   Coordinates are rounded to 5 decimals (about 1 metre).
// ---------------------------------------------------------------
const cache = new Map(); // key -> { meters, seconds, expiresAt }

function cacheKey(from, to, mode = "DRIVE") {
  const f = `${Number(from.lng).toFixed(5)},${Number(from.lat).toFixed(5)}`;
  const t = `${Number(to.lng).toFixed(5)},${Number(to.lat).toFixed(5)}`;
  return `${mode}|${f};${t}`; // per travel mode: a walker and a driver never share a number
}

/** Returns { meters, seconds, source, traffic }, or null if missing or expired (expired entries are deleted). */
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key); // TTL expired -> treat as a miss, measure again
    return null;
  }
  return { meters: hit.meters, seconds: hit.seconds, source: hit.source, traffic: hit.traffic };
}

function cacheSet(key, { meters, seconds, source, traffic }, ttlMs) {
  if (cache.size >= CACHE_MAX) {
    // 1) free space by dropping anything already expired
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
    // 2) still full -> drop the oldest entry (Map keeps insertion order)
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  cache.set(key, { meters, seconds, source, traffic, expiresAt: Date.now() + ttlMs });
}

/**
 * Shape every successful answer the same way (seconds may be unknown).
 *   source     "google" | "mapbox"  (who measured it; a cache hit keeps the original)
 *   travelMode "driving" | "walking" (the mode it was measured in)
 *   traffic    "aware" | "unaware" | "n/a" (walking)
 */
function answer(meters, seconds, sku, c, extra = {}) {
  const s = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : undefined;
  const fromCache = sku === "cache";
  return {
    meters,
    km: meters / 1000,
    seconds: s,
    minutes: s == null ? undefined : s / 60,
    source: fromCache ? extra.source || "google" : providerOf(sku),
    sku,
    travelMode: c.modeName,
    traffic: extra.traffic || "unaware",
  };
}

/** Does this SKU's answer use live traffic? (Pro on DRIVE; Mapbox driving-traffic.) */
function trafficOf(sku, c, mapboxTraffic) {
  if (c.travelMode !== "DRIVE") return "n/a";
  if (providerOf(sku) === "mapbox") return mapboxTraffic ? "aware" : "unaware";
  return SKUS[sku].tier === "pro" ? "aware" : "unaware";
}

/** Straight-line answer (no real duration, no traffic). */
function haversineAnswer(a, b, c) {
  const meters = haversineM(a, b);
  return {
    meters,
    km: meters / 1000,
    seconds: undefined,
    minutes: undefined,
    source: "haversine",
    travelMode: c.modeName,
    traffic: "n/a",
  };
}

// ---------------------------------------------------------------
// CIRCUIT BREAKER
// ---------------------------------------------------------------
// Closed = Google allowed. Open = skip Google, go straight to Haversine.
// Opens after N consecutive failures, or immediately on a 429 (rate limit).
// Closes by itself when the pause is over. A denied API (403 / REQUEST_DENIED)
// does NOT use the breaker, see "API FAMILIES" below.
// One breaker PER PROVIDER: Google failing never stops Mapbox from answering, and vice versa.
const breakers = {
  google: { fails: 0, openUntil: 0 },
  mapbox: { fails: 0, openUntil: 0 },
};

function breakerIsOpen(provider = "google") {
  return Date.now() < breakers[provider].openUntil;
}

function resetBreaker(provider) {
  breakers[provider].fails = 0;
  breakers[provider].openUntil = 0;
}

function tripBreaker(ms, why, provider = "google") {
  breakers[provider].openUntil = Date.now() + ms;
  breakers[provider].fails = 0;
  const name = provider === "mapbox" ? "Mapbox" : "Google";
  console.warn(`LABLY ${name} circuit OPEN for ${Math.round(ms / 1000)}s (${why}) -> the other provider / Haversine`);
  if (provider === "mapbox") {
    setMapboxState("down", why);
  } else {
    setGoogleState("down", why); // announce (index.js prints it)
    scheduleRecheck(ms); // probe once the pause is over
  }
}

function noteFailure(c, err, provider = "google") {
  stats.googleFailures += 1;
  // 429 carries its own pause length
  if (err?.retryAfterMs) return tripBreaker(err.retryAfterMs, err.message, provider);
  breakers[provider].fails += 1;
  if (breakers[provider].fails >= c.breakerFailures) {
    tripBreaker(c.breakerOpenMs, err?.message || "repeated failures", provider);
  }
}

/** Pause length after a 429, from the Retry-After header if present (clamped 1s..120s). */
function rateLimitPauseMs(res, fallbackMs) {
  const retryAfter = Number(res.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.max(retryAfter * 1000, 1000), 120_000);
  }
  return fallbackMs;
}

// ---------------------------------------------------------------
// API FAMILIES: "Routes API" (pro + essentials) vs "Legacy" (Directions + Distance Matrix)
// ---------------------------------------------------------------
// A project may have one family disabled (e.g. new projects cannot enable the
// Legacy APIs). That is a CONFIGURATION state, not an outage: Google answers
// 403 / REQUEST_DENIED and bills nothing. We skip that family for a while and
// carry on with the next tier. If BOTH are denied the key/project is wrong.
const families = {
  routesV2: { skipUntil: 0, reason: "" },
  legacy: { skipUntil: 0, reason: "" },
  mapbox: { skipUntil: 0, reason: "" },
};

function familySkipped(name) {
  return Date.now() < families[name].skipUntil;
}

function skipFamily(name, reason) {
  const f = families[name];
  const wasSkipped = familySkipped(name);
  f.skipUntil = Date.now() + FAMILY_SKIP_MS;
  if (name === "mapbox") {
    // a rejected Mapbox token is a configuration problem, announced once like Google's
    if (!wasSkipped) console.warn(`LABLY Mapbox skipped for ${Math.round(FAMILY_SKIP_MS / 60000)} min: ${reason}`);
    f.reason = reason;
    setMapboxState("down", reason);
    return;
  }
  f.reason = reason;
  if (!wasSkipped) {
    console.warn(
      `LABLY Google ${name === "routesV2" ? "Routes API" : "Legacy APIs"} skipped for ` +
        `${Math.round(FAMILY_SKIP_MS / 60000)} min: ${reason}`
    );
  }
  if (familySkipped("routesV2") && familySkipped("legacy")) {
    setGoogleState("down", "every Google API is denied for this key (enable Routes API; check key restrictions)");
  }
}

function familyLabel(name) {
  const f = families[name];
  if (!familySkipped(name)) return "ok";
  return `skipped for ${Math.ceil((f.skipUntil - Date.now()) / 1000)}s: ${f.reason}`;
}

// ---------------------------------------------------------------
// TIER PLAN
// ---------------------------------------------------------------
/** Ordered SKUs to try for "routes" (Directions) or "matrix". */
function tierPlan(kind, c) {
  return c.order
    .filter((tier) => !(tier === "pro" && c.travelMode !== "DRIVE")) // Pro = traffic-aware = DRIVE only
    .map((tier) => `${kind}_${tier}`);
}

/** May we call this SKU's provider right now? (credentials, DISTANCE_MODE, breaker, API family) */
function skuAllowed(sku, c) {
  if (currentMode() === "haversine") return false;
  if (SKUS[sku].family === "legacy" && !c.key) return false;
  if (providerOf(sku) === "mapbox") {
    if (!c.mapboxToken || breakerIsOpen("mapbox")) return false;
  } else if (!c.key || breakerIsOpen("google")) {
    return false;
  }
  return !familySkipped(SKUS[sku].family);
}

/** The SKU to use when every free pool is used up and GOOGLE_ALLOW_PAID=true. */
function overflowSku(kind, c) {
  if (!c.allowPaid) return null;
  const tier = c.overflowTier === "pro" && c.travelMode !== "DRIVE" ? "essentials" : c.overflowTier;
  const sku = `${kind}_${tier}`;
  return familySkipped(SKUS[sku].family) ? null : sku;
}

/**
 * How long may THIS call wait? = min(normal timeout, time left in the stage).
 * `shortened` is true when OUR stage budget (not Google's normal timeout)
 * was the limit. See docs/FEATURES.md F18 for why that matters.
 */
function callTimeout(c, opts) {
  const remaining =
    opts.deadlineAt != null ? opts.deadlineAt - Date.now() : Infinity;
  const timeoutMs = Math.min(c.timeoutMs, remaining);
  return { timeoutMs, shortened: timeoutMs < c.timeoutMs };
}

/** Can we call Google right now? (key set, mode allows it, breaker closed) */
function googleAllowed(c) {
  return currentMode() !== "haversine" && c.order.some((t) => skuAllowed(`routes_${t}`, c) || skuAllowed(`matrix_${t}`, c));
}

// ---------------------------------------------------------------
// LOW-LEVEL HTTP (one function per API)
// ---------------------------------------------------------------
// Error flags used by the callers:
//   err.denied       API not enabled / key rejected  -> skip the family, try next tier
//   err.refund       Google rejected the request, nothing was billed -> give the unit back
//   err.retryAfterMs 429 / OVER_QUERY_LIMIT           -> open the breaker for this long
//   err.noRoute      Google answered, there is just no route (billed, not a failure)
// Timeouts / network errors / 5xx keep the reservation: Google may have billed it.
function googleError(message, flags = {}) {
  return Object.assign(new Error(message), flags);
}

async function withTimeout(timeoutMs, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Status handling for the Routes API (v2). The key is sent in a header, never in the URL. */
async function throwIfBadStatusV2(res, c, label) {
  if (res.ok) return;
  let detail = "";
  try {
    const body = await res.clone().json();
    const e = Array.isArray(body) ? body[0]?.error : body?.error;
    detail = e?.message ? ` - ${e.message}` : "";
  } catch {
    /* body wasn't JSON; fall back to the bare status */
  }
  if (res.status === 429) {
    throw googleError(`${label} HTTP 429 (rate limited)`, {
      retryAfterMs: rateLimitPauseMs(res, c.breakerOpenMs),
      refund: true,
    });
  }
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(detail))) {
    throw googleError(`${label} HTTP ${res.status}${detail} (is the Routes API enabled for this key?)`, {
      denied: true,
      refund: true,
    });
  }
  throw googleError(`${label} HTTP ${res.status}${detail}`, { refund: res.status < 500 });
}

function latLng(p) {
  return { latitude: Number(p.lat), longitude: Number(p.lng) };
}

/** "123s" / "123.4s" -> 123 */
function parseDuration(d) {
  if (typeof d === "number") return d;
  if (typeof d !== "string") return undefined;
  const n = parseFloat(d);
  return Number.isFinite(n) ? n : undefined;
}

function routesPreference(tier, mode) {
  if (mode !== "DRIVE") return undefined; // routingPreference is only valid for DRIVE
  return tier === "pro" ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE";
}

function v2Headers(c, fieldMask) {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": c.key,
    "X-Goog-FieldMask": fieldMask,
  };
}

/** Compute Routes (Routes API v2), ONE pair. tier: "pro" | "essentials". */
async function fetchRoutesV2(a, b, c, tier, timeoutMs) {
  const body = {
    origin: { location: { latLng: latLng(a) } },
    destination: { location: { latLng: latLng(b) } },
    travelMode: c.travelMode,
    computeAlternativeRoutes: false,
  };
  const pref = routesPreference(tier, c.travelMode);
  if (pref) body.routingPreference = pref;

  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(ROUTES_V2_URL, {
      method: "POST",
      headers: v2Headers(c, "routes.distanceMeters,routes.duration"),
      body: JSON.stringify(body),
      signal,
    });
    await throwIfBadStatusV2(res, c, "Google Routes");
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw googleError("Google returned no route", { noRoute: true });
    // protobuf JSON omits zero values (same point -> no distanceMeters)
    return { meters: Number(route.distanceMeters ?? 0), seconds: parseDuration(route.duration) };
  });
}

/** Directions API (Legacy), ONE pair. No departure_time => the basic (cheaper) legacy SKU. */
async function fetchDirectionsLegacy(a, b, c, timeoutMs) {
  const mode = { DRIVE: "driving", WALK: "walking", BICYCLE: "bicycling" }[c.travelMode];
  const params = new URLSearchParams({
    origin: `${a.lat},${a.lng}`,
    destination: `${b.lat},${b.lng}`,
    mode,
    key: c.key, // the Legacy APIs only accept the key as a query parameter (server-side, never logged)
  });
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${LEGACY_DIRECTIONS_URL}?${params}`, { signal });
    if (!res.ok) throw googleError(`Google Directions (Legacy) HTTP ${res.status}`, { refund: res.status < 500 });
    const data = await res.json();
    throwIfBadLegacyStatus(data, c, "Google Directions (Legacy)");
    const leg = data?.routes?.[0]?.legs?.[0];
    if (typeof leg?.distance?.value !== "number") {
      throw googleError("Google returned no route", { noRoute: true });
    }
    return { meters: leg.distance.value, seconds: leg.duration?.value };
  });
}

/** Legacy APIs report errors in the JSON "status" field, with HTTP 200. */
function throwIfBadLegacyStatus(data, c, label) {
  const status = data?.status;
  if (status === "OK") return;
  if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
    throw googleError("Google returned no route", { noRoute: true });
  }
  const msg = data?.error_message ? ` - ${data.error_message}` : "";
  if (status === "REQUEST_DENIED") {
    throw googleError(`${label} REQUEST_DENIED${msg}`, { denied: true, refund: true });
  }
  if (status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") {
    throw googleError(`${label} ${status}${msg}`, { retryAfterMs: c.breakerOpenMs, refund: true });
  }
  throw googleError(`${label} ${status || "bad response"}${msg}`, { refund: status === "INVALID_REQUEST" });
}

/** Compute Route Matrix (Routes API v2): many origins -> ONE destination. */
async function fetchMatrixV2(origins, dest, c, tier, timeoutMs) {
  const wp = (p) => ({ waypoint: { location: { latLng: latLng(p) } } });
  const body = {
    origins: origins.map(wp),
    destinations: [wp(dest)],
    travelMode: c.travelMode,
  };
  const pref = routesPreference(tier, c.travelMode);
  if (pref) body.routingPreference = pref;

  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(MATRIX_V2_URL, {
      method: "POST",
      headers: v2Headers(c, "originIndex,destinationIndex,distanceMeters,duration,condition"),
      body: JSON.stringify(body),
      signal,
    });
    await throwIfBadStatusV2(res, c, "Google Route Matrix");
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw googleError("Google Route Matrix bad response");
    }
    // Elements come back in any order; protobuf JSON omits originIndex 0.
    const rows = new Array(origins.length).fill(null);
    for (const el of data) {
      const i = el?.originIndex ?? 0;
      if (i < 0 || i >= origins.length) continue;
      if (el.condition && el.condition !== "ROUTE_EXISTS") continue; // no route: Haversine below
      rows[i] = { meters: Number(el.distanceMeters ?? 0), seconds: parseDuration(el.duration) };
    }
    return rows;
  });
}

/** Distance Matrix (Legacy): many origins (max 25) -> ONE destination. */
async function fetchMatrixLegacy(origins, dest, c, timeoutMs) {
  const mode = { DRIVE: "driving", WALK: "walking", BICYCLE: "bicycling" }[c.travelMode];
  const params = new URLSearchParams({
    origins: origins.map((p) => `${p.lat},${p.lng}`).join("|"),
    destinations: `${dest.lat},${dest.lng}`,
    mode,
    key: c.key,
  });
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${LEGACY_MATRIX_URL}?${params}`, { signal });
    if (!res.ok) throw googleError(`Google Distance Matrix (Legacy) HTTP ${res.status}`, { refund: res.status < 500 });
    const data = await res.json();
    throwIfBadLegacyStatus(data, c, "Google Distance Matrix (Legacy)");
    if (!Array.isArray(data?.rows)) throw googleError("Google Distance Matrix (Legacy) bad response");
    return data.rows.map((row) => {
      const el = row?.elements?.[0];
      if (el?.status !== "OK" || typeof el?.distance?.value !== "number") return null;
      return { meters: el.distance.value, seconds: el.duration?.value };
    });
  });
}

// ---------------------------------------------------------------
// MAPBOX (one function per API). Same error flags as the Google ones.
// ---------------------------------------------------------------
async function mapboxJson(res, label, c) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.status === 429) {
    const pause = rateLimitPauseMs(res, c.breakerOpenMs);
    throw googleError(`${label} HTTP 429 (rate limited)`, { retryAfterMs: pause, refund: true });
  }
  if (res.status === 401 || res.status === 403) {
    throw googleError(`${label} HTTP ${res.status} ${data.message || ""} (check MAPBOX_ACCESS_TOKEN)`.trim(), {
      denied: true,
      refund: true,
    });
  }
  if (!res.ok || (data.code && data.code !== "Ok")) {
    if (data.code === "NoRoute" || data.code === "NoSegment") throw googleError("Mapbox returned no route", { noRoute: true });
    // traffic profile unavailable here -> the caller retries with plain driving
    const profileProblem = res.status === 422 || res.status === 404 || /profile/i.test(`${data.code} ${data.message}`);
    throw googleError(`${label} HTTP ${res.status} ${data.code || ""} ${data.message || ""}`.trim(), {
      refund: res.status < 500,
      profileProblem,
    });
  }
  return data;
}

const lonLat = (p) => `${Number(p.lng)},${Number(p.lat)}`;

/**
 * Runs `once(profile)`. If Mapbox rejects the driving-traffic profile (traffic data is not
 * available everywhere, e.g. Nigeria) it retries with plain "driving" and flags traffic=false.
 */
async function withTrafficFallback(c, once) {
  try {
    return { ...(await once(c.mapboxProfile)), traffic: c.mapboxProfile === "driving-traffic" };
  } catch (err) {
    if (err?.profileProblem && c.mapboxProfile === "driving-traffic") {
      return { ...(await once("driving")), traffic: false };
    }
    throw err;
  }
}

/** Mapbox Directions, ONE pair. */
async function fetchDirectionsMapbox(a, b, c, timeoutMs) {
  return withTrafficFallback(c, (profile) =>
    withTimeout(timeoutMs, async (signal) => {
      const url =
        `${MAPBOX_DIRECTIONS_URL}/${profile}/${lonLat(a)};${lonLat(b)}` +
        `?overview=false&alternatives=false&access_token=${encodeURIComponent(c.mapboxToken)}`;
      const res = await fetch(url, { signal });
      const data = await mapboxJson(res, "Mapbox Directions", c);
      const r = data.routes?.[0];
      if (!r) throw googleError("Mapbox returned no route", { noRoute: true });
      return { meters: Number(r.distance), seconds: Number(r.duration) };
    })
  );
}

/** Origins per Mapbox Matrix request: 10 coordinates for driving-traffic, 25 otherwise (one is the destination). */
const mapboxChunkSize = (c) => (c.mapboxProfile === "driving-traffic" ? 10 : 25) - 1;

/** Mapbox Matrix: many origins (chunked by the caller) -> ONE destination. Rows parallel to `origins`. */
async function fetchMatrixMapbox(origins, dest, c, timeoutMs) {
  return withTrafficFallback(c, (profile) =>
    withTimeout(timeoutMs, async (signal) => {
      const coords = [...origins.map(lonLat), lonLat(dest)].join(";");
      const sources = origins.map((_, i) => i).join(";");
      const url =
        `${MAPBOX_MATRIX_URL}/${profile}/${coords}` +
        `?sources=${sources}&destinations=${origins.length}&annotations=distance,duration` +
        `&access_token=${encodeURIComponent(c.mapboxToken)}`;
      const res = await fetch(url, { signal });
      const data = await mapboxJson(res, "Mapbox Matrix", c);
      if (!Array.isArray(data.distances) || !Array.isArray(data.durations)) {
        throw googleError("Mapbox Matrix bad response");
      }
      const rows = origins.map((_, i) => {
        const m = data.distances[i]?.[0];
        const sec = data.durations[i]?.[0];
        // null = Mapbox found no route for this origin (billed): Haversine below
        return typeof m === "number" ? { meters: m, seconds: typeof sec === "number" ? sec : undefined } : null;
      });
      return { rows };
    })
  );
}

// ---------------------------------------------------------------
// TIERED DIRECTIONS (one pair)
// ---------------------------------------------------------------
/**
 * Walks the tier plan (pro -> essentials -> mapbox -> legacy). Returns
 * { meters, seconds, sku, traffic }, or null when no tier could be used (all free
 * pools used up and paid overflow off, or every API family is skipped).
 *
 * FAILOVER: a REAL failure (timeout, 5xx, 429) counts against that provider's breaker and
 * the next tier of the OTHER provider is tried. A "no route" answer is a real answer and
 * ends the walk. Throws only when every usable tier failed, or the stage budget ran out.
 */
async function tieredDirections(a, b, c, opts) {
  const attempt = async (sku, force, timeoutMs) => {
    const def = SKUS[sku];
    const granted = await reserve(sku, 1, { force });
    if (!granted) return null; // this SKU is at its internal limit
    stats.directionsRequests += 1;
    try {
      const out =
        def.family === "legacy"
          ? await fetchDirectionsLegacy(a, b, c, timeoutMs)
          : def.family === "mapbox"
            ? await fetchDirectionsMapbox(a, b, c, timeoutMs)
            : await fetchRoutesV2(a, b, c, def.tier, timeoutMs);
      resetBreaker(providerOf(sku));
      markProviderUp(sku);
      return { meters: out.meters, seconds: out.seconds, sku, traffic: trafficOf(sku, c, out.traffic) };
    } catch (err) {
      if (err?.refund) await refund(sku, 1, 1); // not billed
      if (err?.denied) {
        skipFamily(def.family, err.message);
        return null; // try the next tier
      }
      throw err; // timeout / 5xx / 429 / no route: reservation stays
    }
  };

  const failed = new Set(); // providers that failed in THIS call
  let lastErr = null;

  const tryOne = async (sku, force) => {
    const { timeoutMs, shortened } = callTimeout(c, opts);
    if (timeoutMs < MIN_GOOGLE_CALL_MS) return { stop: true };
    try {
      const out = await attempt(sku, force, timeoutMs);
      return out ? { out } : {};
    } catch (err) {
      if (err?.noRoute) throw err; // a real answer: do not shop around
      if (shortened && err?.name === "AbortError") {
        err.budgetCut = true; // OUR stage budget ran out: not evidence the provider is unhealthy
        throw err;
      }
      const prov = providerOf(sku);
      failed.add(prov);
      noteFailure(c, err, prov);
      lastErr = err;
      return {};
    }
  };

  for (const sku of tierPlan("routes", c)) {
    if (failed.has(providerOf(sku)) || !skuAllowed(sku, c)) continue;
    const r = await tryOne(sku, false);
    if (r.out) return r.out;
    if (r.stop) break;
  }

  // Every free pool is used up (or denied). Paid overflow only when asked for.
  const over = lastErr ? null : overflowSku("routes", c);
  if (over && !failed.has(providerOf(over)) && skuAllowed(over, c)) {
    const r = await tryOne(over, true);
    if (r.out) return r.out;
  }
  if (lastErr) throw lastErr;
  return null;
}

// ---------------------------------------------------------------
// PUBLIC: ONE pair  (Compute Routes / Directions)
// ---------------------------------------------------------------
/**
 * @param {{lat:number,lng:number}} a  from
 * @param {{lat:number,lng:number}} b  to
 * @param {{ deadlineAt?: number, travelMode?: "driving"|"walking" }} [opts]
 *   deadlineAt  epoch ms; skip the road APIs if too little time is left
 *   travelMode  the traveller's declared mode (default: GOOGLE_TRAVEL_MODE, i.e. driving)
 * @returns {Promise<{ meters:number, km:number, seconds?:number, minutes?:number,
 *   source:"google"|"mapbox"|"haversine", sku?:string, travelMode:"driving"|"walking",
 *   traffic:"aware"|"unaware"|"n/a" }>}
 *   sku = which allowance paid for it ("routes_pro" ... or "cache"); absent for Haversine
 */
export async function routeDistance(a, b, opts = {}) {
  const c = cfg(opts);
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) {
    return { meters: Infinity, km: Infinity, seconds: Infinity, minutes: Infinity, source: "haversine", travelMode: c.modeName, traffic: "n/a" };
  }

  const key = cacheKey(a, b, c.travelMode);

  // 1) CACHE HIT: skip the APIs entirely, costs nothing
  const cached = cacheGet(key);
  if (cached != null) {
    stats.cacheHits += 1;
    return answer(cached.meters, cached.seconds, "cache", c, cached);
  }

  // 2) ROAD APIs (tiered, with failover)
  if (googleAllowed(c)) {
    const { timeoutMs } = callTimeout(c, opts);
    if (timeoutMs >= MIN_GOOGLE_CALL_MS) {
      try {
        const out = await tieredDirections(a, b, c, opts);
        if (out) {
          cacheSet(key, { meters: out.meters, seconds: out.seconds, source: providerOf(out.sku), traffic: out.traffic }, c.cacheTtlMs);
          return answer(out.meters, out.seconds, out.sku, c, { traffic: out.traffic });
        }
        // null = nothing to spend (pools used up / APIs denied): not a failure
      } catch (err) {
        // A timeout caused by OUR shortened stage budget (F18) is not evidence of a sick provider.
        if (err?.noRoute) markUp("answered (no route)");
        if (!err?.budgetCut && !err?.noRoute) {
          console.warn("LABLY road API failed, Haversine fallback:", err?.message || err);
        }
      }
    }
  }

  // 3) HAVERSINE fallback (not cached, so the APIs are retried once they recover).
  stats.haversineUsed += 1;
  return haversineAnswer(a, b, c);
}

export async function routeDistanceM(a, b, opts) {
  return (await routeDistance(a, b, opts)).meters;
}

export async function routeDistanceKm(a, b, opts) {
  return (await routeDistance(a, b, opts)).km;
}

// ---------------------------------------------------------------
// PUBLIC: MANY origins -> ONE destination  (Matrix)
// ---------------------------------------------------------------
// Flow: cache -> Matrix (cache misses only) -> Haversine for the rest.
// Tiers: the batch is SPLIT across the tier plan: as many origins as the first
// tier still has free ELEMENTS for, then the next tier takes the remainder...
// A chunk that FAILS (timeout / 5xx / 429) is handed to the next tier of the other provider.
// One HTTP call per chunk (Google Legacy: 25 origins, Mapbox: 9 with traffic / 24 without).
// Origins = scientists, destination = patient or hub, because the scientist
// is the one travelling (scientist -> destination).
// ONE travel mode per call: callers batch walkers and drivers separately.
/**
 * @param {{lat:number,lng:number}[]} origins
 * @param {{lat:number,lng:number}} dest
 * @param {{ deadlineAt?: number, travelMode?: "driving"|"walking" }} [opts]
 * @returns {Promise<{meters:number,km:number,seconds?:number,minutes?:number,source:"google"|"mapbox"|"haversine",sku?:string,travelMode:string,traffic:string}[]>} same order as origins
 */
export async function routeDistancesToPoint(origins, dest, opts = {}) {
  const c = cfg(opts);
  const results = new Array(origins.length).fill(null);
  const misses = []; // indices that still need an API

  // 1) bad coordinates -> Infinity ; cache hits -> done ; the rest -> misses
  origins.forEach((o, i) => {
    if (o?.lat == null || o?.lng == null || dest?.lat == null || dest?.lng == null) {
      results[i] = { meters: Infinity, km: Infinity, seconds: Infinity, minutes: Infinity, source: "haversine", travelMode: c.modeName, traffic: "n/a" };
      return;
    }
    const cached = cacheGet(cacheKey(o, dest, c.travelMode));
    if (cached != null) {
      stats.cacheHits += 1;
      results[i] = answer(cached.meters, cached.seconds, "cache", c, cached);
    } else {
      misses.push(i);
    }
  });

  // 2) Matrix for the misses, tier by tier (with failover)
  if (misses.length && googleAllowed(c)) {
    const failedProviders = new Set();

    // Sends ONE tier's share, in parallel chunks. Returns { denied, failed }: origin indices
    // whose chunk was DENIED (API not enabled) or FAILED, so the next tier can take them.
    const runTier = async (sku, idxs, timeoutMs, shortened) => {
      const def = SKUS[sku];
      const prov = providerOf(sku);
      const chunkSize = chunkSizeFor(sku, c);
      const chunks = [];
      for (let k = 0; k < idxs.length; k += chunkSize) chunks.push(idxs.slice(k, k + chunkSize));

      const denied = [];
      const failed = [];
      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            stats.matrixRequests += 1;
            stats.matrixElements += chunk.length;
            const pts = chunk.map((i) => origins[i]);
            let rows;
            let mapboxTraffic = false;
            if (def.family === "legacy") {
              rows = await fetchMatrixLegacy(pts, dest, c, timeoutMs);
            } else if (def.family === "mapbox") {
              const out = await fetchMatrixMapbox(pts, dest, c, timeoutMs);
              rows = out.rows;
              mapboxTraffic = out.traffic;
            } else {
              rows = await fetchMatrixV2(pts, dest, c, def.tier, timeoutMs);
            }
            resetBreaker(prov);
            markProviderUp(sku);
            const traffic = trafficOf(sku, c, mapboxTraffic);
            chunk.forEach((i, n) => {
              const r = rows[n];
              // null = no route for this origin (e.g. couldn't snap to a road). It was still
              // billed; we use Haversine below rather than drop them.
              if (r && typeof r.meters === "number" && r.meters >= 0) {
                cacheSet(cacheKey(origins[i], dest, c.travelMode), { meters: r.meters, seconds: r.seconds, source: prov, traffic }, c.cacheTtlMs);
                results[i] = answer(r.meters, r.seconds, sku, c, { traffic });
              }
            });
          } catch (err) {
            if (err?.refund) await refund(sku, chunk.length, 1); // not billed
            if (err?.denied) {
              skipFamily(def.family, err.message);
              denied.push(...chunk);
              return;
            }
            const budgetCut = shortened && err?.name === "AbortError"; // F18
            if (err?.noRoute) {
              markProviderUp(sku, "answered (no route)");
            } else if (!budgetCut) {
              failedProviders.add(prov);
              noteFailure(c, err, prov);
              failed.push(...chunk);
              console.warn(`LABLY ${prov} Matrix failed, trying the next tier:`, err?.message || err);
            }
          }
        })
      );
      return { denied, failed };
    };

    let pending = misses.slice();

    for (const sku of tierPlan("matrix", c)) {
      if (!pending.length) break;
      if (failedProviders.has(providerOf(sku)) || !skuAllowed(sku, c)) continue;
      const { timeoutMs, shortened } = callTimeout(c, opts);
      if (timeoutMs < MIN_GOOGLE_CALL_MS) break;
      // as many ELEMENTS as this SKU still has free (up to its internal limit)
      const granted = await reserve(sku, pending.length, { chunk: chunkSizeFor(sku, c), partial: true });
      if (!granted) continue;
      const mine = pending.slice(0, granted);
      const rest = pending.slice(granted);
      const { denied, failed } = await runTier(sku, mine, timeoutMs, shortened);
      pending = [...denied, ...failed, ...rest];
    }

    // Every free pool is used up. Paid overflow only when asked for.
    const over = pending.length && !failedProviders.size ? overflowSku("matrix", c) : null;
    if (over && skuAllowed(over, c)) {
      const { timeoutMs, shortened } = callTimeout(c, opts);
      if (timeoutMs >= MIN_GOOGLE_CALL_MS) {
        const granted = await reserve(over, pending.length, { chunk: chunkSizeFor(over, c), partial: true, force: true });
        if (granted) await runTier(over, pending.slice(0, granted), timeoutMs, shortened);
      }
    }
  }

  // 3) Haversine for anything still empty. No real duration without a route.
  origins.forEach((o, i) => {
    if (!results[i]) {
      stats.haversineUsed += 1;
      results[i] = haversineAnswer(o, dest, c);
    }
  });

  return results;
}

/** Origins per Matrix request for this SKU. */
function chunkSizeFor(sku, c) {
  const family = SKUS[sku].family;
  if (family === "legacy") return LEGACY_MATRIX_CHUNK;
  if (family === "mapbox") return mapboxChunkSize(c);
  return V2_MATRIX_CHUNK;
}

// ---------------------------------------------------------------
// DEBUG: GET /match-dev/route-status
// ---------------------------------------------------------------
export async function routeStatus() {
  const c = cfg();
  return {
    mode: currentMode(),
    google: getGoogleStatus(),
    mapbox: getMapboxStatus(),
    googleKeySet: Boolean(c.key),
    mapboxTokenSet: Boolean(c.mapboxToken),
    tierOrder: c.order,
    travelMode: c.travelMode,
    mapboxDrivingProfile: cfg({ travelMode: "driving" }).mapboxProfile,
    allowPaid: c.allowPaid,
    overflowTier: c.overflowTier,
    apiFamilies: {
      routesV2: familyLabel("routesV2"),
      legacy: familyLabel("legacy"),
      mapbox: familyLabel("mapbox"),
    },
    breakers: {
      google: { open: breakerIsOpen("google"), openForMs: Math.max(0, breakers.google.openUntil - Date.now()) },
      mapbox: { open: breakerIsOpen("mapbox"), openForMs: Math.max(0, breakers.mapbox.openUntil - Date.now()) },
    },
    breakerOpen: breakerIsOpen("google"),
    breakerOpenForMs: Math.max(0, breakers.google.openUntil - Date.now()),
    cacheSize: cache.size,
    cacheTtlMs: c.cacheTtlMs,
    stats: { ...stats },
    usage: await getUsageSnapshot(), // monthly, PER SKU: units (requests / matrix elements) + http requests
  };
}
