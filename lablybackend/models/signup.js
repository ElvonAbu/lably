import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();


/*
|--------------------------------------------------------------------------
| NORMAL USERS
|--------------------------------------------------------------------------
*/

const signupschema =
  new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
      },

      supabaseUserId: {
        type: String,
        required: true,
        unique: true,
      },

      /*
      |--------------------------------------------------------------------------
      | MONGODB PASSWORD HASH
      |--------------------------------------------------------------------------
      |
      | Never store the actual password.
      |
      */

      passwordHash: {
        type: String,
        default: null,
      },

      emailVerified: {
        type: Boolean,
        default: false,
      },
    },

    {
      timestamps: true,
    }
  );


/*
|--------------------------------------------------------------------------
| GOOGLE USERS
|--------------------------------------------------------------------------
*/

const signupwithgoogleschema =
  new mongoose.Schema({
    _id: {
      type: Number,
      required: true,
    },

    firstname: {
      type: String,
      required: true,
    },

    lastname: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },
  });


export const googlesignup =
  mongoose.model(
    "GoogleSignup",
    signupwithgoogleschema
  );


export default mongoose.model(
  "Users",
  signupschema
);