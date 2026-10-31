import mongoose from "mongoose";

const patientdetails = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
      trim: true,
    },
    dateofbirth: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
      required: true,
    },
    medicalhistory: {
      type: String,
      default: "",
    },

    // === NEW: ties record to the signed-in Supabase user ===
    supabaseUserId: {
      type: String,
      required: true,
      index: true,
    },
    // === NEW: convenient lookup (same pattern as userlocation email) ===
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // === NEW: "self" = reusable own profile; "other" = one-off booking patient ===
    relationship: {
      type: String,
      enum: ["self", "other"],
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// === NEW: at most one reusable "self" profile per user ===
patientdetails.index(
  { supabaseUserId: 1, relationship: 1 },
  {
    unique: true,
    partialFilterExpression: { relationship: "self" },
  }
);

export default mongoose.model("patientdetails", patientdetails);