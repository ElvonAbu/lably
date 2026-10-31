// Offline test for the minute-based cascade: node --test tests/minuteCascade.test.mjs
// Fake Google (no network) + fake database models. Needs the real project dependencies
// only for mongoose/jsonwebtoken/resend imports (they are never actually used here).
import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_PROVIDERS = "false"; // the Google-vs-Mapbox console comparison is off in offline tests
process.env.GOOGLE_MAPS_API_KEY = "test-key";
process.env.UNVERIFIED_POLICY = "strict";
process.env.DISTANCE_MODE = "auto";
process.env.GOOGLE_STARTUP_PROBE = "false";
for (const k of ["MATCH_STAGES_MIN", "MATCH_MAX_PATIENT_M", "MATCH_HUB_MAX_M", "GOOGLE_ALLOW_PAID", "GOOGLE_TIER_ORDER", "GOOGLE_TRAVEL_MODE"]) delete process.env[k];

const { notifyNewScientists, matchRules } = await import("../services/matchingCascade.js");
const { initRealtime } = await import("../services/realtime.js");
const { resetRouteState } = await import("../utils/routeDistance.js");
const { resetMemoryUsage } = await import("../utils/googleUsage.js");
const TestRequest = (await import("../models/TestRequest.js")).default;
const ScientistOps = (await import("../models/ScientistOps.js")).default;

// ---- fake Google: road metres + seconds per scientist (identified by latitude) ----
const ROAD = {
  0.001: { m: 1000, s: 90 }, //  A: stage 1 (<= 2 min)
  0.002: { m: 1500, s: 180 }, // B: stage 2 (<= 4 min)
  0.003: { m: 3000, s: 360 }, // C: stage 3 (<= 7 min)
  0.004: { m: 3000, s: 540 }, // D: stage 4 (<= 10 min)
  0.005: { m: 3600, s: 180 }, // E: FAST but beyond the 3.5 km cap -> never
  0.006: { m: 2000, s: 660 }, // F: within 3.5 km but 11 min -> never
};
let googleCalls = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (!body.origins) {
    // single Compute Routes call (the patient -> hub leg)
    return new Response(JSON.stringify({ routes: [{ distanceMeters: 1400, duration: "240s" }] }), { status: 200 });
  }
  googleCalls.push(body.origins.length);
  const els = body.origins.map((o, i) => {
    const r = ROAD[o.waypoint.location.latLng.latitude];
    return { originIndex: i, destinationIndex: 0, distanceMeters: r.m, duration: `${r.s}s`, condition: "ROUTE_EXISTS" };
  });
  return new Response(JSON.stringify(els), { status: 200, headers: { "content-type": "application/json" } });
};

// ---- fake realtime ----
const offers = [];
initRealtime({ on() {}, to: (room) => ({ emit: (ev, p) => ev === "booking_offer" && offers.push({ room, ...p }) }) });

// ---- fake database ----
const mk = (name, lat) => ({ _id: name, displayName: name, email: "", latitude: lat, longitude: 0 });
const people = [mk("A", 0.001), mk("B", 0.002), mk("C", 0.003), mk("D", 0.004), mk("E", 0.005), mk("F", 0.006)];
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

test("minute cascade: both limits, stage by stage", async () => {
  resetRouteState();
  resetMemoryUsage();
  assert.deepEqual(matchRules().stagesMin, [2, 4, 7, 10]);

  db = {
    _id: "job1",
    Status: "Searching",
    location: { lat: 0, lng: 0 },
    hubSnapshot: { name: "Hub", latitude: 0.01, longitude: 0, distanceKm: 1.4, distanceSource: "google" },
    matchingState: { notifiedScientistIds: [] },
    toObject() { return this; },
  };

  const perStage = [];
  for (let stage = 0; stage < 4; stage++) {
    offers.length = 0;
    await notifyNewScientists(db, stage);
    perStage.push(offers.map((o) => o.room.replace("scientist:", "")).sort());
  }

  assert.deepEqual(perStage, [["A"], ["B"], ["C"], ["D"]]); // E (3.6 km) and F (11 min) never qualify
  assert.equal(db.matchingState.notifiedCount, 4);
  assert.equal(db.matchingState.currentStageMin, 10);
});

test("offer payload carries minutes, hub leg and the combined journey (monitoring only)", async () => {
  resetRouteState();
  resetMemoryUsage();
  db = {
    _id: "job2",
    Status: "Searching",
    location: { lat: 0, lng: 0 },
    hubSnapshot: { name: "Hub", latitude: 0.01, longitude: 0, distanceKm: 1.4, distanceSource: "google" },
    matchingState: { notifiedScientistIds: [] },
    toObject() { return this; },
  };
  offers.length = 0;
  await notifyNewScientists(db, 0);
  const o = offers[0];
  assert.equal(o.stageMin, 2);
  assert.equal(o.distanceM, 1000);
  assert.equal(o.distanceMin, 1.5);
  assert.equal(o.collectionToHubKm, 1.4);
  assert.equal(o.combinedJourneyM, 2400); // 1000 m + 1400 m
  assert.equal(o.distanceSource, "google");
  assert.equal(o.radiusM, undefined);
});

test("strict rule: Google down -> nobody is offered (no straight-line fallback)", async () => {
  resetRouteState();
  resetMemoryUsage();
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  db = {
    _id: "job3",
    Status: "Searching",
    location: { lat: 0, lng: 0 },
    hubSnapshot: { name: "Hub", latitude: 0.01, longitude: 0, distanceKm: 1.4, distanceSource: "google" },
    matchingState: { notifiedScientistIds: [] },
    toObject() { return this; },
  };
  offers.length = 0;
  await notifyNewScientists(db, 3);
  assert.equal(offers.length, 0);
  globalThis.fetch = real;
});

test("limits are configurable without code changes", async () => {
  process.env.MATCH_STAGES_MIN = "1,3";
  process.env.MATCH_MAX_PATIENT_M = "1200";
  const r = matchRules();
  assert.deepEqual(r.stagesMin, [1, 3]);
  assert.equal(r.patientMaxM, 1200);
  assert.equal(r.totalSearchMs, 24000);
  delete process.env.MATCH_STAGES_MIN;
  delete process.env.MATCH_MAX_PATIENT_M;
});
