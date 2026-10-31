import mongoose from "mongoose";

/**
 * models/TestRequest.js  (REPLACES your current file)
 *
 * What changed vs the old file:
 *   - Status enum: + "Searching", "Matched", "NoCoverage"
 *   - hubId / hubSnapshot        : which hub this booking drops at
 *   - scientistId / snapshot     : who accepted
 *   - matchingState              : live progress of the 48s search
 *   - acceptedAt                 : when someone accepted
 */
const TestRequestSchema = new mongoose.Schema(
  {
    // Account that placed the order
    supabaseUserId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    // Patient this booking is FOR (patientdetails._id)
    patientid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "patientdetails",
      required: true,
      index: true,
    },

    proceedMode: {
      type: String,
      enum: ["test", "symptoms", "checkup"],
      required: true,
    },

    // What the user selected in the UI
    selectedTests: { type: [String], default: [] },
    symptoms: { type: [String], default: [] },
    packageId: {
      type: String,
      enum: ["silver", "gold", "platinum", null],
      default: null,
    },

    // Final lab tests to run (after mapping + gender)
    resolvedTests: { type: [String], required: true },
    resolveReasons: { type: [mongoose.Schema.Types.Mixed], default: [] },

    patientSnapshot: {
      fullname: String,
      gender: String,
      dateofbirth: Date,
    },

    // Patient pin. The search uses THIS location for its whole 48s.
    location: {
      lat: Number,
      lng: Number,
      address: String,
    },

    Status: {
      type: String,
      enum: [
        "Pending", // saved, search not started yet
        "Searching", // 48s cascade running
        "Matched", // a scientist accepted
        "NoCoverage", // nobody accepted in 48s (or no hub / no pin)
        "Approved", // (existing) approved later in the flow
        "Canceled",
      ],
      default: "Pending",
      required: true,
      index: true,
    },

    // Hub chosen at create time
    hubId: { type: mongoose.Schema.Types.ObjectId, ref: "Hub", default: null },
    hubSnapshot: {
      name: String,
      latitude: Number,
      longitude: Number,
      distanceKm: Number,
      distanceSource: String, // "google" | "mapbox" | "haversine"
    },

    // Scientist who accepted
    scientistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScientistOps",
      default: null,
    },
    scientistSnapshot: {
      displayName: String,
      email: String,
      latitude: Number,
      longitude: Number,
      distanceToPatientKm: Number,
      distanceToHubKm: Number,
      travelMode: String, // "driving" | "walking": the mode their ETA was measured in
      etaToPatientMin: Number, // scientist -> patient, in their travel mode
      combinedJourneyKm: Number, // scientist -> patient -> hub, in their travel mode
      combinedJourneyMin: Number,
    },

    /**
     * Live progress of the search.
     * notifiedCount -> patient UI: "N scientists are viewing your request"
     */
    matchingState: {
      stageIndex: { type: Number, default: 0 },
      currentStageMin: { type: Number, default: 2 }, // driving-time band of the current stage
      notifiedScientistIds: {
        type: [mongoose.Schema.Types.ObjectId],
        default: [],
      },
      notifiedCount: { type: Number, default: 0 },
      startedAt: Date,
      expiresAt: Date, // startedAt + 48s: what the PATIENT's countdown shows
      // expiresAt + MATCH_REPLY_WAIT_SECONDS: scientists who were notified can still accept
      // until here (the "Waiting for a reply" window). The patient's timer is unchanged.
      graceEndsAt: Date,
    },

    acceptedAt: Date,

    // Free-text note from the patient (editable while the request is open)
    notes: { type: String, default: "", maxlength: 500 },

    /**
     * Why the search ended in NoCoverage. `missing` lists what is unavailable:
     * "scientist" and/or "hub". Set together with Status "NoCoverage".
     */
    noCoverage: {
      reason: String, // no_scientist | no_hub | no_hub_and_scientist
      missing: { type: [String], default: undefined },
      message: String,
      at: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TestRequest", TestRequestSchema);
