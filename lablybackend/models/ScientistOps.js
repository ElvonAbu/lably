import mongoose from "mongoose";

/**
 * models/ScientistOps.js
 * Operational scientist record used ONLY for matching (seeded now, real
 * scientist app / signup later). Separate from the older onboarding model
 * (Scientistinfo.js) and the old location model (Scientistlocation.js).
 *
 * Eligible to be notified when: isOnline === true && isAvailable === true
 */
const ScientistOpsSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    supabaseUserId: { type: String, default: null, index: true },

    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    lastLocationAt: { type: Date, default: Date.now },

    /**
     * OPERATION MODE: how this scientist travels. Decides which ETA they are
     * matched and notified with (walking scientist -> WALKING distance/time,
     * driving scientist -> DRIVING distance/time). The scientist app lets them
     * change it (PATCH /scientist-ops/travel-mode). Older records without the
     * field are treated as "driving".
     */
    travelMode: { type: String, enum: ["driving", "walking"], default: "driving", index: true },

    isOnline: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: true, index: true },

    /**
     * CLAIM MARKERS (used by acceptBooking + the stuck-scientist repair).
     * When a scientist accepts, we flip isAvailable -> false AND record which
     * job they were claimed for and when. If the server crashes between
     * "claim scientist" and "claim job", repairStuckScientists() uses these
     * two fields to find and free them.
     */
    currentJobId: { type: mongoose.Schema.Types.ObjectId, default: null },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("ScientistOps", ScientistOpsSchema);
