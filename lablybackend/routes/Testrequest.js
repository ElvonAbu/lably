import express from "express";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import {
  newRequestMiddleware,
  listMyRequests,
  cancelRequest,
  previewResolve,
} from "../middlewares/Testrequest.js";

const router = express.Router();

router.use(verifySupabaseAuth);

// Preview resolved tests (no save)
router.post("/preview", previewResolve, (req, res) => {
  return res.status(200).json({
    message: "Resolved tests",
    data: req.preview,
  });
});

// Create booking
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

// Cancel
router.patch("/:id/cancel", cancelRequest, (req, res) => {
  return res.status(200).json({
    message: "Test request canceled.",
    data: req.testRequest,
  });
});

export default router;