import express from "express";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import {
  newRequestMiddleware,
  listMyRequests,
  getRequestById,
    getNearbyScientists,
  
  updateRequestDetails,
  cancelRequest,
  previewResolve,
} from "../middlewares/Testrequest.js";
import { acceptBooking } from "../services/matchingCascade.js";

/**
 * routes/Testrequest.js  (REPLACES your current file)
 *
 * What changed: + GET /:id  and  + POST /:id/accept.
 * ORDER MATTERS: "/mine" must stay ABOVE "/:id", otherwise "mine" is read as an id.
 */
const router = express.Router();

router.use(verifySupabaseAuth);

// Preview resolved tests (no save)
router.post("/preview", previewResolve, (req, res) => {
  return res.status(200).json({ message: "Resolved tests", data: req.preview });
});

// Create booking (also assigns hub + starts the 48s search)
router.post("/", newRequestMiddleware, (req, res) => {
  return res.status(201).json({
    message: "Test request created",
    data: req.testRequest,
  });
});

// List my bookings
router.get("/mine", listMyRequests, (req, res) => {
  return res.status(200).json({
    message: "Your test requests",
    data: req.testRequests,
  });
});

// NEW: one booking (owner only). Poll this for notifiedCount / Status.
router.get("/:id", getRequestById, (req, res) => {
  return res.status(200).json({ message: "Test request", data: req.testRequest });
});

// NEW: live scientist positions for the map (owner only). Poll every few seconds.
router.get("/:id/scientists", getNearbyScientists);



// NEW: save notes / change tests of an open request.
router.patch("/:id/details", updateRequestDetails);

// NEW: first Accept wins.  body: { scientistId }
// TODO (hardening): take the scientist from the login token instead of the body.
// For now the body is trusted so Phase-1 seeds can be tested from Postman.
router.post("/:id/accept", async (req, res) => {
  try {
    const { scientistId } = req.body;
    if (!scientistId) {
      return res.status(400).json({ message: "scientistId required" });
    }
    const result = await acceptBooking(req.params.id, scientistId);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.status(200).json({ message: "Booking locked", data: result.job });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Cancel
router.patch("/:id/cancel", cancelRequest, (req, res) => {
  return res.status(200).json({
    message: "Test request canceled.",
    data: req.testRequest,
  });
});

export default router;
