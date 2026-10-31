import express from "express";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import TestRequest from "../models/TestRequest.js";
import Hub from "../models/Hub.js";
import ScientistOps from "../models/ScientistOps.js";
import Waitlist from "../models/Waitlist.js";
import {
  routeStatus,
  setDistanceMode,
  resetRouteState,
  checkGoogle,
  checkMapbox,
  routeDistancesToPoint,
  routeDistance,
  PRIMARY_PROVIDER,
} from "../utils/routeDistance.js";
import { usableMeters, usableMinutes } from "../utils/distancePolicy.js";
import { runComparison, compareConfig } from "../utils/providerCompare.js";
import { distanceM as haversineM } from "../utils/geo.js";
import { normalizeTravelMode, isValidTravelMode, TRAVEL_MODES } from "../utils/travelMode.js";
import {
  repairStuckScientists,
  matchingConfig,
  assignNearestHub,
  startMatchingCascade,
  acceptBooking,
  cancelMatching,
  matchRules,
  STAGE_DURATION_MS,
} from "../services/matchingCascade.js";

/**
 * routes/matchDev.js - DEV / TESTING ONLY (index.js does not mount it in production)
 *
 *   GET   /match-dev/console             BROWSER TEST CONSOLE (buttons for everything below)
 *   POST  /match-dev/test-job            create a job WITHOUT login. body { lat?, lng? } (default = hub)
 *   GET   /match-dev/jobs                latest 10 jobs (Status, notifiedCount, ...)
 *   GET   /match-dev/job-trace[?jobId=]  WHO was notified / picked / fell off (and why) for a job
 *   POST  /match-dev/accept              body { jobId, scientistId } accept WITHOUT login
 *   POST  /match-dev/cancel-job          body { jobId }
 *   POST  /match-dev/simulate-stuck      fake "server crashed mid-accept" on a scientist
 *   POST  /match-dev/google-check        probe Google now (costs 1 request; /mapbox-check is an alias)
 *   GET|POST /match-dev/seed[?lat=&lng=] seed hub + 4 scientists (hub = lat/lng, default 6.4541,3.3947)
 *   POST  /match-dev/reset               make seed scientists online + idle again
 *   GET   /match-dev/route-status        mode, breaker, cache, counters + PER-SKU monthly usage (requests / matrix elements)
 *   PATCH /match-dev/scientists/:id       change a scientist (online / idle / location / travelMode "driving"|"walking")
 *   POST  /match-dev/mapbox-check         probe Mapbox now (1 request)
 *   POST  /match-dev/compare-now         ask Google AND Mapbox about the latest job's hub + seeded scientists NOW and print it in the backend console (also returned as JSON)
 *   POST  /match-dev/route-mode          body { mode: "auto"|"haversine"|"google" }
 *   POST  /match-dev/route-reset         clear cache + breaker + in-process counters (NOT the monthly usage ledger)
 *   POST  /match-dev/repair-scientists   run the stuck-scientist repair now
 *   GET   /match-dev/scientists | /hubs | /waitlist
 *   PATCH  /match-dev/scientists/:id      move a scientist / toggle online / idle
 *   POST   /match-dev/scientists          seed ONE custom scientist (edge cases) - body { lat, lng, displayName?, isOnline?, isAvailable?, email? }
 *   DELETE /match-dev/scientists/:id      unseed one scientist
 *   DELETE /match-dev/scientists          unseed all SEEDED scientists (add ?all=true for literally everyone)
 *   POST   /match-dev/hubs                create a hub - body { lat, lng, name?, serviceRadiusKm?, isActive? }
 *   PATCH  /match-dev/hubs/:id            move/edit a hub - same body fields, all optional
 *   DELETE /match-dev/hubs/:id            remove a hub
 */
const router = express.Router();

/**
 * ============================================================
 * SEED SCIENTISTS + HUB   (this is WHERE scientists are seeded)
 * POST /match-dev/seed
 *
 * Book the test request AT THE HUB: lat 6.4541, lng 3.3947.
 * To test WITHOUT Google set DISTANCE_MODE=haversine (or POST /match-dev/route-mode
 * {"mode":"haversine"}). Without it, the ROAD rule is strict, so with no Google
 * answer nobody is eligible. Stages are DRIVING-TIME bands (2/4/7/10 min). With mode
 * "haversine", minutes are estimated as metres / ASSUMED_KMH, so set ASSUMED_KMH=15
 * for the clean 1-2-3-4 climb:
 *   0s  (<= 2 min)   -> Seed Near   (~130 m,   ~0.5 min) count 1
 *   12s (<= 4 min)   -> Seed Mid    (~570 m,   ~2.3 min) count 2
 *   24s (<= 7 min)   -> Seed Far    (~1.66 km, ~6.6 min) count 3
 *   36s (<= 10 min)  -> Seed Edge   (~2.19 km, ~8.8 min) count 4
 *   48s              -> NoCoverage if nobody accepted
 * (With the default ASSUMED_KMH=25 they enter earlier, so the count climbs faster.)
 * With Google ON, real road minutes decide the stage, and anyone over 3.5 km by
 * road never qualifies (that is the point of road distance).
 * ============================================================
 */
router.all("/seed", async (req, res) => {
  // Works as a button press in the console (POST) AND by pasting the URL in a
  // browser (GET), e.g.  https://localhost:3000/match-dev/seed?lat=6.449359&lng=3.397913
  try {
    // The hub is placed AT lat/lng. Book your test request at the same pin.
    // Default = the original test pin, so the console's "Create test job" works as before.
    // Optional ?email=you@gmail.com : the seeded scientists get addresses that land in
    // YOUR inbox (you+seed+sci-near@gmail.com ...), so you can accept offers from a normal
    // email app on a phone or laptop. Works with providers that support "+" addressing
    // (Gmail, Outlook.com, iCloud, Fastmail, Proton). Without it they get fake @lably.test
    // addresses and no email can be delivered.
    const wanted = String(req.query.email ?? "").trim().toLowerCase();
    const parsed = /^([^@+\s]+)@([^@\s]+\.[^@\s]+)$/.exec(wanted);
    if (wanted && !parsed) {
      return res.status(400).json({ message: "email must look like name@example.com" });
    }
    const seedEmail = (tag) =>
      parsed ? `${parsed[1]}+seed+sci-${tag}@${parsed[2]}` : `seed+sci-${tag}@lably.test`;
    const lat = req.query.lat === undefined ? 6.4541 : Number(req.query.lat);
    const lng = req.query.lng === undefined ? 3.3947 : Number(req.query.lng);

    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return res.status(400).json({
        message:
          "lat and lng must be valid numbers, e.g. /match-dev/seed?lat=6.449359&lng=3.397913",
      });
    }

    // Scientist positions are fixed OFFSETS from the hub (same geometry as before),
    // so the 1-2-3-4 stage behaviour is the same wherever the hub is placed.
    const at = (dLat, dLng) => ({
      latitude: Number((lat + dLat).toFixed(6)),
      longitude: Number((lng + dLng).toFixed(6)),
    });

    // 1) Create the NEW hub FIRST, so a failure later can never leave you with zero hubs.
    const hub = await Hub.create({
      name: "LABLY Seed Hub",
      address: `Seed hub (${lat}, ${lng})`,
      latitude: lat,
      longitude: lng,
      serviceRadiusKm: 2.25,
      isActive: true,
    });
    console.log("[seed] hub saved:", hub._id.toString(), "in database", mongoose.connection.name);

    // 2) Then remove OLD seed data (never the hub we just made).
    await Hub.deleteMany({ name: /LABLY Seed/i, _id: { $ne: hub._id } });
    await ScientistOps.deleteMany({ email: /seed\+sci/i });

    // 3) Scientists
    let scientists;
    try {
      scientists = await ScientistOps.insertMany([
        {
          // === SEEDED SCIENTIST 1: stage 1 (0-500 m) ===
          displayName: "Seed Near",
          email: seedEmail("near"),
          ...at(0.0009, 0.0008),
          isOnline: true,
          isAvailable: true,
        },
        {
          // === SEEDED SCIENTIST 2: stage 2 (500-1000 m) ===
          displayName: "Seed Mid",
          email: seedEmail("mid"),
          ...at(0.0039, 0.0033),
          isOnline: true,
          isAvailable: true,
        },
        {
          // === SEEDED SCIENTIST 3: stage 3 (1000-2000 m) ===
          displayName: "Seed Far",
          email: seedEmail("far"),
          ...at(0.0009, 0.0008),
          isOnline: true,
          isAvailable: true,
        },
        {
          // === SEEDED SCIENTIST 4: stage 4 (2000-2250 m), inside the hub rule ===
          displayName: "Seed Edge",
          email: seedEmail("edge"),
          ...at(0.0030, 0.033),
          isOnline: true,
          isAvailable: true,
        },
        {
          // === SEEDED SCIENTIST 5: a WALKING scientist (~150 m away). Measured by WALKING
          // distance and walking time, so a few hundred metres is already a few minutes. ===
          displayName: "Seed Walker",
          email: seedEmail("walker"),
          travelMode: "walking",
          ...at(0.0010, 0.0010),
          isOnline: true,
          isAvailable: true,
        },
      ]);
    } catch (e) {
      console.error("[seed] scientists failed:", e);
      return res.status(500).json({
        message: "Hub saved, but seeding scientists failed: " + e.message,
        hub,
      });
    }

    return res.status(201).json({
      message: "Seeded",
      database: mongoose.connection.name,
      hubsInDatabase: await Hub.countDocuments(),
      scientistsInDatabase: await ScientistOps.countDocuments({ email: /seed\+sci/i }),
      testPatientLocation: { lat, lng },
      hub,
      scientists,
    });
  } catch (e) {
    console.error("[seed] failed:", e);
    return res.status(500).json({ message: e.message });
  }
});

/** Accept flips a scientist to busy. Use this to make seeds idle again between tests. */
router.post("/reset", async (_req, res) => {
  const r = await ScientistOps.updateMany(
    { email: /seed\+sci/i },
    {
      $set: {
        isOnline: true,
        isAvailable: true,
        currentJobId: null,
        claimedAt: null,
      },
    }
  );
  res.json({ message: "Seed scientists online + idle", modified: r.modifiedCount });
});

// ----- Google vs Haversine testing -----------------------------------
router.get("/route-status", async (_req, res) =>
  res.json({ ...(await routeStatus()), rules: matchingConfig() })
);

router.post("/route-mode", async (req, res) => {
  try {
    setDistanceMode(req.body?.mode ?? null);
    res.json(await routeStatus());
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ----- Google vs Mapbox comparison, on demand ------------------------
// Same output the matcher prints during a real search, without creating a job.
// body { jobId? } -> uses that job (or the latest) for the patient pin + hub,
// and every SEEDED scientist (seed+sci@...). Output goes to the backend console
// through the comparison listener AND comes back here as JSON.
router.post("/compare-now", async (req, res) => {
  try {
    const job = req.body?.jobId
      ? await TestRequest.findById(req.body.jobId)
      : await TestRequest.findOne().sort({ createdAt: -1 });
    if (!job?.location?.lat) return res.status(404).json({ message: "No job with a pin. Create a test job first." });
    const seeded = (await ScientistOps.find().sort({ displayName: 1 })).filter((s) => /seed\+sci/i.test(s.email || ""));
    const hub = job.hubSnapshot?.latitude != null
      ? { name: job.hubSnapshot.name, lat: job.hubSnapshot.latitude, lng: job.hubSnapshot.longitude }
      : null;
    const payload = await runComparison({
      jobId: job._id,
      trigger: "manual",
      primary: PRIMARY_PROVIDER,
      patient: { lat: job.location.lat, lng: job.location.lng },
      hub,
      scientists: seeded.map((s) => ({ id: s._id, name: s.displayName, lat: s.latitude, lng: s.longitude, travelMode: s.travelMode })),
    });
    if (!payload) return res.status(409).json({ message: "Comparison is off (COMPARE_PROVIDERS=false)", config: compareConfig() });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/route-reset", async (_req, res) => {
  resetRouteState();
  res.json(await routeStatus());
});

// ----- Stuck-scientist repair (also runs at startup + every 60s) -------
router.post("/repair-scientists", async (_req, res) => {
  const released = await repairStuckScientists(0); // grace 0 for manual testing
  res.json({ released });
});


// ----- Browser test console (no login needed) --------------------------
router.get("/console", (_req, res) => {
  res.sendFile(fileURLToPath(new URL("./matchConsole.html", import.meta.url)));
});

// Create a job directly (fake patient, no auth). Same hub assignment + search
// path as a real booking. Default pin = the seed hub.
router.post("/test-job", async (req, res) => {
  try {
    const lat = Number(req.body?.lat ?? 6.4541);
    const lng = Number(req.body?.lng ?? 3.3947);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "lat/lng must be numbers" });
    }

    const doc = new TestRequest({
      supabaseUserId: "dev-user",
      email: "dev@lably.test",
      patientid: new mongoose.Types.ObjectId(),
      proceedMode: "test",
      selectedTests: ["DEV"],
      resolvedTests: ["DEV"],
      patientSnapshot: { fullname: "Dev Patient", gender: "N/A" },
      location: { lat, lng, address: "Dev pin" },
      Status: "Pending",
    });

    const hubPick = await assignNearestHub({ lat, lng });
    if (hubPick) {
      doc.hubId = hubPick.hub._id;
      doc.hubSnapshot = {
        name: hubPick.hub.name,
        latitude: hubPick.hub.latitude,
        longitude: hubPick.hub.longitude,
        distanceKm: hubPick.distanceKm,
        distanceSource: hubPick.distanceSource,
      };
    }
    await doc.save();

    if (doc.hubId) await startMatchingCascade(doc._id);
    else {
      doc.Status = "NoCoverage"; // same as the real flow (no waitlist for this case yet)
      await doc.save();
    }
    res.status(201).json({ data: await TestRequest.findById(doc._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * ============================================================
 * JOB TRACE: which scientist was PICKED, who FELL OFF, and why.
 * GET /match-dev/job-trace            (latest job)
 * GET /match-dev/job-trace?jobId=<id> (a specific job)
 *
 * Re-measures every seeded scientist against the job's pin with the SAME
 * rules the matcher uses (road first; stage = first time band that covers the
 * driving minutes, and the road distance must be within the 3.5 km cap), and reads the
 * job's saved notifiedScientistIds / scientistId. Cached Google pairs cost nothing.
 * ============================================================
 */
router.get("/job-trace", async (req, res) => {
  try {
    const job = req.query.jobId
      ? await TestRequest.findById(req.query.jobId)
      : await TestRequest.findOne().sort({ createdAt: -1 });
    if (!job) return res.status(404).json({ message: "No job found. Create one first." });

    const stageSec = STAGE_DURATION_MS / 1000;
    const rules = matchRules();
    const patient = { lat: job.location?.lat, lng: job.location?.lng };
    const hubPoint =
      job.hubSnapshot?.latitude != null
        ? { lat: job.hubSnapshot.latitude, lng: job.hubSnapshot.longitude }
        : null;

    const notifiedIds = new Set((job.matchingState?.notifiedScientistIds || []).map(String));
    const pickedId = job.scientistId ? String(job.scientistId) : null;

    // Seeded scientists + anyone notified or picked (keeps the Google calls small)
    const everyone = await ScientistOps.find().sort({ displayName: 1 });
    const people = everyone.filter(
      (s) =>
        /seed\+sci/i.test(s.email || "") ||
        notifiedIds.has(String(s._id)) ||
        String(s._id) === pickedId
    );

    const pt = (s) => ({ lat: s.latitude, lng: s.longitude });
    // one Matrix call per travel mode (walkers are measured by walking, drivers by driving)
    const toPatient = new Array(people.length);
    await Promise.all(
      TRAVEL_MODES.map(async (mode) => {
        const idx = people.map((_, i) => i).filter((i) => normalizeTravelMode(people[i].travelMode) === mode);
        if (!idx.length) return;
        const rows = await routeDistancesToPoint(idx.map((i) => pt(people[i])), patient, { travelMode: mode });
        idx.forEach((i, n) => (toPatient[i] = rows[n]));
      })
    );

    // walking hub leg, for the EXTENDED WALKING RULE (walk to patient + walk patient -> hub <= 51 min)
    let walkHubMin = null;
    if (hubPoint && people.some((s) => normalizeTravelMode(s.travelMode) === "walking")) {
      const h = await routeDistance(patient, hubPoint, { travelMode: "walking" });
      walkHubMin = usableMeters(h) != null ? usableMinutes(h) : null;
    }

    const rows = people.map((s, i) => {
      const id = String(s._id);
      const straightToPatientM = Math.round(haversineM(pt(s), patient));
      const effP = usableMeters(toPatient[i]); // what the matcher really compares (metres)
      const effMin = usableMinutes(toPatient[i]); // ... and minutes
      const withinDistance = effP != null && effP <= rules.patientMaxM;
      const bandIdx =
        withinDistance && effMin != null ? rules.stagesMin.findIndex((m) => effMin <= m) : -1;
      // Extended walking rule: same cascade, evaluated from WALK_EXTENDED_FROM_STAGE on
      const isWalker = normalizeTravelMode(s.travelMode) === "walking";
      const combinedWalkMin = isWalker && effMin != null && walkHubMin != null ? effMin + walkHubMin : null;
      const extendedOk = withinDistance && combinedWalkMin != null && combinedWalkMin <= rules.walkCombinedMaxMin;
      const extIdx = extendedOk ? rules.walkExtendedFromStage - 1 : -1;
      const candidates = [bandIdx, extIdx].filter((x) => x >= 0);
      const stageIdx = candidates.length ? Math.min(...candidates) : -1;
      const qualifiedBy = stageIdx < 0 ? null : stageIdx === bandIdx ? "band" : "extended";
      const stage = stageIdx >= 0 ? stageIdx + 1 : null;
      const notified = notifiedIds.has(id);
      const picked = id === pickedId;

      let outcome;
      if (picked) {
        outcome = "PICKED - accepted the job";
      } else if (notified) {
        if (job.Status === "Matched") outcome = "FELL OFF - was notified, but another scientist accepted first";
        else if (job.Status === "NoCoverage") outcome = "FELL OFF - was notified, nobody accepted before the 48s ended";
        else if (job.Status === "Canceled") outcome = "FELL OFF - was notified, then the patient canceled";
        else outcome = "notified - still waiting for a response";
      } else if (!s.isOnline) {
        outcome = "never notified - offline";
      } else if (!s.isAvailable) {
        outcome = "never notified - busy (not available)";
      } else if (effP == null || effMin == null) {
        outcome = "never notified - road distance/time to the patient could not be verified (strict rule)";
      } else if (!withinDistance) {
        outcome = `never notified - beyond the ${rules.patientMaxM} m cap (road ${Math.round(effP)} m, ${effMin.toFixed(1)} min)`;
      } else if (stage == null) {
        outcome = `never notified - ${effMin.toFixed(1)} min is slower than the last stage (${rules.stagesMin[rules.stagesMin.length - 1]} min)${isWalker ? combinedWalkMin != null ? ` and the combined walk is ${combinedWalkMin.toFixed(1)} min (> ${rules.walkCombinedMaxMin})` : " (combined walking journey could not be verified)" : ""}`;
      } else if (job.Status === "Searching") {
        outcome = `not reached yet - enters at stage ${stage} (<= ${rules.stagesMin[stageIdx]} min, ~${stageIdx * stageSec}s) by the ${qualifiedBy === "extended" ? `extended walking rule (${combinedWalkMin.toFixed(1)} min combined <= ${rules.walkCombinedMaxMin})` : "minute band"}`;
      } else {
        outcome = `never notified - the job ended before stage ${stage} (<= ${rules.stagesMin[stageIdx]} min) opened at ~${stageIdx * stageSec}s`;
      }

      return {
        name: s.displayName,
        id,
        travelMode: normalizeTravelMode(s.travelMode),
        seeded: /seed\+sci/i.test(s.email || ""),
        picked,
        notified,
        outcome,
        stage,
        qualifiedBy,
        combinedWalkMin: combinedWalkMin != null ? Math.round(combinedWalkMin * 10) / 10 : null,
        stageMin: stageIdx >= 0 ? rules.stagesMin[stageIdx] : null,
        opensAtSec: stageIdx >= 0 ? stageIdx * stageSec : null,
        straightToPatientM,
        roadToPatientM: Number.isFinite(toPatient[i]?.meters) ? Math.round(toPatient[i].meters) : null,
        minutesToPatient: effMin != null ? Math.round(effMin * 10) / 10 : null,
        distanceSource: toPatient[i]?.source || null,
        traffic: toPatient[i]?.traffic || null,
        isOnline: s.isOnline,
        isAvailable: s.isAvailable,
      };
    });

    // How the patient's "N scientists are viewing" counter moves: one step per stage.
    let running = 0;
    const countTimeline = rules.stagesMin.map((stageMin, k) => {
      const joined = rows.filter((r) => r.notified && r.stage === k + 1).map((r) => r.name);
      running += joined.length;
      return { stage: k + 1, stageMin, atSec: k * stageSec, joined, countAfter: running };
    });

    return res.json({
      job: {
        id: String(job._id),
        status: job.Status,
        pin: job.location || null,
        hub: hubPoint ? { ...hubPoint, name: job.hubSnapshot?.name, patientToHubKm: job.hubSnapshot?.distanceKm } : null,
        stageIndex: job.matchingState?.stageIndex,
        currentStageMin: job.matchingState?.currentStageMin,
        notifiedCount: job.matchingState?.notifiedCount,
      },
      distanceMode: matchingConfig().distanceMode,
      rule: `Notified at the first stage (${rules.stagesMin.join(" / ")} min) whose time band covers the scientist's travel time to the patient IN THEIR OWN MODE (walking scientists by walking time, driving scientists by driving time), and only if that route is <= ${rules.patientMaxM} m. Walking scientists ALSO qualify by the extended rule (walking to patient + walking patient -> hub <= ${rules.walkCombinedMaxMin} min) from stage ${rules.walkExtendedFromStage}, in the same cascade. The hub (patient -> hub <= ${rules.hubMaxM} m) was verified when the hub was assigned. Stages open every ${stageSec}s.`,
      pickedBy: rows.find((r) => r.picked)?.name || job.scientistSnapshot?.displayName || null,
      fellOff: rows.filter((r) => r.outcome.startsWith("FELL OFF")).map((r) => r.name),
      neverNotified: rows
        .filter((r) => !r.notified && !r.picked)
        .map((r) => ({ name: r.name, why: r.outcome })),
      countTimeline,
      scientists: rows,
    });
  } catch (e) {
    console.error("[job-trace] failed:", e);
    return res.status(500).json({ message: e.message });
  }
});

router.get("/jobs", async (_req, res) => {
  res.json({ data: await TestRequest.find().sort({ createdAt: -1 }).limit(10) });
});

router.post("/accept", async (req, res) => {
  const { jobId, scientistId } = req.body || {};
  const r = await acceptBooking(jobId, scientistId);
  res.status(r.ok ? 200 : r.status).json(r.ok ? { message: "Booking locked", data: r.job } : { message: r.message });
});

router.post("/cancel-job", async (req, res) => {
  const job = await cancelMatching(req.body?.jobId);
  if (!job) return res.status(409).json({ message: "Can't cancel (already matched, canceled, or not found)" });
  res.json({ message: "Canceled", data: job });
});

/** Fakes the crash window: busy + a job id that never became Matched + claimed 5 min ago. */
router.post("/simulate-stuck", async (req, res) => {
  const target = req.body?.scientistId
    ? await ScientistOps.findById(req.body.scientistId)
    : await ScientistOps.findOne({ email: /seed\+sci/i }).sort({ displayName: 1 });
  if (!target) return res.status(404).json({ message: "No scientist (seed first)" });
  target.isAvailable = false;
  target.currentJobId = new mongoose.Types.ObjectId();
  target.claimedAt = new Date(Date.now() - 5 * 60 * 1000);
  await target.save();
  res.json({ message: "Scientist is now stuck busy. Run repair to free them.", data: target });
});

router.post("/google-check", async (_req, res) => {
  res.json(await checkGoogle());
});

router.post("/mapbox-check", async (_req, res) => {
  res.json(await checkMapbox());
});

router.get("/scientists", async (_req, res) => {
  res.json({ data: await ScientistOps.find().sort({ displayName: 1 }) });
});

/**
 * ============================================================
 * SEED ONE CUSTOM SCIENTIST   (for edge cases /seed can't make)
 * POST /match-dev/scientists
 * body { lat, lng, displayName?, isOnline?, isAvailable?, email?, travelMode?: "driving"|"walking" }
 *
 * Unlike /seed (which always wipes + recreates the fixed 4-scientist set),
 * this adds exactly ONE scientist wherever you want, so you can probe:
 *  - offline or busy scientists (isOnline:false / isAvailable:false)
 *  - a scientist sitting exactly on a stage boundary (2/4/7/10 min) or on the 3.5 km cap
 *  - a scientist fast by road but just beyond 3.5 km (must never qualify)
 *  - many scientists stacked at once (Matrix chunking, duplicates, etc.)
 * Pass `email` to use a REAL inbox (e.g. your own) instead of the fake
 * seed+sci-* one - do that to test the offer email end-to-end. Without it,
 * a "seed+sci-custom-*" email is generated so /reset, /match-dev/seed's
 * cleanup, and job-trace's "seeded" flag all pick it up like any other
 * seed scientist.
 * ============================================================
 */
router.post("/scientists", async (req, res) => {
  try {
    const { lat, lng, displayName, isOnline, isAvailable, email, travelMode } = req.body || {};
    if (travelMode !== undefined && !isValidTravelMode(travelMode)) {
      return res.status(400).json({ message: `travelMode must be one of: ${TRAVEL_MODES.join(", ")}` });
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return res.status(400).json({ message: "lat and lng must be valid numbers" });
    }

    const slug = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const doc = await ScientistOps.create({
      displayName: displayName?.trim() || `Seed ${normalizeTravelMode(travelMode) === "walking" ? "Walker" : "Driver"} ${slug}`,
      email: email?.trim().toLowerCase() || `seed+sci-custom-${slug}@lably.test`,
      latitude,
      longitude,
      travelMode: normalizeTravelMode(travelMode),
      isOnline: isOnline === undefined ? true : Boolean(isOnline),
      isAvailable: isAvailable === undefined ? true : Boolean(isAvailable),
    });
    res.status(201).json({ message: "Scientist seeded", data: doc });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * ============================================================
 * UNSEED
 * DELETE /match-dev/scientists/:id         remove one scientist
 * DELETE /match-dev/scientists             remove every SEEDED scientist
 * DELETE /match-dev/scientists?all=true    remove EVERY scientist, seeded or not
 * ============================================================
 */
router.delete("/scientists/:id", async (req, res) => {
  const doc = await ScientistOps.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Removed", data: doc });
});

router.delete("/scientists", async (req, res) => {
  const filter = req.query.all === "true" ? {} : { email: /seed\+sci/i };
  const r = await ScientistOps.deleteMany(filter);
  res.json({
    message: filter.email ? "Removed all seeded scientists" : "Removed ALL scientists",
    deletedCount: r.deletedCount,
  });
});

router.get("/hubs", async (_req, res) => {
  res.json({ data: await Hub.find() });
});

/**
 * ============================================================
 * HUB EDITING  (move/create/remove a hub for coverage edge cases)
 * POST   /match-dev/hubs        create a hub  { name?, lat, lng, serviceRadiusKm?, isActive? }
 * PATCH  /match-dev/hubs/:id    move/edit a hub (any subset of the same fields)
 * DELETE /match-dev/hubs/:id    remove a hub (e.g. to test "no coverage here")
 * ============================================================
 */
router.post("/hubs", async (req, res) => {
  try {
    const { name, lat, lng, serviceRadiusKm, isActive, address } = req.body || {};
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ message: "lat and lng must be valid numbers" });
    }
    const hub = await Hub.create({
      name: name?.trim() || `Dev Hub ${Date.now().toString(36)}`,
      address: address || "",
      latitude,
      longitude,
      serviceRadiusKm: serviceRadiusKm === undefined ? 2.25 : Number(serviceRadiusKm),
      isActive: isActive === undefined ? true : Boolean(isActive),
    });
    res.status(201).json({ message: "Hub created", data: hub });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch("/hubs/:id", async (req, res) => {
  try {
    const { name, lat, lng, serviceRadiusKm, isActive, address } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name;
    if (address !== undefined) update.address = address;
    if (serviceRadiusKm !== undefined) update.serviceRadiusKm = Number(serviceRadiusKm);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (lat !== undefined) {
      const latitude = Number(lat);
      if (!Number.isFinite(latitude)) return res.status(400).json({ message: "lat must be a number" });
      update.latitude = latitude;
    }
    if (lng !== undefined) {
      const longitude = Number(lng);
      if (!Number.isFinite(longitude)) return res.status(400).json({ message: "lng must be a number" });
      update.longitude = longitude;
    }
    const hub = await Hub.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!hub) return res.status(404).json({ message: "Hub not found" });
    res.json({ message: "Hub updated", data: hub });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete("/hubs/:id", async (req, res) => {
  const hub = await Hub.findByIdAndDelete(req.params.id);
  if (!hub) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Hub removed", data: hub });
});

router.get("/waitlist", async (_req, res) => {
  res.json({ data: await Waitlist.find().sort({ createdAt: -1 }).limit(20) });
});

router.patch("/scientists/:id", async (req, res) => {
  const allowed = ["latitude", "longitude", "isOnline", "isAvailable", "travelMode"];
  if (req.body.travelMode !== undefined && !isValidTravelMode(req.body.travelMode)) {
    return res.status(400).json({ message: `travelMode must be one of: ${TRAVEL_MODES.join(", ")}` });
  }
  const update = { lastLocationAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) update[k] = k === "travelMode" ? normalizeTravelMode(req.body[k]) : req.body[k];
  }
  const doc = await ScientistOps.findByIdAndUpdate(req.params.id, update, {
    new: true,
  });
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json({ data: doc });
});

export default router;
