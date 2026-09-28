import express from "express";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import registerpatient, {
  getallpatient,
  getpatientbyid,
  getMyPatientProfile,
  updateMyPatientProfile,
} from "../middlewares/patientdetails.js";

const router = express.Router();

// All patient routes require a valid Supabase session
router.use(verifySupabaseAuth);

// === NEW: check if signed-in user already has a self profile ===
router.get("/me", getMyPatientProfile, (req, res) => {
  return res.status(200).json({
    message: req.patient ? "Got self profile" : "No self profile yet",
    data: req.patient,
  });
});

// === NEW: update self profile in place ===
router.put("/me", updateMyPatientProfile, (req, res) => {
  return res.status(200).json({
    message: "Self profile updated",
    data: req.patient,
  });
});

// Create: relationship "self" (upsert) or "other" (always new)
router.post("/", registerpatient, (req, res) => {
  return res.status(201).json({
    message: "Patient Details created",
    data: {
      id: req.patientid,
      patient: req.patient,
    },
  });
});

router.get("/", getallpatient, (req, res) => {
  return res.status(200).json({
    message: "Got all patients",
    data: req.patients,
  });
});

// === FIXED: was "patients:id/" (broken path) ===
router.get("/:id", getpatientbyid, (req, res) => {
  return res.status(200).json({
    message: "Got your patient",
    data: req.patient,
  });
});

export default router;