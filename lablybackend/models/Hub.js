import mongoose from "mongoose";

/**
 * models/Hub.js
 * A lab hub = the drop-off point for samples. Assigned to a TestRequest
 * when it is created (nearest active hub within 2.25 km of the patient).
 */
const HubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, default: "" },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    // Patient must be within this of the hub. Matching ALSO caps it at 2.25 km.
    serviceRadiusKm: { type: Number, default: 2.25 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Hub", HubSchema);
