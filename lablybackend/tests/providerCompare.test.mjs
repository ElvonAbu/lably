/**
 * tests/providerCompare.test.mjs
 * Offline test of the Google-vs-Mapbox comparison listener. No network, no database.
 *   node --test tests/providerCompare.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_PROVIDERS = "true";
process.env.GOOGLE_MAPS_API_KEY = "g-key";
process.env.MAPBOX_ACCESS_TOKEN = "m-token";
process.env.COMPARE_PRO_RESERVE = "0";

const { runComparison, compareEvents, attachCompareLogger, formatComparison } = await import("../utils/providerCompare.js");
const { resetMemoryUsage } = await import("../utils/googleUsage.js");

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
let calls = [];
let googleDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push(u);
  if (u.includes("api.mapbox.com/directions/v5/")) {
    return json({
      code: "Ok",
      routes: [{ distance: 1210, duration: 250 }],
      // Mapbox "moved" each point a little onto the road
      waypoints: [{ location: [3.3902, 6.4501] }, { location: [3.3948, 6.4542] }],
    });
  }
  if (u.includes("routes.googleapis.com/directions/v2:computeRoutes")) {
    if (googleDown) return json({ error: { message: "API not enabled" } }, 403);
    return json({
      routes: [
        {
          distanceMeters: 1180,
          duration: "240s",
          legs: [{ startLocation: { latLng: { latitude: 6.45005, longitude: 3.39015 } }, endLocation: { latLng: { latitude: 6.45415, longitude: 3.39475 } } }],
        },
      ],
    });
  }
  throw new Error("unexpected URL " + u);
};

const patient = { lat: 6.4541, lng: 3.3947 };
const hub = { name: "Seed Hub", lat: 6.4541, lng: 3.3947 };
const scientists = [
  { id: "s1", name: "Seed Scientist 1", lat: 6.45, lng: 3.39, used: { toPatient: { source: "google", meters: 1180, minutes: 4 } } },
];

test("emits ONE comparison event with Google AND Mapbox for scientist->patient and scientist->hub", async () => {
  resetMemoryUsage();
  calls = [];
  const seen = [];
  compareEvents.once("comparison", (p) => seen.push(p));
  await runComparison({ jobId: "job1", trigger: "stage", stage: 1, stageMin: 2, primary: "google", patient, hub, scientists });

  assert.equal(seen.length, 1);
  const p = seen[0];
  assert.deepEqual(p.legs.map((l) => l.kind), ["scientist_to_patient", "scientist_to_hub"]);
  for (const leg of p.legs) {
    assert.equal(leg.google.ok, true);
    assert.equal(leg.mapbox.ok, true);
    assert.equal(leg.google.meters, 1180);
    assert.equal(leg.mapbox.meters, 1210);
    assert.equal(leg.mapbox.from.lat, 6.4501); // where MAPBOX placed the scientist
    assert.ok(leg.google.from.movedM >= 0); // where GOOGLE placed the scientist
  }
  assert.equal(calls.filter((u) => u.includes("mapbox")).length, 2);
  assert.equal(calls.filter((u) => u.includes("googleapis")).length, 2);
  assert.ok(calls.filter((u) => u.includes("mapbox")).every((u) => u.includes("/driving-traffic/")));
  assert.equal(p.legs[0].google.traffic, "aware");
  assert.equal(p.legs[0].mapbox.traffic, "aware");
});

test("Google probe asks for TRAFFIC_AWARE; falls back to unaware (and says so) when Pro is used up", async () => {
  resetMemoryUsage();
  process.env.GOOGLE_LIMIT_ROUTES_PRO = "1";
  process.env.COMPARE_PRO_RESERVE = "0";
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("googleapis") && init?.body) bodies.push(JSON.parse(init.body).routingPreference);
    return realFetch(url, init);
  };
  const first = await (await import("../utils/googleProbe.js")).probeGoogle(patient, hub);
  const second = await (await import("../utils/googleProbe.js")).probeGoogle(patient, hub);
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_LIMIT_ROUTES_PRO;
  delete process.env.COMPARE_PRO_RESERVE;
  assert.deepEqual(bodies, ["TRAFFIC_AWARE", "TRAFFIC_UNAWARE"]);
  assert.equal(first.traffic, "aware");
  assert.equal(second.traffic, "unaware");
});

test("hub assignment compares patient -> hub", async () => {
  resetMemoryUsage();
  const seen = [];
  compareEvents.once("comparison", (p) => seen.push(p));
  await runComparison({ jobId: null, trigger: "hub_assignment", primary: "mapbox", patient, hub, usedPatientToHub: { source: "mapbox", meters: 1210, minutes: 4.2 } });
  assert.equal(seen[0].legs.length, 1);
  assert.equal(seen[0].legs[0].kind, "patient_to_hub");
  assert.equal(seen[0].legs[0].used.source, "mapbox");
});

test("the console listener prints both providers, the placement, the difference and what the matcher used", async () => {
  resetMemoryUsage();
  const lines = [];
  const em = new (await import("node:events")).EventEmitter();
  attachCompareLogger(em, (t) => lines.push(t));
  const p = await runComparison({ jobId: "job2", trigger: "stage", stage: 2, stageMin: 4, primary: "google", patient, hub, scientists });
  em.emit("comparison", p);
  const text = lines.join("\n");
  assert.match(text, /STAGE 2 \(<= 4 min\)/);
  assert.match(text, /SCIENTIST -> PATIENT/);
  assert.match(text, /SCIENTIST -> HUB/);
  assert.match(text, /google .*road 1180 m.*\[traffic aware\]/);
  assert.match(text, /mapbox .*road 1210 m.*\[traffic aware\]/);
  assert.match(text, /scientist placed at/);
  assert.match(text, /DIFF .*\+30 m/);
  assert.match(text, /MATCHER USED google: 1180 m, 4.0 min/);
  console.log(formatComparison(p)); // shown once when you run the test
});

test("one provider failing does not hide the other", async () => {
  resetMemoryUsage();
  googleDown = true;
  const seen = [];
  compareEvents.once("comparison", (p) => seen.push(p));
  await runComparison({ jobId: "job3", trigger: "stage", stage: 1, stageMin: 2, primary: "mapbox", patient, hub, scientists });
  googleDown = false;
  assert.equal(seen[0].legs[0].google.ok, false);
  assert.match(seen[0].legs[0].google.error, /403/);
  assert.equal(seen[0].legs[0].mapbox.ok, true);
});

test("COMPARE_PROVIDERS=false turns it off (no calls)", async () => {
  process.env.COMPARE_PROVIDERS = "false";
  calls = [];
  const out = await runComparison({ jobId: "j", trigger: "stage", primary: "google", patient, hub, scientists });
  assert.equal(out, null);
  assert.equal(calls.length, 0);
  process.env.COMPARE_PROVIDERS = "true";
});

test("never throws, even with bad input", async () => {
  const out = await runComparison({ trigger: "stage", primary: "google", patient: null, hub: null, scientists: [{ id: 1 }] });
  assert.equal(out, null);
});

test("a WALKING scientist is compared in THEIR mode (Google WALK + Mapbox walking), and the log says so", async () => {
  resetMemoryUsage();
  const seenGoogle = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("googleapis") && init?.body) seenGoogle.push(JSON.parse(init.body));
    calls.push(String(url));
    return realFetch(url, init);
  };
  calls = [];
  const p = await runComparison({
    jobId: "jw", trigger: "stage", stage: 1, stageMin: 2, primary: "tiered", patient, hub,
    scientists: [{ id: "w1", name: "Seed Walker", lat: 6.45, lng: 3.39, travelMode: "walking" }],
  });
  globalThis.fetch = realFetch;
  assert.ok(seenGoogle.every((b) => b.travelMode === "WALK" && b.routingPreference === undefined));
  assert.ok(calls.filter((u) => u.includes("mapbox")).every((u) => u.includes("/walking/")));
  assert.equal(p.legs[0].mode, "walking");
  assert.match(formatComparison(p), /SCIENTIST -> PATIENT  "Seed Walker" \[walking\]/);
});
