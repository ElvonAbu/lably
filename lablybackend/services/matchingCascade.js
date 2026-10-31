import mongoose from "mongoose";
import TestRequest from "../models/TestRequest.js";
import Hub from "../models/Hub.js";
import ScientistOps from "../models/ScientistOps.js";
import Waitlist from "../models/Waitlist.js";
import { routeDistance, routeDistancesToPoint, PRIMARY_PROVIDER } from "../utils/routeDistance.js";
import { runComparison, compareConfig } from "../utils/providerCompare.js";
import { distanceM as haversineM, distanceKm as haversineKm } from "../utils/geo.js";
import { usableMeters, usableMinutes, policyConfig } from "../utils/distancePolicy.js";
import { emitJobUpdate, emitBookingOffer } from "./realtime.js";
import { sendBookingOfferEmails } from "../utils/scientistNotify.js";
import { normalizeTravelMode } from "../utils/travelMode.js";

/**
 * services/matchingCascade.js
 * ============================================================
 * THIS FILE IS IN CHARGE OF MATCHING.
 *
 * SUMMARY
 *   - Patient creates a TestRequest -> hub assigned -> startMatchingCascade()
 *   - 4 stages, 12s each = 48s HARD limit. Stages are TRAVEL-TIME bands:
 *       2 -> 4 -> 7 -> 10 minutes (MATCH_STAGES_MIN)
 *   - WALKING and DRIVING scientists share this ONE system. Each scientist
 *     declares a travel mode (ScientistOps.travelMode) and THEIR ETA is measured in
 *     that mode (walking route + walking time, or driving route + driving time).
 *   - Each stage notifies NEW online+idle scientists whose verified route
 *     to the patient, in THEIR mode, is within BOTH limits:
 *       distance <= 3.5 km (MATCH_MAX_PATIENT_M, hard cap)
 *       time     <= the stage's minutes
 *     Same minute band = same stage = notified at the same instant, whatever the
 *     mode: nobody gets a head start for walking or for driving.
 *   - EXTENDED WALKING RULE (part of the SAME cascade, not a second phase): a walking
 *     scientist also qualifies when
 *         walking time to patient + walking time patient -> hub <= 51 min
 *     (WALK_COMBINED_MAX_MIN). It is evaluated in every stage from
 *     WALK_EXTENDED_FROM_STAGE (default: the last), next to the minute bands, and the
 *     distance caps still apply independently (scientist -> patient <= 3.5 km; hub
 *     <= 2.25 km, checked at hub assignment). notifiedScientistIds guarantees nobody is
 *     offered the same request twice, whichever rule made them eligible.
 *     A scientist 3.6 km away never qualifies, however fast the route is.
 *   - The sample leg (patient -> assigned hub, <= 2.25 km by road) is checked
 *     once, when the hub is assigned (assignNearestHub), NOT per scientist.
 *   - The scientist -> patient -> hub total, in the scientist's own mode, is
 *     calculated and shown in the offer AND the offer email (combinedJourneyM /
 *     combinedJourneyMin) but is NOT a rejection rule.
 *   - Distance: free Haversine prefilter -> road Matrix (Google Pro / Essentials -> Mapbox -> Legacy; road + time) confirm, one call per travel mode
 *   - First Accept wins (atomic). Every ending withdraws the other offers.
 *   - Nobody accepts in 48s -> NoCoverage + waitlist
 *
 * See docs/FEATURES.md for the numbered feature log (F1..F46).
 */

export const STAGE_DURATION_MS = 12_000;

/**
 * MATCHING RULES, read at call time (so .env edits apply after a restart and
 * dotenv load order never matters). All limits are VERIFIED ROAD limits.
 *
 *   MATCH_STAGES_MIN       "2,4,7,10"  driving-time band of each stage (minutes)
 *   MATCH_MAX_PATIENT_M    3500        scientist -> patient road distance cap (m)
 *   MATCH_HUB_MAX_M        2250        patient (collection point) -> hub road cap (m)
 *   WALK_COMBINED_MAX_MIN  51          EXTENDED WALKING RULE: walking time to the patient
 *                                      + walking time patient -> hub <= this (minutes)
 *   WALK_EXTENDED_FROM_STAGE  last     1-based stage from which the extended walking rule is
 *                                      applied. Default = the last stage, so a long-walk
 *                                      scientist joins the cascade at its widest point and
 *                                      never jumps ahead of anyone in the earlier minute bands.
 *                                      1 = apply from the very first stage.
 */
export function matchRules() {
  const stagesMin = String(process.env.MATCH_STAGES_MIN || "2,4,7,10")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const num = (name, def) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  const stages = stagesMin.length ? stagesMin : [2, 4, 7, 10];
  const extFrom = Math.floor(Number(process.env.WALK_EXTENDED_FROM_STAGE));
  return {
    walkCombinedMaxMin: num("WALK_COMBINED_MAX_MIN", 51),
    walkExtendedFromStage: extFrom >= 1 && extFrom <= stages.length ? extFrom : stages.length,
    stagesMin: stages,
    patientMaxM: num("MATCH_MAX_PATIENT_M", 3500),
    hubMaxM: num("MATCH_HUB_MAX_M", 2250),
    stageDurationMs: STAGE_DURATION_MS,
    totalSearchMs: stages.length * STAGE_DURATION_MS, // 4 x 12s = 48s
    replyWaitMs: replyWaitMs(), // "Waiting for a reply" window after the 48 s
  };
}

/** Max time one stage may spend waiting on Google (rest falls back to Haversine). */
export const STAGE_BUDGET_MS = 8_000;

/**
 * Haversine prefilter slack. Road distance is normally >= straight-line, BUT
 * Google snaps both points to the nearest road, which can make the road
 * distance a few tens of metres SHORTER than the raw straight line.
 * 100 m of slack stops us wrongly excluding someone on that edge.
 */
export const PREFILTER_SLACK_M = 100;

/** Current matching rules, for logs and GET /match-dev/route-status. */
export function matchingConfig() {
  return {
    ...policyConfig(),
    ...matchRules(),
    stageBudgetMs: STAGE_BUDGET_MS,
  };
}

// REPLY WAIT: the patient's countdown is 48 s. When it reaches 0 the app shows "Waiting for a
// reply", and THAT is when this clock starts: scientists who were notified can still accept for
// MATCH_REPLY_WAIT_SECONDS more seconds (default 30). When it runs out with no accept the job
// ends (NoCoverage / "try again"). Change it in lablybackend/.env, restart the server.
// (Replaces the old MATCH_GRACE_MS and MATCH_OFFER_MIN_SECONDS.)
export function replyWaitMs() {
  const n = Number(process.env.MATCH_REPLY_WAIT_SECONDS);
  return (Number.isFinite(n) && n >= 0 ? n : 30) * 1000;
}

/** A scientist claimed longer than this ago with no matching job is "stuck". */
export const STUCK_GRACE_MS = 30_000;

// ---------------------------------------------------------------
// TIMERS (in this process's memory): jobId -> { stage, expiry }
//   stage  = the timer for the NEXT stage
//   expiry = the one timer that guarantees NoCoverage at expiresAt
// ---------------------------------------------------------------
const timers = new Map();

// Why a search ended, for troubleshooting (in this process's memory only):
//   jobId -> { candidates, unverified, overDistance, overTime, notified }
const stageNotes = new Map();

function clearTimer(id) {
  const key = String(id);
  stageNotes.delete(key);
  const t = timers.get(key);
  if (!t) return;
  if (t.stage) clearTimeout(t.stage);
  if (t.expiry) clearTimeout(t.expiry);
  timers.delete(key);
}

/** The ONE timer that ends the search at expiresAt, even if a stage hangs. */
function scheduleExpiry(id, expiresAtMs) {
  const key = String(id);
  const t = timers.get(key) || {};
  if (t.expiry) clearTimeout(t.expiry);
  t.expiry = setTimeout(
    () => endNoCoverage(id).catch((e) => console.error("endNoCoverage", e)),
    Math.max(0, expiresAtMs - Date.now())
  );
  timers.set(key, t);
}

/** Run stage n at startedAt + n*12s (ABSOLUTE time, so delays can't pile up). */
function scheduleStage(id, stageIndex, startedAtMs) {
  if (stageIndex >= matchRules().stagesMin.length) return; // expiry timer ends the search
  const key = String(id);
  const t = timers.get(key) || {};
  if (t.stage) clearTimeout(t.stage);
  const runAt = startedAtMs + stageIndex * STAGE_DURATION_MS;
  t.stage = setTimeout(
    () =>
      runStage(id, stageIndex, startedAtMs).catch((e) =>
        console.error("runStage", e)
      ),
    Math.max(0, runAt - Date.now())
  );
  timers.set(key, t);
}

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------

/** Tell every notified scientist (except `exceptId`) that the offer is dead. */
function withdrawOffers(job, status, exceptId = null) {
  for (const id of job.matchingState?.notifiedScientistIds || []) {
    if (exceptId && String(id) === String(exceptId)) continue;
    emitBookingOffer(id, {
      testRequestId: job._id,
      status, // "Matched" | "NoCoverage" | "Canceled"
      withdrawn: true,
    });
  }
}

/** Free a scientist we claimed (only if the claim is still ours). */
async function releaseScientist(scientistId, jobId) {
  await ScientistOps.updateOne(
    { _id: scientistId, currentJobId: jobId },
    { $set: { isAvailable: true, currentJobId: null, claimedAt: null } }
  );
}

// ---------------------------------------------------------------
// HUB ASSIGNMENT (called when the TestRequest is created)
// ---------------------------------------------------------------
export async function assignNearestHub(patientLoc) {
  const hubs = await Hub.find({ isActive: true });
  const maxKm = matchRules().hubMaxM / 1000; // RULE B: patient (collection point) -> hub, by road
  const patient = { lat: patientLoc.lat, lng: patientLoc.lng };

  let best = null;
  let bestD = Infinity;
  let bestSource = "haversine";
  let bestRoute = null; // what the matcher measured for the winning hub (for the comparison log)

  // FREE PREFILTER first (clearly too far in a straight line -> no Google request),
  // then confirm every remaining hub by ROAD at the same time (speed).
  const candidates = hubs
    .map((hub) => ({
      hub,
      hubPoint: { lat: hub.latitude, lng: hub.longitude },
      cap: Math.min(hub.serviceRadiusKm ?? maxKm, maxKm),
    }))
    .filter(
      (c) => haversineKm(patient, c.hubPoint) <= c.cap + PREFILTER_SLACK_M / 1000
    );
  // CONFIRM by ROAD (Google Directions). The limit is a ROAD limit, so a
  // Haversine fallback is only used if distancePolicy allows it
  // (strict: hub skipped when unverified; estimate: straight-line x detour).
  const routes = await Promise.all(
    candidates.map((c) =>
      routeDistance(patient, c.hubPoint, { deadlineAt: Date.now() + 4_000 })
    )
  );
  for (let i = 0; i < candidates.length; i++) {
    const { hub, cap } = candidates[i];
    const r = routes[i];
    const meters = usableMeters(r);
    if (meters == null) {
      console.warn(`LABLY hub "${hub.name}" skipped: road distance could not be verified`);
      continue;
    }
    const km = meters / 1000;
    if (km <= cap && km < bestD) {
      bestD = km;
      best = hub;
      bestRoute = r;
      bestSource =
        r.source === "haversine" && policyConfig().distanceMode !== "haversine"
          ? "estimate"
          : r.source;
    }
  }

  if (!best) return null;

  // COMPARISON LISTENER: ask BOTH providers about patient -> hub and print it.
  // Fire-and-forget: never delays or changes hub assignment.
  runComparison({
    jobId: null,
    trigger: "hub_assignment",
    primary: PRIMARY_PROVIDER,
    patient,
    hub: { name: best.name, lat: best.latitude, lng: best.longitude },
    usedPatientToHub: bestRoute && {
      source: bestRoute.source,
      sku: bestRoute.sku,
      meters: bestRoute.meters,
      minutes: bestRoute.minutes,
    },
  });

  return { hub: best, distanceKm: bestD, distanceSource: bestSource };
}

// ---------------------------------------------------------------
// ONE STAGE: find + notify new scientists
// ---------------------------------------------------------------
export async function notifyNewScientists(job, stageIndex) {
  const rules = matchRules();
  const stageMin = rules.stagesMin[stageIndex];
  const deadlineAt = Date.now() + STAGE_BUDGET_MS; // this stage's Google time budget

  const patient = { lat: job.location.lat, lng: job.location.lng };
  const hubPoint = {
    lat: job.hubSnapshot.latitude,
    lng: job.hubSnapshot.longitude,
  };

  const alreadyIds = job.matchingState?.notifiedScientistIds || [];

  // Only online + idle, and never someone already notified for this job
  const notifiedBefore = new Set(alreadyIds.map(String));
  const scientists = (
    await ScientistOps.find({
      isOnline: true,
      isAvailable: true,
      _id: { $nin: alreadyIds },
    })
  ).filter((s) => !notifiedBefore.has(String(s._id))); // never offer the same request twice

  // --- STEP 1: FREE Haversine prefilter ---------------------------
  // Straight-line is (almost always) <= road distance, so anyone clearly
  // beyond the distance cap in a straight line is out. Zero Google cost.
  // (Only the patient leg: the hub leg belongs to the patient, not the scientist.)
  const nearby = scientists.filter((s) => {
    const p = { lat: s.latitude, lng: s.longitude };
    return haversineM(p, patient) <= rules.patientMaxM + PREFILTER_SLACK_M;
  });

  // --- STEP 2: ROAD + TIME confirm via Google MATRIX --------------
  // ONE request for the whole stage (scientist -> patient). It returns the
  // distance AND the duration together, so the minute rule costs nothing
  // extra. Cached pairs are free, so someone who is still too far in minutes
  // is re-checked next stage without spending more allowance.
  const pt = (s) => ({ lat: s.latitude, lng: s.longitude });

  // usableMeters()/usableMinutes() enforce the ROAD rule: a number is only
  // used if Google produced it (or the policy / test mode explicitly allows
  // otherwise). Unverified candidates are held back THIS stage and re-checked
  // next stage.
  let unverified = 0;
  let overDistance = 0; // beyond the hard distance cap: can never qualify
  let overTime = 0; // within the cap but too slow for THIS stage: may qualify later

  // ONE Matrix call per travel mode (walkers and drivers are measured differently),
  // run in parallel; the answers are put back in `nearby` order.
  const modeOf = (s) => normalizeTravelMode(s.travelMode);
  const toPatientAll = new Array(nearby.length);
  const hubLeg = { driving: null, walking: null };
  const modesPresent = [...new Set(nearby.map(modeOf))];

  // SPEED: the scientist -> patient matrices and the patient -> hub legs do not depend on each
  // other, so they all run AT THE SAME TIME (one Google round trip instead of two).
  await Promise.all([
    ...["driving", "walking"].map(async (mode) => {
      const idx = nearby.map((_, i) => i).filter((i) => modeOf(nearby[i]) === mode);
      if (!idx.length) return;
      const rows = await routeDistancesToPoint(idx.map((i) => pt(nearby[i])), patient, {
        deadlineAt,
        travelMode: mode,
      });
      idx.forEach((i, n) => (toPatientAll[i] = rows[n]));
    }),
    // Patient -> hub leg, in each present mode's own terms: needed for the scientist's combined
    // journey shown in the offer + email and for the EXTENDED WALKING RULE. (The hub DISTANCE rule
    // was verified at hub assignment and is independent of this.)
    ...modesPresent.map(async (mode) => {
      try {
        const h = await routeDistance(patient, hubPoint, { deadlineAt, travelMode: mode });
        const m = usableMeters(h);
        const min = usableMinutes(h);
        if (m != null) hubLeg[mode] = { meters: m, minutes: min };
      } catch {
        /* the hub leg then stays unknown */
      }
    }),
  ]);
  // driving falls back to the verified road distance saved on the job when the hub was assigned
  if (!hubLeg.driving && Number.isFinite(job.hubSnapshot.distanceKm) && modesPresent.includes("driving")) {
    hubLeg.driving = { meters: job.hubSnapshot.distanceKm * 1000, minutes: null };
  }

  // --- ONE qualification test per scientist, ONE cascade -----------------------------
  // A scientist qualifies THIS stage when the distance cap holds (own mode) AND either
  //   BAND      their own-mode travel time to the patient <= this stage's minutes, or
  //   EXTENDED  (walking only, from WALK_EXTENDED_FROM_STAGE on) walking to patient +
  //             walking patient -> hub <= WALK_COMBINED_MAX_MIN
  // Nobody is ranked: every qualifier of the stage is notified at the same instant,
  // whatever their mode and whichever rule qualified them.
  const extendedActive = stageIndex + 1 >= rules.walkExtendedFromStage;
  const confirmed = [];
  let extendedN = 0;
  nearby.forEach((s, i) => {
    const d = toPatientAll[i];
    const mode = modeOf(s);
    const m = usableMeters(d);
    if (m == null) return void unverified++;
    if (m > rules.patientMaxM) return void overDistance++; // distance cap, in THEIR mode (independent rule)
    const min = usableMinutes(d);
    if (min == null) return void unverified++;

    let qualifiedBy = null;
    if (min <= stageMin) {
      qualifiedBy = "band";
    } else if (mode === "walking" && extendedActive) {
      const hub = hubLeg.walking;
      if (!hub || hub.minutes == null) return void unverified++; // hub leg not verified: re-check next stage
      if (min + hub.minutes <= rules.walkCombinedMaxMin) qualifiedBy = "extended";
    }
    if (!qualifiedBy) return void overTime++; // may qualify in a later stage

    if (qualifiedBy === "extended") extendedN++;
    confirmed.push({ scientist: s, travelMode: mode, qualifiedBy, toPatient: { ...d, meters: m, minutes: min } });
  });

  // --- COMPARISON LISTENER (Google vs Mapbox, console only) ------------
  // Fire-and-forget: asks BOTH providers where each idle scientist, the patient
  // and the hub are, and prints it. Never delays or changes the match.
  // Includes idle scientists beyond the prefilter (within COMPARE_RADIUS_M) so a
  // "too far" scientist is still visible in the log.
  {
    const cmp = compareConfig();
    if (cmp.enabled) {
      const usedById = new Map(nearby.map((s, i) => [String(s._id), toPatientAll[i]]));
      const toCompare = scientists
        .filter((s) => haversineM({ lat: s.latitude, lng: s.longitude }, patient) <= cmp.radiusM)
        .map((s) => {
          const d = usedById.get(String(s._id));
          return {
            id: s._id,
            name: s.displayName,
            lat: s.latitude,
            lng: s.longitude,
            travelMode: modeOf(s),
            used: d
              ? { toPatient: { source: d.source, sku: d.sku, traffic: d.traffic, meters: d.meters, minutes: d.minutes } }
              : undefined,
          };
        });
      runComparison({
        jobId: job._id,
        trigger: "stage",
        stage: stageIndex + 1,
        stageMin,
        primary: PRIMARY_PROVIDER,
        patient,
        hub: { name: job.hubSnapshot.name, ...hubPoint },
        scientists: toCompare,
      });
    }
  }

  const round1 = (x) => Math.round(x * 10) / 10;

  // remember why nothing happened, in case the search ends in NoCoverage
  const notes = stageNotes.get(String(job._id)) || {
    candidates: 0,
    unverified: 0,
    overDistance: 0,
    overTime: 0,
    notified: 0,
  };
  notes.candidates += nearby.length;
  notes.unverified += unverified;
  notes.overDistance += overDistance;
  notes.overTime += overTime;
  notes.notified += confirmed.length;
  stageNotes.set(String(job._id), notes);

  // Visible test log: how each stage was measured
  const roadN = confirmed.filter((c) => c.toPatient.source !== "haversine").length;
  console.log(
    `LABLY job ${job._id} stage ${stageIndex + 1}/${rules.stagesMin.length} ` +
      `(<= ${stageMin} min, <= ${rules.patientMaxM} m): idle=${scientists.length} prefilter=${nearby.length} ` +
      `notified=${confirmed.length} (driving=${confirmed.filter((c) => c.travelMode === "driving").length}, ` +
      `walking=${confirmed.filter((c) => c.travelMode === "walking").length}; by band=${confirmed.length - extendedN}, ` +
      `by extended walking rule (<= ${rules.walkCombinedMaxMin} min${extendedActive ? "" : ", not active yet"})=${extendedN}; ` +
      `road-verified=${roadN}, other=${confirmed.length - roadN}) ` +
      `tooFar=${overDistance} tooSlowThisStage=${overTime} ` +
      `unverified=${unverified}${unverified ? " (held back, rechecked next stage)" : ""}`
  );

  const allIds = [...alreadyIds, ...confirmed.map((c) => c.scientist._id)];

  // SPEED: the conditional job update (only if the job is STILL Searching) is written WHILE the
  // offers and emails are already on their way, instead of before them. If it turns out the job
  // was accepted / canceled in that instant, the offers are withdrawn right after.
  const updatedPromise = TestRequest.findOneAndUpdate(
    { _id: job._id, Status: "Searching" },
    {
      $set: {
        "matchingState.stageIndex": stageIndex,
        "matchingState.currentStageMin": stageMin,
        "matchingState.notifiedScientistIds": allIds,
        "matchingState.notifiedCount": allIds.length, // patient UI "N viewing"
      },
    },
    { new: true }
  );

  const emails = [];
  for (const c of confirmed) {
    const leg = hubLeg[c.travelMode]; // patient -> hub in THIS scientist's mode
    const hubLegM = leg ? Math.round(leg.meters) : null;
    const hubLegMin = leg && leg.minutes != null ? round1(leg.minutes) : null;
    const combinedJourneyM = hubLegM != null ? Math.round(c.toPatient.meters + hubLegM) : null;
    const combinedJourneyMin = hubLegMin != null ? round1(c.toPatient.minutes + leg.minutes) : null; // add unrounded, round once

    // TODO later: send an APPROXIMATE area instead of the exact address
    // until the scientist accepts.
    emitBookingOffer(c.scientist._id, {
      testRequestId: job._id,
      status: "Searching",
      stageMin, // the travel-time band this offer went out in
      travelMode: c.travelMode, // "driving" | "walking": the mode every number below is in
      qualifiedBy: c.qualifiedBy, // "band" | "extended" (extended walking rule: combined journey <= 51 min)
      patientLocation: job.location,
      hub: job.hubSnapshot,
      distanceM: Math.round(c.toPatient.meters), // scientist -> patient, in their mode
      distanceMin: round1(c.toPatient.minutes), // scientist -> patient, travel time in their mode
      distanceSource: c.toPatient.source, // "google" | "mapbox" | "haversine"
      traffic: c.toPatient.traffic, // "aware" | "unaware" | "n/a" (walking)
      collectionToHubM: hubLegM, // patient -> hub, in their mode
      collectionToHubMin: hubLegMin,
      collectionToHubKm: hubLegM != null ? round1(hubLegM / 1000) : null, // kept for older clients
      combinedJourneyM, // scientist -> patient -> hub (shown, never a rejection rule)
      combinedJourneyMin,
    });

    emails.push({
      scientist: c.scientist,
      job,
      travelMode: c.travelMode,
      distanceM: c.toPatient.meters,
      distanceMin: c.toPatient.minutes,
      stageMin,
      collectionToHubM: hubLegM,
      collectionToHubMin: hubLegMin,
      combinedJourneyM,
      combinedJourneyMin,
    });
  }

  // Fire-and-forget: the in-app offers above are already out; the emails (one batch request for
  // the whole stage) are a second channel and never block this stage.
  if (emails.length) {
    sendBookingOfferEmails(emails).catch((err) =>
      console.error("LABLY booking offer emails failed:", err)
    );
  }

  const updated = await updatedPromise;
  if (!updated) {
    // The job was accepted / canceled in that instant: take the offers back.
    for (const c of confirmed) {
      emitBookingOffer(c.scientist._id, {
        testRequestId: job._id,
        status: "Canceled",
        withdrawn: true,
      });
    }
    return 0;
  }
  emitJobUpdate(updated.toObject()); // patient UI refresh
  return confirmed.length;
}

// ---------------------------------------------------------------
// CASCADE LIFECYCLE
// ---------------------------------------------------------------
/**
 * What is missing for this request: "scientist" and/or "hub".
 * -> { reason, missing, message } stored on TestRequest.noCoverage and Waitlist.
 */
/** Scientists were notified, but nobody accepted: not a coverage problem, so no waitlist. */
export function noAcceptanceCoverage() {
  return {
    reason: "no_acceptance",
    missing: [],
    message: "Scientists nearby are busy right now. Please try again in a few minutes.",
  };
}

export function describeCoverage(missing) {
  const m = [...new Set(missing)].sort();
  const hub = m.includes("hub");
  const sci = m.includes("scientist");
  if (hub && sci) {
    return {
      reason: "no_hub_and_scientist",
      missing: ["scientist", "hub"],
      message: "No scientist or hub is available in your area at the moment.",
    };
  }
  if (hub) {
    return {
      reason: "no_hub",
      missing: ["hub"],
      message: "No hub is available in your area at the moment.",
    };
  }
  return {
    reason: "no_scientist",
    missing: ["scientist"],
    message: "No scientist is available in your area at the moment.",
  };
}

/** Is any online + idle scientist inside the matching distance of this point? (one cheap query) */
async function anyScientistInRange(point, { includeBusy = false } = {}) {
  const radiusM = matchRules().patientMaxM + PREFILTER_SLACK_M;
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((point.lat * Math.PI) / 180)));
  const candidates = await ScientistOps.find({
    isOnline: true,
    ...(includeBusy ? {} : { isAvailable: true }),
    latitude: { $gte: point.lat - dLat, $lte: point.lat + dLat },
    longitude: { $gte: point.lng - dLng, $lte: point.lng + dLng },
  })
    .select("latitude longitude")
    .limit(100)
    .lean();
  return candidates.some(
    (s) => haversineM({ lat: s.latitude, lng: s.longitude }, point) <= radiusM
  );
}

// Fail fast: when there is no hub or nobody is online in range, say so now instead of
// making the patient wait 48 s for an answer that cannot change. MATCH_EARLY_NO_COVERAGE=false
// turns this off (then a scientist who comes online during the 48 s can still be matched).
const EARLY_NO_COVERAGE = String(process.env.MATCH_EARLY_NO_COVERAGE ?? "true") !== "false";

export async function startMatchingCascade(testRequestId) {
  clearTimer(testRequestId);

  const existing = await TestRequest.findById(testRequestId);
  if (!existing) return;

  // Missing pin or hub -> straight to NoCoverage (only from Pending)
  if (
    existing.location?.lat == null ||
    existing.location?.lng == null ||
    !existing.hubId ||
    !existing.hubSnapshot
  ) {
    const missing = ["hub"];
    const pin =
      existing.location?.lat != null && existing.location?.lng != null
        ? { lat: Number(existing.location.lat), lng: Number(existing.location.lng) }
        : null;
    if (!pin || !(await anyScientistInRange(pin))) missing.push("scientist");
    await endNoCoverage(testRequestId, ["Pending"], "no_hub_or_pin", missing);
    return;
  }

  // Hub exists but nobody is online and idle in range -> no coverage right away.
  if (EARLY_NO_COVERAGE) {
    const pin = {
      lat: Number(existing.location.lat),
      lng: Number(existing.location.lng),
    };
    if (!(await anyScientistInRange(pin))) {
      // Scientists are online in range but all busy: the area IS covered -> "try again",
      // no waitlist. Nobody online at all: that is missing coverage -> waitlist.
      const busy = await anyScientistInRange(pin, { includeBusy: true });
      await endNoCoverage(
        testRequestId,
        ["Pending"],
        busy ? "scientists_busy" : "no_scientist_online_in_range",
        ["scientist"]
      );
      return;
    }
  }

  const rules = matchRules();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + rules.totalSearchMs); // +48s (patient's timer)
  // last accept / NoCoverage: the patient's countdown end + the "Waiting for a reply" window
  const graceEndsAt = new Date(expiresAt.getTime() + rules.replyWaitMs);

  // Pending -> Searching atomically (never touches Canceled / Matched jobs)
  const job = await TestRequest.findOneAndUpdate(
    { _id: testRequestId, Status: "Pending" },
    {
      $set: {
        Status: "Searching",
        matchingState: {
          stageIndex: 0,
          currentStageMin: rules.stagesMin[0],
          notifiedScientistIds: [],
          notifiedCount: 0,
                    startedAt,
          expiresAt,
          graceEndsAt,
        },
      },
    },
    { new: true }
  );
  if (!job) return;

  emitJobUpdate(job.toObject());

  scheduleExpiry(job._id, graceEndsAt.getTime()); // hard stop: 48 s + reply wait
  scheduleStage(job._id, 0, startedAt.getTime()); // stage 1 now
}

async function runStage(testRequestId, stageIndex, startedAtMs) {
  const job = await TestRequest.findById(testRequestId);
  if (!job || job.Status !== "Searching") {
    clearTimer(testRequestId);
    return;
  }

  await notifyNewScientists(job, stageIndex);

  // Next stage is scheduled from the ORIGINAL start time, so slow work in
  // this stage can't push later stages (or the 48s end) back.
  scheduleStage(testRequestId, stageIndex + 1, startedAtMs);
}

/**
 * Searching -> NoCoverage (once), withdraw offers, add to waitlist.
 * Conditional update, so it can never overwrite Matched or Canceled.
 */
async function endNoCoverage(
  testRequestId,
  fromStatuses = ["Searching"],
  reason = null,
  missing = ["scientist"]
) {
  // Internal reason, for troubleshooting only (the patient just sees "no coverage").
  const n = stageNotes.get(String(testRequestId));
  const timedOut = reason == null; // the search timer ran out (vs. an early / explicit ending)
  if (!reason) {
    if (!n) reason = "unknown (server restarted during the search)";
    else if (n.notified > 0) reason = "offers_sent_nobody_accepted";
    else if (n.unverified > 0) reason = "routing_unverified";
    else if (n.candidates === 0) reason = "no_online_idle_scientist_within_range";
    else if (n.overDistance + n.overTime > 0) reason = "no_scientist_within_distance_and_time_limits";
    else reason = "no_eligible_scientist";
  }
  clearTimer(testRequestId);
    // Search timer ran out (timedOut):
  //   - offers WERE sent -> the area is covered, scientists just did not accept
  //     -> "try again", never the waitlist.
  //   - NO offer could be sent because every scientist failed the matching rules (too far by
  //     road / too slow for the bands) or nobody was online + idle -> that IS missing coverage
  //     -> waitlist ("no scientist").
  //   - the road provider was down (unverified) -> our problem, not the area's -> "try again".
  let coverage;
  if (reason === "scientists_busy") {
    coverage = noAcceptanceCoverage();
  } else if (timedOut) {
    const seen = await TestRequest.findById(testRequestId)
      .select("location matchingState.notifiedScientistIds")
      .lean();
    const offersSent = (seen?.matchingState?.notifiedScientistIds?.length || 0) > 0;
    if (offersSent || (n && n.unverified > 0 && n.notified === 0)) {
      coverage = noAcceptanceCoverage();
    } else if (n && n.candidates > 0) {
      // idle scientists were nearby on the map but none passed the matching rules
      coverage = describeCoverage(["scientist"]);
    } else {
      // nobody idle was ever a candidate: online-but-busy scientists are "try again",
      // nobody online at all is missing coverage
      const busyInRange =
        seen?.location?.lat != null && seen?.location?.lng != null
          ? await anyScientistInRange(
              { lat: Number(seen.location.lat), lng: Number(seen.location.lng) },
              { includeBusy: true }
            )
          : false;
      coverage = busyInRange ? noAcceptanceCoverage() : describeCoverage(["scientist"]);
    }
  } else {
    coverage = describeCoverage(missing);
  }
  const job = await TestRequest.findOneAndUpdate(
    { _id: testRequestId, Status: { $in: fromStatuses } },
    {
      $set: {
        Status: "NoCoverage",
        noCoverage: { ...coverage, at: new Date() },
      },
    },
    { new: true }
  );
  if (!job) return; // accepted or canceled in the meantime

  console.log(`LABLY job ${job._id} ended NoCoverage: ${reason}`);
  emitJobUpdate(job.toObject());
  withdrawOffers(job, "NoCoverage"); // no more live offers

  // Offers were sent but nobody accepted: the area IS covered, so no waitlist.
  if (coverage.reason === "no_acceptance") return;

  try {
    // The patient goes on the waitlist automatically (with the reason); the
    // "Join the waitlist" button in the app only confirms it.
    await Waitlist.updateOne(
      { testRequestId: job._id },
      {
        $setOnInsert: {
          supabaseUserId: job.supabaseUserId,
          email: job.email,
          testRequestId: job._id,
          lat: job.location?.lat,
          lng: job.location?.lng,
          address: job.location?.address,
        },
        $set: {
          reason: coverage.reason,
          missing: coverage.missing,
          note: coverage.message,
        },
      },
      { upsert: true }
    );
  } catch (e) {
    console.warn("Waitlist create failed:", e.message);
  }
}

// ---------------------------------------------------------------
// ACCEPT (first wins)
// ---------------------------------------------------------------
/**
 * Two atomic claims, in this order:
 *   1) the SCIENTIST  (isAvailable true -> false, stamped with currentJobId)
 *   2) the JOB        (Searching -> Matched)
 * If (2) fails we release the scientist. If the server DIES between 1 and 2,
 * repairStuckScientists() frees the scientist later.
 */
export async function acceptBooking(testRequestId, scientistId) {
  if (
    !mongoose.isValidObjectId(testRequestId) ||
    !mongoose.isValidObjectId(scientistId)
  ) {
    return { ok: false, status: 400, message: "Invalid id" };
  }

  // 1) CLAIM THE SCIENTIST. Only one concurrent request can flip true -> false,
  //    so one scientist can never hold two jobs.
  const scientist = await ScientistOps.findOneAndUpdate(
    { _id: scientistId, isOnline: true, isAvailable: true },
    {
      $set: {
        isAvailable: false,
        currentJobId: testRequestId, // <- crash-repair marker
        claimedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!scientist) {
    const exists = await ScientistOps.exists({ _id: scientistId });
    return exists
      ? { ok: false, status: 409, message: "Scientist not online/idle" }
      : { ok: false, status: 404, message: "Scientist not found" };
  }

  // 2) CLAIM THE JOB. Must still be Searching, still inside the 48s window,
  //    and this scientist must actually have been notified.
  const job = await TestRequest.findOneAndUpdate(
    {
      _id: testRequestId,
      Status: "Searching",
      // inside the 48 s window + grace (jobs created before the grace existed use expiresAt)
      $or: [
        { "matchingState.graceEndsAt": { $gt: new Date() } },
        {
          "matchingState.graceEndsAt": { $exists: false },
          "matchingState.expiresAt": { $gt: new Date() },
        },
      ],
      "matchingState.notifiedScientistIds": scientist._id,
    },
    {
      $set: {
        Status: "Matched",
        scientistId: scientist._id,
        scientistSnapshot: {
          displayName: scientist.displayName,
          email: scientist.email,
          latitude: scientist.latitude,
          longitude: scientist.longitude,
        },
        acceptedAt: new Date(),
      },
    },
    { new: true }
  );

  // Lost the race / expired / not notified -> give the scientist back
  if (!job) {
    await releaseScientist(scientist._id, testRequestId);
    return {
      ok: false,
      status: 409,
      message: "Already taken, expired, or you were not notified",
    };
  }

  clearTimer(testRequestId); // stop stage timers + the 48s expiry

  // Distances for the snapshot (Google, Haversine fallback). Not decision-critical.
  if (job.location?.lat != null && job.hubSnapshot) {
    const mode = normalizeTravelMode(scientist.travelMode); // their ETA, in their mode
    const sPoint = { lat: scientist.latitude, lng: scientist.longitude };
    const patientPoint = { lat: job.location.lat, lng: job.location.lng };
    const hubPoint = { lat: job.hubSnapshot.latitude, lng: job.hubSnapshot.longitude };
    const deadlineAt = Date.now() + 3_000;
    const [toPatient, toHub, patientToHub] = await Promise.all([
      routeDistance(sPoint, patientPoint, { deadlineAt, travelMode: mode }),
      routeDistance(sPoint, hubPoint, { deadlineAt, travelMode: mode }),
      routeDistance(patientPoint, hubPoint, { deadlineAt, travelMode: mode }),
    ]);
    const okMin = (d) => (d.source !== "haversine" && Number.isFinite(d.minutes) ? d.minutes : null);
    job.scientistSnapshot.distanceToPatientKm = toPatient.km;
    job.scientistSnapshot.distanceToHubKm = toHub.km;
    job.scientistSnapshot.travelMode = mode;
    job.scientistSnapshot.etaToPatientMin = okMin(toPatient);
    if (patientToHub.source !== "haversine") {
      job.scientistSnapshot.combinedJourneyKm = toPatient.km + patientToHub.km;
      const pm = okMin(patientToHub);
      const tm = okMin(toPatient);
      job.scientistSnapshot.combinedJourneyMin = pm != null && tm != null ? tm + pm : null;
    }
    await job.save();

    // COMPARISON LISTENER: both providers on the scientist who accepted.
    runComparison({
      jobId: job._id,
      trigger: "accepted",
      primary: PRIMARY_PROVIDER,
      patient: patientPoint,
      hub: { name: job.hubSnapshot.name, lat: hubPoint.lat, lng: hubPoint.lng },
      scientists: [
        {
          id: scientist._id,
          name: scientist.displayName,
          lat: scientist.latitude,
          lng: scientist.longitude,
          travelMode: mode,
          used: {
            toPatient: { source: toPatient.source, sku: toPatient.sku, traffic: toPatient.traffic, meters: toPatient.meters, minutes: toPatient.minutes },
            toHub: { source: toHub.source, sku: toHub.sku, traffic: toHub.traffic, meters: toHub.meters, minutes: toHub.minutes },
          },
        },
      ],
    });
  }

  emitJobUpdate(job.toObject());
  withdrawOffers(job, "Matched", scientist._id); // everyone else loses the offer

  // TODO later: email the scientist that the booking is locked
  return { ok: true, job };
}

// ---------------------------------------------------------------
// CANCEL
// ---------------------------------------------------------------
/** Cancel (conditional), stop timers, withdraw live offers. Returns the job or null. */
export async function cancelMatching(testRequestId) {
  clearTimer(testRequestId);

  const job = await TestRequest.findOneAndUpdate(
    {
      _id: testRequestId,
      Status: { $in: ["Pending", "Searching", "NoCoverage", "Matched"] },
    },
    { $set: { Status: "Canceled" } },
    { new: true }
  );
  if (!job) return null;
  emitJobUpdate(job.toObject());
  withdrawOffers(job, "Canceled");
  // A matched scientist is released and told the job is gone.
  if (job.scientistId) {
    await releaseScientist(job.scientistId, job._id).catch((e) =>
      console.warn("releaseScientist failed:", e.message)
    );
    emitBookingOffer(job.scientistId, {
      testRequestId: job._id,
      status: "Canceled",
      withdrawn: true,
    });
  }
  return job;
}

/** Kept for compatibility: just stops timers. Prefer cancelMatching(). */
export function stopMatching(testRequestId) {
  clearTimer(testRequestId);
}

// ---------------------------------------------------------------
// RECOVERY (run at startup)
// ---------------------------------------------------------------

/**
 * Jobs left in "Searching" by a restart are either expired -> NoCoverage,
 * or resumed at the stage they should be in right now.
 * (Single server instance only. Several instances would need a job queue.)
 */
export async function resumeSearchingJobs() {
  const jobs = await TestRequest.find({ Status: "Searching" });
  for (const job of jobs) {
    const startedMs = new Date(job.matchingState?.startedAt || 0).getTime();
    const expiresMs = new Date(
      job.matchingState?.graceEndsAt || job.matchingState?.expiresAt || 0
    ).getTime();

    if (!startedMs || !expiresMs || Date.now() >= expiresMs) {
      await endNoCoverage(job._id);
      continue;
    }

    const stage = Math.min(
      Math.floor((Date.now() - startedMs) / STAGE_DURATION_MS),
      matchRules().stagesMin.length - 1
    );
    scheduleExpiry(job._id, expiresMs);
    scheduleStage(job._id, stage, startedMs); // runAt is in the past -> runs now
  }
  if (jobs.length) console.log(`LABLY resumed ${jobs.length} searching job(s)`);
}

/**
 * STUCK-SCIENTIST REPAIR.
 * Problem: acceptBooking claims the scientist FIRST, then the job. If the
 * server crashes in between, the scientist stays isAvailable:false forever
 * with no job.
 *
 * Fix: a scientist is "stuck" when
 *   - isAvailable is false, AND
 *   - currentJobId is set, AND
 *   - claimedAt is older than STUCK_GRACE_MS (so we never free someone who is
 *     mid-accept right now), AND
 *   - that job is NOT Matched/Approved with THIS scientist on it.
 * Stuck scientists are released (idle again, markers cleared).
 *
 * Scientists you set busy by hand (no currentJobId) are never touched.
 * Returns how many were released.
 */
export async function repairStuckScientists(graceMs = STUCK_GRACE_MS) {
  const cutoff = new Date(Date.now() - graceMs);
  const candidates = await ScientistOps.find({
    isAvailable: false,
    currentJobId: { $ne: null },
    claimedAt: { $lt: cutoff },
  });

  let released = 0;
  for (const s of candidates) {
    const job = await TestRequest.findById(s.currentJobId).select("Status scientistId");
    const holdsJob =
      job &&
      String(job.scientistId) === String(s._id) &&
      ["Matched", "Approved"].includes(job.Status);
    if (holdsJob) continue; // legitimately busy

    // Conditional update: only if the claim is unchanged since we read it
    const r = await ScientistOps.updateOne(
      { _id: s._id, currentJobId: s.currentJobId, isAvailable: false },
      { $set: { isAvailable: true, currentJobId: null, claimedAt: null } }
    );
    if (r.modifiedCount) {
      released += 1;
      console.warn(`LABLY released stuck scientist ${s.displayName} (${s._id})`);
    }
  }
  return released;
}
