import TestRequest from "../models/TestRequest.js";
import patientdetails from "../models/patientdetails.js";
import { resolveTests } from "../utils/resolveTests.js";

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
    } = req.body;

    if (!patientid) {
      return res.status(400).json({ message: "patientid is required." });
    }
    if (!proceedMode) {
      return res.status(400).json({ message: "proceedMode is required." });
    }

    // Patient must belong to this user
    const patient = await patientdetails.findOne({
      _id: patientid,
      supabaseUserId,
    });

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
      Status: "Pending",
    });

    await doc.save();

    req.testRequest = doc;
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
      return res.status(409).json({ message: "Already canceled." });
    }
    if (request.Status === "Approved") {
      return res.status(409).json({
        message: "Approved requests can't be canceled here. Contact support.",
      });
    }

    request.Status = "Canceled";
    await request.save();
    req.testRequest = request;
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