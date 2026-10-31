// Offline test: walking vs driving scientists share ONE matching system.
//   node --test tests/travelMode.test.mjs
// Fake Google + fake Mapbox (no network), fake database models.
import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_PROVIDERS = "false";
process.env.GOOGLE_MAPS_API_KEY = "test-key";
process.env.UNVERIFIED_POLICY = "strict";
process.env.DISTANCE_MODE = "auto";
process.env.GOOGLE_STARTUP_PROBE = "false";
process.env.MAPBOX_STARTUP_PROBE = "false";
for (const k of ["MATCH_STAGES_MIN", "MATCH_MAX_PATIENT_M", "MATCH_HUB_MAX_M", "GOOGLE_ALLOW_PAID", "GOOGLE_TIER_ORDER", "GOOGLE_TRAVEL_MODE", "MAPBOX_ACCESS_TOKEN", "MAPBOX_PROFILE"]) {
  delete process.env[k];
}

const { notifyNewScientists } = await import("../services/matchingCascade.js");
const { initRealtime } = await import("../services/realtime.js");
const { routeDistance, routeDistancesToPoint, resetRouteState, routeStatus } = await import("../utils/routeDistance.js");
const { resetMemoryUsage } = await import("../utils/googleUsage.js");
const { buildBookingOfferEmail } = await import("../utils/scientistNotify.js");
const { normalizeTravelMode } = await import("../utils/travelMode.js");
const TestRequest = (await import("../models/TestRequest.js")).default;
const ScientistOps = (await import("../models/ScientistOps.js")).default;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

// What each fake provider says. Same place, DIFFERENT answer per mode:
//   driving: 900 m in 90 s      walking: 700 m in 540 s (9 min)
const SAY = { DRIVE: { m: 900, s: 90 }, WALK: { m: 700, s: 540 } };
let HUB_WALK = null; // when set: the walking patient -> hub leg (single Routes call) says this
let calls = []; // { api, mode, pref, profile }
let googleBehaviour = "ok"; // "ok" | "down"
let mapboxBehaviour = "ok"; // "ok" | "no-traffic-profile" | "denied" | "down"

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "routes.googleapis.com") {
    const body = JSON.parse(init.body);
    calls.push({ api: "google", mode: body.travelMode, pref: body.routingPreference, tier: init.headers["X-Goog-FieldMask"] });
    if (googleBehaviour === "down") return json({ error: { message: "backend error" } }, 503);
    const say = SAY[body.travelMode];
    if (!body.origins) {
      const h = body.travelMode === "WALK" && HUB_WALK ? HUB_WALK : say;
      return json({ routes: [{ distanceMeters: h.m, duration: `${h.s}s` }] });
    }
    return json(body.origins.map((_, i) => ({ originIndex: i, destinationIndex: 0, distanceMeters: say.m, duration: `${say.s}s`, condition: "ROUTE_EXISTS" })));
  }
  if (u.hostname === "api.mapbox.com") {
    const profile = u.pathname.split("/")[u.pathname.startsWith("/directions-matrix") ? 4 : 4];
    calls.push({ api: "mapbox", profile, matrix: u.pathname.startsWith("/directions-matrix") });
    if (mapboxBehaviour === "denied") return json({ message: "Not Authorized - Invalid Token" }, 401);
    if (mapboxBehaviour === "down") return json({ message: "boom" }, 503);
    if (mapboxBehaviour === "no-traffic-profile" && profile === "driving-traffic") return json({ code: "InvalidInput", message: "Profile not available here" }, 422);
    const say = profile === "walking" ? SAY.WALK : SAY.DRIVE;
    if (u.pathname.startsWith("/directions-matrix")) {
      const n = decodeURIComponent(u.pathname.split("/").pop()).split(";").length - 1;
      return json({ code: "Ok", distances: Array.from({ length: n }, () => [say.m]), durations: Array.from({ length: n }, () => [say.s]) });
    }
    return json({ code: "Ok", routes: [{ distance: say.m, duration: say.s }], waypoints: [] });
  }
  throw new Error("unexpected URL " + url);
};

const A = { lat: 6.45, lng: 3.39 };
const B = { lat: 6.4541, lng: 3.3947 };
const fresh = () => {
  resetRouteState();
  resetMemoryUsage();
  calls = [];
  googleBehaviour = "ok";
  mapboxBehaviour = "ok";
  HUB_WALK = null;
  SAY.WALK = { m: 700, s: 540 };
  delete process.env.WALK_EXTENDED_FROM_STAGE;
  delete process.env.WALK_COMBINED_MAX_MIN;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.GOOGLE_TIER_ORDER;
  delete process.env.MAPBOX_PROFILE;
};

// ---------------------------------------------------------------
// ROUTER: mode per call
// ---------------------------------------------------------------
test("walking is measured with WALK (never Pro, no traffic); driving with DRIVE on Pro (traffic aware)", async () => {
  fresh();
  const drive = await routeDistance(A, B, { travelMode: "driving" });
  const walk = await routeDistance(A, B, { travelMode: "walking" });
  assert.equal(drive.meters, 900);
  assert.equal(drive.minutes, 1.5);
  assert.equal(drive.sku, "routes_pro");
  assert.equal(drive.traffic, "aware");
  assert.equal(walk.meters, 700);
  assert.equal(walk.minutes, 9);
  assert.equal(walk.sku, "routes_essentials"); // Pro does not exist for walking
  assert.equal(walk.traffic, "n/a");
  assert.equal(walk.travelMode, "walking");
  assert.deepEqual(calls.map((c) => [c.mode, c.pref]), [["DRIVE", "TRAFFIC_AWARE"], ["WALK", undefined]]);
});

test("the cache is per mode: a walker and a driver never share a number", async () => {
  fresh();
  await routeDistance(A, B, { travelMode: "driving" });
  const again = await routeDistance(A, B, { travelMode: "driving" });
  assert.equal(again.sku, "cache");
  assert.equal(again.traffic, "aware"); // a cache hit remembers how it was measured
  const walk = await routeDistance(A, B, { travelMode: "walking" });
  assert.notEqual(walk.sku, "cache");
  assert.equal(walk.meters, 700);
});

// ---------------------------------------------------------------
// ROUTER: Mapbox tier + failover
// ---------------------------------------------------------------
test("tier order pro > essentials > mapbox > legacy: Mapbox answers once Google Pro and Essentials are used up", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  process.env.GOOGLE_LIMIT_ROUTES_PRO = "0";
  process.env.GOOGLE_LIMIT_ROUTES_ESSENTIALS = "0";
  const r = await routeDistance(A, B, { travelMode: "driving" });
  delete process.env.GOOGLE_LIMIT_ROUTES_PRO;
  delete process.env.GOOGLE_LIMIT_ROUTES_ESSENTIALS;
  assert.equal(r.source, "mapbox");
  assert.equal(r.sku, "routes_mapbox");
  assert.equal(r.traffic, "aware");
  assert.equal(calls[0].profile, "driving-traffic");
});

test("Mapbox walking uses the walking profile", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  process.env.GOOGLE_TIER_ORDER = "mapbox";
  const r = await routeDistance(A, B, { travelMode: "walking" });
  assert.equal(calls[0].profile, "walking");
  assert.equal(r.minutes, 9);
  assert.equal(r.traffic, "n/a");
});

test("traffic is not covered (Nigeria): Mapbox falls back to plain driving and says traffic is unaware", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  process.env.GOOGLE_TIER_ORDER = "mapbox";
  mapboxBehaviour = "no-traffic-profile";
  const r = await routeDistance(A, B, { travelMode: "driving" });
  assert.deepEqual(calls.map((c) => c.profile), ["driving-traffic", "driving"]);
  assert.equal(r.source, "mapbox");
  assert.equal(r.meters, 900);
  assert.equal(r.traffic, "unaware");
});

test("Matrix: Mapbox driving-traffic takes 9 origins per request (10 coordinates), walking 24", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  process.env.GOOGLE_TIER_ORDER = "mapbox";
  const origins = Array.from({ length: 20 }, (_, i) => ({ lat: 6.4 + i * 0.0001, lng: 3.39 }));
  await routeDistancesToPoint(origins, B, { travelMode: "driving" });
  assert.equal(calls.filter((c) => c.matrix).length, 3); // 9 + 9 + 2
  calls = [];
  resetRouteState();
  await routeDistancesToPoint(origins, B, { travelMode: "walking" });
  assert.equal(calls.filter((c) => c.matrix).length, 1); // 20 <= 24
});

test("FAILOVER: Google down -> Mapbox answers (one call), Google's breaker does not stop Mapbox", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  googleBehaviour = "down";
  const r = await routeDistance(A, B, { travelMode: "driving" });
  assert.equal(r.source, "mapbox");
  assert.equal(r.meters, 900);
  // Google was tried once (its first tier), not once per Google tier
  assert.equal(calls.filter((c) => c.api === "google").length, 1);
  const st = await routeStatus();
  assert.equal(st.breakers.mapbox.open, false);
});

test("FAILOVER (Matrix): the failed Google chunk is answered by Mapbox", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "m";
  googleBehaviour = "down";
  const out = await routeDistancesToPoint([A, { lat: 6.451, lng: 3.391 }], B, { travelMode: "driving" });
  assert.deepEqual(out.map((o) => o.source), ["mapbox", "mapbox"]);
});

test("Mapbox rejects the token (401): configuration error, skipped, Google keeps serving", async () => {
  fresh();
  process.env.MAPBOX_ACCESS_TOKEN = "bad";
  process.env.GOOGLE_TIER_ORDER = "mapbox,essentials";
  mapboxBehaviour = "denied";
  const r = await routeDistance(A, B, { travelMode: "driving" });
  assert.equal(r.source, "google"); // fell through to essentials
  const st = await routeStatus();
  assert.equal(st.mapbox.state, "down");
  assert.match(st.apiFamilies.mapbox, /skipped/);
});

// ---------------------------------------------------------------
// CASCADE: one system, each scientist in their own mode
// ---------------------------------------------------------------
const offers = [];
initRealtime({ on() {}, to: (room) => ({ emit: (ev, p) => ev === "booking_offer" && offers.push({ room, ...p }) }) });

const mk = (name, lat, travelMode) => ({ _id: name, displayName: name, email: "", latitude: lat, longitude: 0, travelMode });
let people = [];
ScientistOps.find = async (q) => {
  const skip = new Set((q._id?.$nin || []).map(String));
  return people.filter((s) => !skip.has(String(s._id)));
};
let db;
TestRequest.findOneAndUpdate = async (_f, u) => {
  for (const [k, v] of Object.entries(u.$set)) {
    const [, field] = k.split(".");
    db.matchingState[field] = v;
  }
  return db;
};
const newJob = (id) => ({
  _id: id,
  Status: "Searching",
  location: { lat: 0, lng: 0 },
  hubSnapshot: { name: "Hub", latitude: 0.01, longitude: 0, distanceKm: 1.4, distanceSource: "google" },
  matchingState: { notifiedScientistIds: [] },
  toObject() { return this; },
});

test("walker and driver at the same spot get THEIR OWN numbers, in the same stage when their minutes fall in the same band", async () => {
  fresh();
  // Fake: driving 900 m / 1.5 min, walking 700 m / 9 min.
  // Stage 1 (<= 2 min): the driver qualifies; the walker (9 min) does not yet.
  // Stage 3 (<= 7 min) still no; stage 4 (<= 10 min): the walker qualifies.
  people = [mk("driver", 0.001, "driving"), mk("walker", 0.001, "walking")];
  db = newJob("job-m1");
  const perStage = [];
  for (let stage = 0; stage < 4; stage++) {
    offers.length = 0;
    await notifyNewScientists(db, stage);
    perStage.push(offers.map((o) => `${o.room.replace("scientist:", "")}:${o.travelMode}`).sort());
  }
  assert.deepEqual(perStage, [["driver:driving"], [], [], ["walker:walking"]]);
});

test("same minute band = same stage, whatever the mode (equal opportunity)", async () => {
  fresh();
  // a driver (1.5 min) and a walker who is also inside the same band
  SAY.WALK = { m: 120, s: 100 }; // walker: 120 m, 1.7 min
  people = [mk("driver", 0.001, "driving"), mk("walker", 0.001, "walking")];
  db = newJob("job-m2");
  offers.length = 0;
  await notifyNewScientists(db, 0); // stage 1 (<= 2 min)
  assert.deepEqual(offers.map((o) => o.room.replace("scientist:", "")).sort(), ["driver", "walker"]);
  SAY.WALK = { m: 700, s: 540 };
});

test("offer carries the scientist's mode, ETA, patient->hub leg in THEIR mode and the combined journey", async () => {
  fresh();
  SAY.WALK = { m: 300, s: 110 };
  people = [mk("driver", 0.001, "driving"), mk("walker", 0.001, "walking")];
  db = newJob("job-m3");
  offers.length = 0;
  await notifyNewScientists(db, 0);
  const d = offers.find((o) => o.room === "scientist:driver");
  const w = offers.find((o) => o.room === "scientist:walker");

  // driver: 900 m / 1.5 min to the patient, then the hub leg DRIVEN (fake: 900 m, 1.5 min)
  assert.equal(d.travelMode, "driving");
  assert.equal(d.distanceM, 900);
  assert.equal(d.distanceMin, 1.5);
  assert.equal(d.collectionToHubM, 900);
  assert.equal(d.combinedJourneyM, 1800);
  assert.equal(d.combinedJourneyMin, 3);
  assert.equal(d.traffic, "aware");

  // walker: 300 m / 1.8 min to the patient, then the hub leg WALKED (fake: 300 m, 1.8 min)
  assert.equal(w.travelMode, "walking");
  assert.equal(w.distanceM, 300);
  assert.equal(w.distanceMin, 1.8);
  assert.equal(w.collectionToHubM, 300);
  assert.equal(w.combinedJourneyM, 600);
  assert.equal(w.combinedJourneyMin, 3.7);
  assert.equal(w.traffic, "n/a");
  SAY.WALK = { m: 700, s: 540 };
});

test("older scientist records without a mode are treated as driving", () => {
  assert.equal(normalizeTravelMode(undefined), "driving");
  assert.equal(normalizeTravelMode("WALK"), "walking");
  assert.equal(normalizeTravelMode("flying"), "driving");
});

// ---------------------------------------------------------------
// EMAIL
// ---------------------------------------------------------------
test("offer email: shows the combined journey, in the scientist's mode", () => {
  const job = { hubSnapshot: { name: "St Michael Lab" } };
  const walk = buildBookingOfferEmail({
    scientist: { email: "x@y.z" }, job, acceptUrl: "https://x/accept", travelMode: "walking",
    distanceM: 300, distanceMin: 3.7, stageMin: 4, collectionToHubM: 450, collectionToHubMin: 5.5,
    combinedJourneyM: 750, combinedJourneyMin: 9.2,
  });
  assert.match(walk.html, /Combined journey/);
  assert.match(walk.html, /9\.2 min \u00b7 0\.8 km/); // 750 m -> 0.8 km
  assert.match(walk.html, /3\.7 min \u00b7 0\.3 km/);
  assert.match(walk.html, /5\.5 min \u00b7 0\.5 km/);
  assert.match(walk.html, /on foot/);
  assert.match(walk.html, /walking/);
  assert.doesNotMatch(walk.html, /by road/);
  assert.match(walk.html, /St Michael Lab/);

  const drive = buildBookingOfferEmail({
    scientist: { email: "x@y.z" }, job, acceptUrl: "https://x/accept", travelMode: "driving",
    distanceM: 2100, distanceMin: 6.1, stageMin: 7, collectionToHubM: 1400, collectionToHubMin: 4,
    combinedJourneyM: 3500, combinedJourneyMin: 10.1,
  });
  assert.match(drive.html, /by road/);
  assert.match(drive.html, /driving/);
  assert.match(drive.html, /10\.1 min \u00b7 3\.5 km/);
});

test("offer email without a verified hub leg still sends (no combined row)", () => {
  const out = buildBookingOfferEmail({
    scientist: { email: "x@y.z" }, job: { hubSnapshot: { name: "Hub" } }, acceptUrl: "https://x/a",
    travelMode: "driving", distanceM: 900, distanceMin: 1.5, stageMin: 2,
    collectionToHubM: null, collectionToHubMin: null, combinedJourneyM: null, combinedJourneyMin: null,
  });
  assert.doesNotMatch(out.html, /Combined journey/);
  assert.match(out.html, /Accept this test/);
});

// ---------------------------------------------------------------
// EXTENDED WALKING RULE (same cascade, not a second phase)
//   walking to patient + walking patient -> hub <= 51 min
// ---------------------------------------------------------------
const runAllStages = async (jobId) => {
  db = newJob(jobId);
  const perStage = [];
  const all = [];
  for (let stage = 0; stage < 4; stage++) {
    offers.length = 0;
    await notifyNewScientists(db, stage);
    perStage.push(offers.map((o) => `${o.room.replace("scientist:", "")}:${o.qualifiedBy}`).sort());
    all.push(...offers.map((o) => ({ ...o })));
  }
  return { perStage, all };
};
const min = (m) => ({ s: m * 60 });

test("extended rule: 14 min walk + 32 min hub walk = 46 <= 51 -> qualifies, in the same cascade, offered ONCE", async () => {
  fresh();
  SAY.WALK = { m: 1000, ...min(14) }; // 14 min to the patient: too slow for every band (max 10)
  HUB_WALK = { m: 2000, ...min(32) }; // patient -> hub on foot: 32 min
  people = [mk("walker", 0.001, "walking")];
  const { perStage, all } = await runAllStages("job-x1");
  // default: the extended rule applies from the LAST stage (no head start over earlier minute bands)
  assert.deepEqual(perStage, [[], [], [], ["walker:extended"]]);
  assert.equal(all.length, 1); // one offer, never duplicated
  assert.equal(all[0].combinedJourneyMin, 46);
  assert.equal(all[0].travelMode, "walking");
});

test("extended rule: exactly 51 min qualifies, 52 does not (inclusive limit)", async () => {
  fresh();
  SAY.WALK = { m: 1000, ...min(15) };
  HUB_WALK = { m: 2000, ...min(36) }; // 15 + 36 = 51
  people = [mk("w51", 0.001, "walking")];
  assert.deepEqual((await runAllStages("job-x2")).perStage[3], ["w51:extended"]);

  fresh();
  SAY.WALK = { m: 1000, ...min(15) };
  HUB_WALK = { m: 2000, ...min(37) }; // 52
  people = [mk("w52", 0.001, "walking")];
  assert.deepEqual((await runAllStages("job-x3")).perStage, [[], [], [], []]);
});

test("extended rule does NOT replace the distance cap: a walker beyond 3.5 km never qualifies", async () => {
  fresh();
  SAY.WALK = { m: 3600, ...min(14) }; // 14 min but 3.6 km
  HUB_WALK = { m: 500, ...min(6) }; // combined 20 min, well under 51
  people = [mk("far", 0.001, "walking")];
  assert.deepEqual((await runAllStages("job-x4")).perStage, [[], [], [], []]);
});

test("extended rule is for WALKING scientists only: a slow driver never qualifies by it", async () => {
  fresh();
  SAY.DRIVE = { m: 3000, ...min(14) };
  people = [mk("driver", 0.001, "driving")];
  assert.deepEqual((await runAllStages("job-x5")).perStage, [[], [], [], []]);
  SAY.DRIVE = { m: 900, s: 90 };
});

test("a walker already eligible by a minute band is offered by the band and NOT again by the extended rule", async () => {
  fresh();
  SAY.WALK = { m: 400, ...min(5) }; // 5 min: band 3 (<= 7)
  HUB_WALK = { m: 1000, ...min(12) }; // combined 17 min: also eligible for the extended rule
  people = [mk("walker", 0.001, "walking")];
  const { perStage, all } = await runAllStages("job-x6");
  assert.deepEqual(perStage, [[], [], ["walker:band"], []]);
  assert.equal(all.length, 1);
});

test("equal opportunity: in the last stage a band driver and an extended walker are offered at the same instant", async () => {
  fresh();
  SAY.DRIVE = { m: 2500, ...min(9) }; // driver: 9 min -> band 4 (<= 10)
  SAY.WALK = { m: 1000, ...min(14) };
  HUB_WALK = { m: 2000, ...min(32) };
  people = [mk("driver", 0.001, "driving"), mk("walker", 0.001, "walking")];
  const { perStage } = await runAllStages("job-x7");
  assert.deepEqual(perStage, [[], [], [], ["driver:band", "walker:extended"]]);
  SAY.DRIVE = { m: 900, s: 90 };
});

test("WALK_EXTENDED_FROM_STAGE=1 applies the rule from stage 1, still once per scientist", async () => {
  fresh();
  process.env.WALK_EXTENDED_FROM_STAGE = "1";
  SAY.WALK = { m: 1000, ...min(14) };
  HUB_WALK = { m: 2000, ...min(32) };
  people = [mk("walker", 0.001, "walking")];
  const { perStage, all } = await runAllStages("job-x8");
  assert.deepEqual(perStage, [["walker:extended"], [], [], []]);
  assert.equal(all.length, 1);
});

test("WALK_COMBINED_MAX_MIN is configurable", async () => {
  fresh();
  process.env.WALK_COMBINED_MAX_MIN = "40";
  SAY.WALK = { m: 1000, ...min(14) };
  HUB_WALK = { m: 2000, ...min(32) }; // 46 > 40
  people = [mk("walker", 0.001, "walking")];
  assert.deepEqual((await runAllStages("job-x9")).perStage, [[], [], [], []]);
});

test("strict rule: if the walking hub leg cannot be verified the extended rule is not applied (held back)", async () => {
  fresh();
  SAY.WALK = { m: 1000, ...min(14) };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    if (!body.origins && body.travelMode === "WALK") return new Response("{}", { status: 503 }); // hub leg fails
    return real(url, init);
  };
  people = [mk("walker", 0.001, "walking")];
  const { perStage } = await runAllStages("job-x10");
  globalThis.fetch = real;
  assert.deepEqual(perStage, [[], [], [], []]);
});
