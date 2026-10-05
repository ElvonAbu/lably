// === FIXED: was missing .js extension ===
import patientdetails from "../models/patientdetails.js";

function normalizeGender(gender) {
  if (!gender) return gender;
  const g = String(gender).trim().toLowerCase();
  if (g === "male" || g === "female") return g;
  return null;
}

/**
 * POST /patientdetails
 * Body: { fullname, dateofbirth, gender, medicalhistory?, relationship? }
 * relationship defaults to "other".
 * "self" upserts the user's one reusable profile.
 * "other" always creates a new one-off record.
 */
export default async function registerpatient(req, res, next) {
  const { fullname, dateofbirth, gender, medicalhistory } = req.body;
  // === NEW ===
  const relationship =
    req.body.relationship === "self" ? "self" : "other";

  try {
    if (!fullname || !dateofbirth || !gender) {
      return res.status(400).json({
        message: "Please input details",
      });
    }

    const normalizedGender = normalizeGender(gender);
    if (!normalizedGender) {
      return res.status(400).json({
        message: "gender must be male or female",
      });
    }

    // === NEW: require auth context from verifySupabaseAuth ===
    const supabaseUserId = req.user?.id;
    const email = req.email;

    if (!supabaseUserId || !email) {
      return res.status(401).json({
        message: "Access denied. Auth required.",
      });
    }

    // === NEW: self → upsert one profile; other → always insert ===
    if (relationship === "self") {
      const saved = await patientdetails.findOneAndUpdate(
        { supabaseUserId, relationship: "self" },
        {
          $set: {
            fullname: String(fullname).trim(),
            dateofbirth: new Date(dateofbirth),
            gender: normalizedGender,
            medicalhistory: medicalhistory ?? "",
            email,
            supabaseUserId,
            relationship: "self",
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      req.patientid = saved._id;
      req.patient = saved;
      return next();
    }

    const save_patient = new patientdetails({
      fullname: String(fullname).trim(),
      dateofbirth: new Date(dateofbirth),
      gender: normalizedGender,
      medicalhistory: medicalhistory ?? "",
      supabaseUserId,
      email,
      relationship: "other",
    });

    await save_patient.save();

    req.patientid = save_patient._id;
    req.patient = save_patient;
    return next();
  } catch (err) {
    // Duplicate self profile race
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Self profile already exists. Use PUT /patientdetails/me to update.",
      });
    }
    return res.status(500).json({
      message: "Error coming from registering patient details",
      error: err.message,
    });
  }
}

/**
 * GET /patientdetails/me
 * Returns the signed-in user's self profile, or null.
 */
// === NEW ===
export async function getMyPatientProfile(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    if (!supabaseUserId) {
      return res.status(401).json({
        message: "Access denied. Auth required.",
      });
    }

    const patient = await patientdetails.findOne({
      supabaseUserId,
      relationship: "self",
    });

    req.patient = patient || null;
    return next();
  } catch (err) {
    return res.status(500).json({
      message: "Error getting own patient profile",
      error: err.message,
    });
  }
}

/**
 * PUT /patientdetails/me
 * Updates the signed-in user's self profile in place.
 */
// === NEW ===
export async function updateMyPatientProfile(req, res, next) {
  const { fullname, dateofbirth, gender, medicalhistory } = req.body;

  try {
    const supabaseUserId = req.user?.id;
    const email = req.email;

    if (!supabaseUserId || !email) {
      return res.status(401).json({
        message: "Access denied. Auth required.",
      });
    }

    if (!fullname || !dateofbirth || !gender) {
      return res.status(400).json({
        message: "Please input details",
      });
    }

    const normalizedGender = normalizeGender(gender);
    if (!normalizedGender) {
      return res.status(400).json({
        message: "gender must be male or female",
      });
    }

    const patient = await patientdetails.findOneAndUpdate(
      { supabaseUserId, relationship: "self" },
      {
        $set: {
          fullname: String(fullname).trim(),
          dateofbirth: new Date(dateofbirth),
          gender: normalizedGender,
          medicalhistory: medicalhistory ?? "",
          email,
        },
      },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({
        message: "No self profile found. Create one with POST relationship: self.",
      });
    }

    req.patient = patient;
    req.patientid = patient._id;
    return next();
  } catch (err) {
    return res.status(500).json({
      message: "Error updating own patient profile",
      error: err.message,
    });
  }
}

export async function getallpatient(req, res, next) {
  try {
    // === CHANGED: only return this user's records ===
    const supabaseUserId = req.user?.id;
    if (!supabaseUserId) {
      return res.status(401).json({
        message: "Access denied. Auth required.",
      });
    }

    const patients = await patientdetails.find({ supabaseUserId });
    req.patients = patients;
    return next();
  } catch (err) {
    return res.status(500).json({
      message: "Error coming from getting all patients",
      error: err.message,
    });
  }
}

export async function getpatientbyid(req, res, next) {
  try {
    const supabaseUserId = req.user?.id;
    if (!supabaseUserId) {
      return res.status(401).json({
        message: "Access denied. Auth required.",
      });
    }

    const patient = await patientdetails.findOne({
      _id: req.params.id,
      supabaseUserId,
    });

    if (!patient) {
      return res.status(404).json({
        message: "Patient not found",
      });
    }

    req.patient = patient;
    return next();
  } catch (err) {
    return res.status(500).json({
      message: "Error getting patient",
      error: err.message,
    });
  }
}