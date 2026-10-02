import mongoose from "mongoose";

const TestRequestSchema = new mongoose.Schema(
  {
    // Account that placed the order
    supabaseUserId: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

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
    selectedTests: {
      type: [String],
      default: [],
    },
    symptoms: {
      type: [String],
      default: [],
    },
    packageId: {
      type: String,
      enum: ["silver", "gold", "platinum", null],
      default: null,
    },

    // Final lab tests to run (after mapping + gender)
    resolvedTests: {
      type: [String],
      required: true,
    },

    resolveReasons: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    patientSnapshot: {
      fullname: String,
      gender: String,
      dateofbirth: Date,
    },

    location: {
      lat: Number,
      lng: Number,
      address: String,
    },

    Status: {
      type: String,
      enum: ["Approved", "Pending", "Canceled"],
      default: "Pending",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TestRequest", TestRequestSchema);