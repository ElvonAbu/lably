/**
 * tests/googleTiers.test.mjs
 * Offline test of the Google tier order + per-SKU ledger. No network, no real
 * Google calls, no database needed (the ledger uses its in-memory fallback
 * when MongoDB isn't connected).
 *
 *   node --test tests/googleTiers.test.mjs
 *
 * Uses tiny internal limits so "switching tier" happens after a few calls.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_PROVIDERS = "false"; // the Google-vs-Mapbox console comparison is off in offline tests
process.env.GOOGLE_MAPS_API_KEY = "test-key-not-real";
process.env.GOOGLE_STARTUP_PROBE = "false";

const { routeDistance, routeDistancesToPoint, resetRouteState, routeStatus, setDistanceMode } =
  await import("../utils/routeDistance.js");
const usage = await import("../utils/googleUsage.js");

// ---------- fake Google --------------------------------------------------
let calls = [];
let behaviour = {}; // per-test overrides
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: u, body });

  if (u.includes("routes.googleapis.com/directions/v2:computeRoutes")) {
    if (behaviour.routesStatus) return json({ error: { message: "denied", status: "PERMISSION_DENIED" } }, behaviour.routesStatus);
    if (behaviour.abort) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    return json({ routes: [{ distanceMeters: 1500 }] });
  }
  if (u.includes("routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix")) {
    if (behaviour.routesStatus) return json({ error: { message: "denied" } }, behaviour.routesStatus);
    // protobuf JSON omits zero values: originIndex 0 is missing
    return json(
      body.origins.map((_, i) => ({
        ...(i ? { originIndex: i } : {}),
        destinationIndex: 0,
        distanceMeters: 1000 + i,
        condition: "ROUTE_EXISTS",
      }))
    );
  }
  if (u.includes("maps/api/directions/json")) {
    if (behaviour.legacyDenied) return json({ status: "REQUEST_DENIED", error_message: "not enabled" });
    return json({ status: "OK", routes: [{ legs: [{ distance: { value: 2000 } }] }] });
  }
  if (u.includes("maps/api/distancematrix/json")) {
    if (behaviour.legacyDenied) return json({ status: "REQUEST_DENIED" });
    const n = decodeURIComponent(new URL(u).searchParams.get("origins")).split("|").length;
    return json({
      status: "OK",
      rows: Array.from({ length: n }, (_, i) => ({ elements: [{ status: "OK", distance: { value: 3000 + i } }] })),
    });
  }
  throw new Error("unexpected URL " + u);
};

// ---------- helpers ------------------------------------------------------
const LIMIT_KEYS = Object.keys(usage.SKUS).map((s) => `GOOGLE_LIMIT_${s.toUpperCase()}`);
function setup(limits = {}, env = {}) {
  resetRouteState();
  usage.resetMemoryUsage();
  setDistanceMode(null);
  calls = [];
  behaviour = {};
  for (const k of LIMIT_KEYS) delete process.env[k];
  delete process.env.GOOGLE_ALLOW_PAID;
  delete process.env.GOOGLE_TIER_ORDER;
  delete process.env.GOOGLE_TRAVEL_MODE;
  for (const [k, v] of Object.entries(limits)) process.env[`GOOGLE_LIMIT_${k.toUpperCase()}`] = String(v);
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}
let n = 0;
const pt = (i) => ({ lat: 6.4 + i * 0.001, lng: 3.3 + i * 0.001 }); // distinct points => no cache hits
const P = { lat: 6.5, lng: 3.5 };
const skuUnits = async () => Object.fromEntries(Object.entries((await routeStatus()).usage.skus).map(([k, v]) => [k, [v.units, v.httpRequests]]));

// ---------- tests --------------------------------------------------------
test("Directions: pro -> essentials -> legacy -> haversine, switching at the internal limit", async () => {
  setup({ routes_pro: 2, routes_essentials: 1, routes_legacy: 1 });
  const out = [];
  for (let i = 0; i < 5; i++) out.push(await routeDistance(pt(i), P));

  assert.deepEqual(out.map((r) => r.sku ?? r.source), ["routes_pro", "routes_pro", "routes_essentials", "routes_legacy", "haversine"]);
  assert.equal(out[4].source, "haversine"); // pools exhausted -> straight line, nothing billed

  // SKU really requested: Pro = traffic-aware, Essentials = traffic-unaware
  const routes = calls.filter((c) => c.url.includes("computeRoutes"));
  assert.equal(routes[0].body.routingPreference, "TRAFFIC_AWARE");
  assert.equal(routes[2].body.routingPreference, "TRAFFIC_UNAWARE");
  assert.ok(calls[3].url.includes("maps/api/directions/json"));
  assert.equal(calls.length, 4); // the 5th never reached Google

  const u = await skuUnits();
  assert.deepEqual(u.routes_pro, [2, 2]);
  assert.deepEqual(u.routes_essentials, [1, 1]);
  assert.deepEqual(u.routes_legacy, [1, 1]);
});

test("Cache hit costs nothing", async () => {
  setup({ routes_pro: 5 });
  await routeDistance(pt(1), P);
  const again = await routeDistance(pt(1), P);
  assert.equal(again.sku, "cache");
  assert.equal(calls.length, 1);
  assert.deepEqual((await skuUnits()).routes_pro, [1, 1]);
});

test("Matrix: fills pro, then essentials, then legacy, splitting ONE batch across tiers", async () => {
  setup({ matrix_pro: 5, matrix_essentials: 3, matrix_legacy: 4 });
  const origins = Array.from({ length: 10 }, (_, i) => pt(100 + i));
  const r = await routeDistancesToPoint(origins, P);

  assert.deepEqual(
    r.map((x) => x.sku),
    ["matrix_pro", "matrix_pro", "matrix_pro", "matrix_pro", "matrix_pro", "matrix_essentials", "matrix_essentials", "matrix_essentials", "matrix_legacy", "matrix_legacy"]
  );
  assert.equal(r[0].meters, 1000); // originIndex 0 omitted by Google is still read correctly
  assert.equal(r[4].meters, 1004);
  assert.equal(r[8].meters, 3000);
  assert.equal(calls.length, 3); // one HTTP call per tier

  const u = await skuUnits();
  assert.deepEqual(u.matrix_pro, [5, 1]); // [elements, http requests]
  assert.deepEqual(u.matrix_essentials, [3, 1]);
  assert.deepEqual(u.matrix_legacy, [2, 1]);

  // next batch: only 2 legacy elements left, the rest falls to Haversine
  const r2 = await routeDistancesToPoint(Array.from({ length: 10 }, (_, i) => pt(200 + i)), P);
  assert.equal(r2.filter((x) => x.source === "google").length, 2);
  assert.equal(r2.filter((x) => x.source === "haversine").length, 8);
});

test("Matrix: legacy tier is cut into calls of 25 origins", async () => {
  setup({ matrix_legacy: 1000 }, { GOOGLE_TIER_ORDER: "legacy" });
  await routeDistancesToPoint(Array.from({ length: 60 }, (_, i) => pt(300 + i)), P);
  assert.equal(calls.length, 3); // 25 + 25 + 10
  assert.deepEqual((await skuUnits()).matrix_legacy, [60, 3]);
});

test("Routes API denied (403): refunded, Pro+Essentials skipped, Legacy takes over, no global breaker", async () => {
  setup({});
  behaviour = { routesStatus: 403 };
  const r = await routeDistance(pt(400), P);
  assert.equal(r.sku, "routes_legacy");
  const u = await skuUnits();
  assert.deepEqual(u.routes_pro, [0, 0]); // reservation given back: Google never billed it
  assert.deepEqual(u.routes_essentials, [0, 0]);
  const st = await routeStatus();
  assert.equal(st.breakerOpen, false);
  assert.match(st.apiFamilies.routesV2, /skipped/);
});

test("Legacy not available (REQUEST_DENIED) after free Routes pools are used: Haversine, nothing billed, no breaker", async () => {
  setup({ routes_pro: 1, routes_essentials: 0 });
  behaviour = { legacyDenied: true };
  assert.equal((await routeDistance(pt(500), P)).sku, "routes_pro");
  const r = await routeDistance(pt(501), P); // pro full, essentials 0, legacy denied
  assert.equal(r.source, "haversine");
  assert.deepEqual((await skuUnits()).routes_legacy, [0, 0]);
  assert.equal((await routeStatus()).breakerOpen, false);
});

test("A timeout keeps the reservation (Google may have billed it)", async () => {
  setup({ routes_pro: 5 });
  behaviour = { abort: true };
  const r = await routeDistance(pt(600), P);
  assert.equal(r.source, "haversine");
  assert.deepEqual((await skuUnits()).routes_pro, [1, 1]);
});

test("Paid overflow is OFF by default and ON only when asked", async () => {
  setup({ routes_pro: 1, routes_essentials: 1, routes_legacy: 1 });
  for (let i = 0; i < 4; i++) await routeDistance(pt(700 + i), P);
  assert.equal(calls.length, 3); // 4th stayed local

  setup({ routes_pro: 1, routes_essentials: 1, routes_legacy: 1 }, { GOOGLE_ALLOW_PAID: "true" });
  const out = [];
  for (let i = 0; i < 4; i++) out.push(await routeDistance(pt(800 + i), P));
  assert.equal(out[3].sku, "routes_essentials"); // overflow goes to the cheapest tier
  assert.equal(calls.length, 4);
});

test("WALK mode: Pro tier is skipped (it would be billed as Essentials)", async () => {
  setup({}, { GOOGLE_TRAVEL_MODE: "WALK" });
  const r = await routeDistance(pt(900), P);
  assert.equal(r.sku, "routes_essentials");
  assert.equal(calls[0].body.routingPreference, undefined);
});

test("Month key follows Google's Pacific-time reset", () => {
  assert.equal(usage.monthKeyPT(new Date("2026-11-01T06:59:00Z")), "2026-10");
  assert.equal(usage.monthKeyPT(new Date("2026-11-01T07:00:00Z")), "2026-11");
});

test("The Routes API key travels in a header, never in the URL", async () => {
  setup({ routes_pro: 5 });
  await routeDistance(pt(1000), P);
  assert.ok(!calls[0].url.includes("test-key-not-real"));
});
