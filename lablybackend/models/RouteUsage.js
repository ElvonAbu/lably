import mongoose from "mongoose";

/**
 * models/RouteUsage.js
 * One document per (month, SKU). Holds how much of that SKU's FREE monthly
 * allowance LABLY has used. Written ONLY by utils/googleUsage.js.
 *
 *   month    "2026-10", in America/Los_Angeles time, because Google resets
 *            free usage on the 1st of each month at midnight Pacific.
 *   sku      "routes_pro" | "routes_essentials" | "routes_legacy"
 *            "matrix_pro" | "matrix_essentials" | "matrix_legacy"
 *   units    BILLING units: requests for Directions/Compute Routes,
 *            ELEMENTS (origins x destinations) for Matrix.
 *   requests HTTP calls made (for Matrix this is NOT the same as units).
 */
const RouteUsageSchema = new mongoose.Schema(
  {
    month: { type: String, required: true },
    sku: { type: String, required: true },
    units: { type: Number, default: 0 },
    requests: { type: Number, default: 0 },
  },
  { timestamps: true }
);

RouteUsageSchema.index({ month: 1, sku: 1 }, { unique: true });

export default mongoose.model("RouteUsage", RouteUsageSchema);
