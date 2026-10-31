import TestRequest from "../models/TestRequest.js";
import patientdetails from "../models/patientdetails.js";
import ScientistOps from "../models/ScientistOps.js";

import { distanceM } from "../utils/geo.js";
import { resolveTests } from "../utils/resolveTests.js";
import {
  assignNearestHub,
  startMatchingCascade,
  cancelMatching,
  matchRules,
} from "../services/matchingCascade.js";

/**
 * middlewares/Testrequest.js  (REPLACES your current file)
 *
 * What changed vs the old file:
 *   - newRequestMiddleware : assigns nearest hub, then starts the 48s search
 *   - cancelRequest        : goes through cancelMatching (stops timers,
 *                            withdraws live offers, conditional update)
 *   - getRequestById       : NEW, so the patient UI can poll one job
 *   - listMyRequests / previewResolve : unchanged
 */

export async function newRequestMiddleware(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    const email = req.email;

    if (!supabaseUserId || !email) {
      return res.status(401).json({ message: "Auth required." });
    }

    const {
      patientid,
      proceedMode,
      selectedTests = [],
      symptoms = [],
      packageId = null,
      location = null,
      notes = "",
    } = req.body;

    if (!patientid) {
      return res.status(400).json({ message: "patientid is required." });
    }
    if (!proceedMode) {
      return res.status(400).json({ message: "proceedMode is required." });
    }

    // Patient must belong to this user. The nearest hub only needs the pin, so
    // both lookups run at the same time (speed).
    const hasPin = location?.lat != null && location?.lng != null;
    const [patient, hubPick] = await Promise.all([
      patientdetails.findOne({ _id: patientid, supabaseUserId }),
      hasPin
        ? assignNearestHub({
            lat: Number(location.lat),
            lng: Number(location.lng),
          }).catch((err) => {
            console.error("assignNearestHub", err);
            return null;
          })
        : null,
    ]);

    if (!patient) {
      return res.status(404).json({
        message: "Patient not found for this account.",
      });
    }

    const gender = patient.gender;

    let resolved;
    try {
      resolved = resolveTests({
        proceedMode,
        selectedTests,
        symptoms,
        packageId,
        gender,
      });
    } catch (e) {
      return res.status(e.status || 400).json({
        message: e.message,
      });
    }

    const doc = new TestRequest({
      supabaseUserId,
      email,
      patientid: patient._id,
      proceedMode,
      selectedTests: proceedMode === "test" ? selectedTests : [],
      symptoms: proceedMode === "symptoms" ? symptoms : [],
      packageId: proceedMode === "checkup" ? packageId : null,
      resolvedTests: resolved.resolvedTests,
      resolveReasons: resolved.reasons,
      patientSnapshot: {
        fullname: patient.fullname,
        gender: patient.gender,
        dateofbirth: patient.dateofbirth,
      },
      location: location
        ? {
            lat: location.lat,
            lng: location.lng,
            address: location.address,
          }
        : undefined,
      notes: String(notes || "").slice(0, 500),
      Status: "Pending",
    });

    // --- NEW: nearest hub BEFORE the scientist search (patient <= 2.25 km) ---
    if (hubPick) {
      doc.hubId = hubPick.hub._id;
      doc.hubSnapshot = {
        name: hubPick.hub.name,
        latitude: hubPick.hub.latitude,
        longitude: hubPick.hub.longitude,
        distanceKm: hubPick.distanceKm,
        distanceSource: hubPick.distanceSource, // "google" | "haversine"
      };
    }

    await doc.save();

    // --- NEW: start the 48s notify cascade (no payment gate in Phase 1) ---
    // startMatchingCascade is fast (one DB update + timers), so we await it
    // and the response already shows Status "Searching".
    // The cascade also handles "no hub / no pin / nobody in range": it ends the
    // request as NoCoverage right away, stores WHY, and adds the patient to the
    // waitlist, before the patient ever taps "Join the waitlist".
    try {
      await startMatchingCascade(doc._id);
    } catch (err) {
      console.error("startMatchingCascade", err);
    }

    req.testRequest = (await TestRequest.findById(doc._id)) || doc;
    return next();
  } catch (e) {
    return res.status(500).json({
      message: "Error creating test request",
      error: e.message,
    });
  }
}

export async function listMyRequests(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    if (!supabaseUserId) {
      return res.status(401).json({ message: "Auth required." });
    }

    const list = await TestRequest.find({ supabaseUserId }).sort({
      createdAt: -1,
    });
    req.testRequests = list;
    return next();
  } catch (e) {
    return res.status(500).json({
      message: "Error listing test requests",
      error: e.message,
    });
  }
}

/** NEW: one request, owner only. Patient UI polls this (and listens on the socket). */
export async function getRequestById(req, res, next) {
  try {
    const request = await TestRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Test request not found." });
    }
    if (request.supabaseUserId !== req.user?.id) {
      return res.status(403).json({ message: "Not allowed." });
    }
    req.testRequest = request;
    return next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

export async function cancelRequest(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    const { id } = req.params;

    const request = await TestRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Test request not found." });
    }

    if (request.supabaseUserId !== supabaseUserId) {
      return res.status(403).json({
        message: "You are not allowed to cancel this request.",
      });
    }

    if (request.Status === "Canceled") {
      // Already canceled: treat as success so a double tap / retry is harmless.
      req.testRequest = request;
      return next();
    }
    if (request.Status === "Approved") {
      return res.status(409).json({
        message: "Approved requests can't be canceled here. Contact support.",
      });
    }

    // Conditional cancel + stop timers + withdraw live offers
    const updated = await cancelMatching(request._id);
    if (!updated) {
      // Lost a race (e.g. a scientist accepted a split second ago)
      return res.status(409).json({
        message: "Request can't be canceled right now.",
      });
    }

    req.testRequest = updated;
    return next();
  } catch (e) {
    return res.status(500).json({
      message: "Error canceling test request",
      error: e.message,
    });
  }
}

/** Preview recommendations without saving */
export async function previewResolve(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    const {
      patientid,
      proceedMode,
      selectedTests = [],
      symptoms = [],
      packageId = null,
    } = req.body;

    if (!patientid || !proceedMode) {
      return res.status(400).json({
        message: "patientid and proceedMode are required.",
      });
    }

    const patient = await patientdetails.findOne({
      _id: patientid,
      supabaseUserId,
    });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const resolved = resolveTests({
      proceedMode,
      selectedTests,
      symptoms,
      packageId,
      gender: patient.gender,
    });

    req.preview = resolved;
    return next();
  } catch (e) {
    return res.status(e.status || 500).json({
      message: e.message || "Preview failed",
    });
  }
}

/**
 * NEW: live scientist positions for the patient's map (ride-hailing style).
 *
 *   GET /testrequest/:id/scientists
 *
 * Returns EVERY scientist who is online and available within the matching
 * distance cap of the patient's pin (as many as there are - no fixed number),
 * each with a live straight-line distance to the patient. The map zooms out
 * until the farthest of them is in view, then stops.
 *
 * `assigned` is the scientist who accepted this job (they are no longer
 * "available", so they are not in `riders`); it carries their live position so
 * the found screen can keep updating the distance.
 *
 * Owner only. No names / emails are exposed: ids are opaque.
 */
const RIDERS_MAX = 60;

function riderView(s, origin) {
  const here = { lat: s.latitude, lng: s.longitude };
  return {
    id: String(s._id),
    lat: s.latitude,
    lng: s.longitude,
    travelMode: s.travelMode || "driving",
    distanceM: Math.round(distanceM(origin, here)),
    updatedAt: s.lastLocationAt || s.updatedAt || null,
  };
}

export async function getNearbyScientists(req, res) {
  try {
    const request = await TestRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Test request not found." });
    }
    if (request.supabaseUserId !== req.user?.id) {
      return res.status(403).json({ message: "Not allowed." });
    }

    const lat = request.location?.lat;
    const lng = request.location?.lng;
    if (lat == null || lng == null) {
      return res.status(200).json({ message: "Nearby scientists", data: { riders: [], assigned: null, radiusM: matchRules().patientMaxM } });
    }
    const origin = { lat: Number(lat), lng: Number(lng) };

    let riders = [];
    if (request.Status === "Searching" || request.Status === "Pending") {
      const radiusM = matchRules().patientMaxM;
      // bounding box first (uses a cheap query), exact distance second
      const dLat = radiusM / 111320;
      const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((origin.lat * Math.PI) / 180)));
      const candidates = await ScientistOps.find({
        isOnline: true,
        isAvailable: true,
        latitude: { $gte: origin.lat - dLat, $lte: origin.lat + dLat },
        longitude: { $gte: origin.lng - dLng, $lte: origin.lng + dLng },
      })
        .limit(RIDERS_MAX * 2)
        .lean();

      riders = candidates
        .map((s) => riderView(s, origin))
        .filter((r) => r.distanceM <= radiusM)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, RIDERS_MAX);
    }

    let assigned = null;
    if (
      request.scientistId &&
      (request.Status === "Matched" || request.Status === "Approved")
    ) {
      const s = await ScientistOps.findById(request.scientistId).lean();
      if (s) assigned = riderView(s, origin);
    }

    return res.status(200).json({
      message: "Nearby scientists",
      // radiusM = the matching distance cap (MATCH_MAX_PATIENT_M); the map zooms out to fit it
      data: { riders, assigned, radiusM: matchRules().patientMaxM },
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

/**
 * NEW: notes + tests of an open request.
 *   PATCH /testrequest/:id/details   body { notes?, selectedTests? }
 * - notes: saved as typed (max 500 characters)
 * - selectedTests: re-resolved on the server (gender rules etc.); only for
 *   bookings made from the "choose a test" list.
 * Allowed while the request is Pending, Searching or Matched.
 */
export async function updateRequestDetails(req, res) {
  try {
    const request = await TestRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Test request not found." });
    }
    if (request.supabaseUserId !== req.user?.id) {
      return res.status(403).json({ message: "Not allowed." });
    }
    if (!["Pending", "Searching", "Matched"].includes(request.Status)) {
      return res.status(409).json({
        message: "This request can no longer be changed.",
      });
    }

    const set = {};

    if (req.body?.notes !== undefined) {
      set.notes = String(req.body.notes ?? "").slice(0, 500);
    }

    if (req.body?.selectedTests !== undefined) {
      if (request.proceedMode !== "test") {
        return res.status(400).json({
          message: "Tests can only be changed on a request made from the test list.",
        });
      }
      if (!Array.isArray(req.body.selectedTests) || req.body.selectedTests.length === 0) {
        return res.status(400).json({ message: "Select at least one test." });
      }
      const patient = await patientdetails.findOne({
        _id: request.patientid,
        supabaseUserId: request.supabaseUserId,
      });
      let resolved;
      try {
        resolved = resolveTests({
          proceedMode: "test",
          selectedTests: req.body.selectedTests,
          symptoms: [],
          packageId: null,
          gender: patient?.gender,
        });
      } catch (e) {
        return res.status(e.status || 400).json({ message: e.message });
      }
      set.selectedTests = req.body.selectedTests;
      set.resolvedTests = resolved.resolvedTests;
      set.resolveReasons = resolved.reasons;
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const updated = await TestRequest.findOneAndUpdate(
      { _id: request._id, Status: { $in: ["Pending", "Searching", "Matched"] } },
      { $set: set },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({ message: "This request can no longer be changed." });
    }
    return res.status(200).json({ message: "Request updated", data: updated });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}
