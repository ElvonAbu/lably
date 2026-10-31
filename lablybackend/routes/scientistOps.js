import { acceptBooking } from "../services/matchingCascade.js";
import express from "express";
import ScientistOps from "../models/ScientistOps.js";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import { TRAVEL_MODES, isValidTravelMode, normalizeTravelMode } from "../utils/travelMode.js";

/**
 * routes/scientistOps.js        (mounted at /scientist-ops)
 * ============================================================
 * What the SCIENTIST APP calls for the scientist's own operating settings.
 * Same auth as the patient routes (verifySupabaseAuth); the scientist is found by
 * their Supabase user id (ScientistOps.supabaseUserId), falling back to their email.
 *
 *   GET   /scientist-ops/me             -> { travelMode, isOnline, isAvailable, ... }
 *   PATCH /scientist-ops/travel-mode    body { travelMode: "driving" | "walking" }
 *
 * OPERATION MODE: "walking" scientists are matched and notified by WALKING distance and
 * walking time; "driving" scientists by DRIVING distance and driving time. The change
 * applies from the next matching stage: matching reads it from the database each time.
 * (A job a scientist already accepted is never re-measured.)
 * ============================================================
 */
const router = express.Router();

async function findMe(req) {
  const byId = req.user?.id ? await ScientistOps.findOne({ supabaseUserId: req.user.id }) : null;
  return byId || (await ScientistOps.findOne({ email: req.email }));
}

const publicView = (s) => ({
  id: s._id,
  displayName: s.displayName,
  travelMode: normalizeTravelMode(s.travelMode),
  isOnline: s.isOnline,
  isAvailable: s.isAvailable,
});

router.get("/me", verifySupabaseAuth, async (req, res) => {
  try {
    const me = await findMe(req);
    if (!me) return res.status(404).json({ message: "No scientist profile for this account" });
    res.json({ data: publicView(me), travelModes: TRAVEL_MODES });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch("/travel-mode", verifySupabaseAuth, async (req, res) => {
  try {
    const { travelMode } = req.body || {};
    if (!isValidTravelMode(travelMode)) {
      return res.status(400).json({ message: `travelMode must be one of: ${TRAVEL_MODES.join(", ")}` });
    }
    const me = await findMe(req);
    if (!me) return res.status(404).json({ message: "No scientist profile for this account" });

    const updated = await ScientistOps.findByIdAndUpdate(
      me._id,
      { $set: { travelMode: normalizeTravelMode(travelMode) } },
      { new: true }
    );
    res.json({ message: `Travel mode set to ${updated.travelMode}`, data: publicView(updated) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * NEW: the scientist app reports its live position (every few seconds while online).
 *   PATCH /scientist-ops/location   body { latitude, longitude }
 * The patient's map reads these positions (GET /testrequest/:id/scientists).
 */
router.patch("/location", verifySupabaseAuth, async (req, res) => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    ) {
      return res.status(400).json({ message: "latitude and longitude must be valid numbers" });
    }
    const me = await findMe(req);
    if (!me) return res.status(404).json({ message: "No scientist profile for this account" });
    await ScientistOps.findByIdAndUpdate(me._id, {
      $set: { latitude, longitude, lastLocationAt: new Date() },
    });
    res.json({ message: "Location updated" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * NEW: the scientist APP accepts an offer.
 *   POST /scientist-ops/offers/:testRequestId/accept
 * The scientist is taken from the LOGIN TOKEN (not from the body), so nobody can
 * accept on someone else's behalf. Same acceptBooking() as the email link:
 * first accept wins, the 48 s cutoff and "must be online + idle" apply.
 */
router.post("/offers/:id/accept", verifySupabaseAuth, async (req, res) => {
  try {
    const me = await findMe(req);
    if (!me) return res.status(404).json({ message: "No scientist profile for this account" });
    const result = await acceptBooking(req.params.id, me._id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.status(200).json({ message: "Booking locked", data: result.job });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;
