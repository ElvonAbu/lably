import mongoose from "mongoose";

/**
 * models/Waitlist.js
 * Created when a search ends in NoCoverage (nobody accepted in 48s).
 */
const WaitlistSchema = new mongoose.Schema(
  {
    supabaseUserId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    testRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestRequest",
      required: true,
    },
    lat: Number,
    lng: Number,
    address: String,
    // Why there was no coverage (copied from TestRequest.noCoverage)
    reason: { type: String, default: "no_scientist" },
    missing: { type: [String], default: ["scientist"] },
    note: {
      type: String,
      default:
        "No scientists are currently available in your area. We're currently expanding to your area.",
    },
    
  },
  { timestamps: true }
);

export default mongoose.model("Waitlist", WaitlistSchema);
