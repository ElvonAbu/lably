import dotenv from "dotenv";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

import Otpmodel from "../models/otpmodel.js";
import Users from "../models/signup.js";

dotenv.config();

const resend = new Resend(
  process.env.resendkey
);

/*
|--------------------------------------------------------------------------
| SUPABASE ADMIN CLIENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
| supabasekey is your secret/service-role key.
| It MUST remain on the backend.
|
|--------------------------------------------------------------------------
*/

const supabaseAdmin = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);


/*
|--------------------------------------------------------------------------
| GENERATE OTP
|--------------------------------------------------------------------------
*/

export function generateotp() {
  return crypto.randomInt(
    100000,
    1000000
  );
}


/*
|--------------------------------------------------------------------------
| VERIFY SIGNUP OTP
|--------------------------------------------------------------------------
|
| POST /verifyemailaddress/
|
|--------------------------------------------------------------------------
*/

export default async function VerifyOTP(
  req,
  res
) {

  try {

    const {
      email,
      otp,
    } = req.body;


    if (!email || !otp) {

      return res.status(400).json({
        message:
          "Email and OTP are required",
      });

    }


    const normalizedEmail =
      email
        .trim()
        .toLowerCase();


    /*
    |--------------------------------------------------------------------------
    | FIND OTP
    |--------------------------------------------------------------------------
    */

    const otpRecord =
      await Otpmodel.findOne({

        email:
          normalizedEmail,

        expiresAt: {
          $gt:
            new Date(),
        },

      });


    if (!otpRecord) {

      return res.status(400).json({
        message:
          "Invalid or expired OTP",
      });

    }


    /*
    |--------------------------------------------------------------------------
    | CHECK OTP
    |--------------------------------------------------------------------------
    */

    const validOtp =
      await bcrypt.compare(
        String(otp),
        otpRecord.otpHash
      );


    if (!validOtp) {

      return res.status(400).json({
        message:
          "Invalid OTP",
      });

    }


    /*
    |--------------------------------------------------------------------------
    | FIND MONGODB USER
    |--------------------------------------------------------------------------
    */

    const user =
      await Users.findOne({

        email:
          normalizedEmail,

      });


    if (!user) {

      return res.status(404).json({
        message:
          "User not found",
      });

    }


    /*
    |--------------------------------------------------------------------------
    | CONFIRM EMAIL IN SUPABASE
    |--------------------------------------------------------------------------
    |
    | This is important.
    |
    | Supabase may currently be waiting for email verification.
    | Our LABLY OTP is the verification mechanism.
    |
    | Therefore, once our OTP is correct, we tell Supabase:
    |
    | "This email has been verified."
    |
    |--------------------------------------------------------------------------
    */

    if (user.supabaseUserId) {

      const {
        data:
          updatedUser,
        error:
          updateError,
      } =
        await supabaseAdmin
          .auth
          .admin
          .updateUserById(
            user.supabaseUserId,
            {
              email_confirm:
                true,
            }
          );


      if (updateError) {

        console.error(
          "SUPABASE EMAIL CONFIRMATION ERROR:",
          updateError
        );


        return res.status(500).json({
          message:
            "OTP verified, but we could not complete your account verification.",
        });

      }

    }


    /*
    |--------------------------------------------------------------------------
    | MARK MONGODB EMAIL AS VERIFIED
    |--------------------------------------------------------------------------
    */

    user.emailVerified =
      true;


    await user.save();


    /*
    |--------------------------------------------------------------------------
    | DELETE USED OTP
    |--------------------------------------------------------------------------
    */

    await Otpmodel.deleteOne({
      _id:
        otpRecord._id,
    });


    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({

      success:
        true,

      message:
        "OTP verified successfully.",

      email:
        normalizedEmail,

    });


  } catch (error) {

    console.error(
      "VERIFY OTP ERROR:",
      error
    );


    return res.status(500).json({

      message:
        "Error coming from VerifyOTP backend",

      error:
        error.message,

    });

  }

}