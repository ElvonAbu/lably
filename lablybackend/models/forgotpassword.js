import mongoose from "mongoose";

const forgotPasswordSchema =
  new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | HASHED OTP
      |--------------------------------------------------------------------------
      */

      otpHash: {
        type: String,
        required: true,
      },

      /*
      |--------------------------------------------------------------------------
      | OTP EXPIRATION
      |--------------------------------------------------------------------------
      */

      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | RESET TOKEN
      |--------------------------------------------------------------------------
      |
      | Created only after the OTP has been successfully verified.
      |
      */

      resetTokenHash: {
        type: String,
        default: null,
      },

      resetTokenExpiresAt: {
        type: Date,
        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | OTP VERIFIED
      |--------------------------------------------------------------------------
      */

      verifiedAt: {
        type: Date,
        default: null,
      },
    },

    {
      timestamps: true,
    }
  );


export default mongoose.model(
  "Forgotpassword",
  forgotPasswordSchema
);