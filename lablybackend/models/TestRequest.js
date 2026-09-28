import mongoose from "mongoose";

const TestRequestSchema = new mongoose.Schema(
  {
    patientid: {
      type: String,
      required: true
    },

    Testname: {
      type: String,
      required: true,
      ref: "LabTest",
    },

    Testid: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "LabTest",
    },

    Status: {
      type: String,
      enum: ["Approved", "Pending", "Canceled"],
      default: "Pending",
      required: true
    },

    Patient: {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      number: {
        type: String,
        required: true,
        trim: true,
      },
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("TestRequest", TestRequestSchema);