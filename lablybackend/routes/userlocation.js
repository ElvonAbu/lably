import express from "express";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import userlocation from "../middlewares/userlocation.js";

const router = express.Router();

router.post(
  "/",
  verifySupabaseAuth,
  userlocation,
  (req, res) => {
    return res.status(201).json({
      message: "Location Saved",
      email: req.email,
    });
  }
);

export default router;