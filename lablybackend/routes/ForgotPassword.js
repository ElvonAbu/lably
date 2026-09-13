import dotenv from "dotenv";
import express from "express";
import { Resend } from "resend";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { createClient } from "@supabase/supabase-js";

import Forgotpassword from "../models/forgotpassword.js";
import Users from "../models/signup.js";

dotenv.config();

const router = express.Router();

const resend = new Resend(process.env.resendkey);

/*
|--------------------------------------------------------------------------
| SUPABASE ADMIN CLIENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This uses the SECRET key.
|
| NEVER put this key in React/Vite/frontend code.
|
*/

const supabase = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey
);


/*
|--------------------------------------------------------------------------
| GENERATE OTP
|--------------------------------------------------------------------------
*/

export function generateotp() {
  return crypto.randomInt(100000, 1000000);
}


/*
|--------------------------------------------------------------------------
| NORMALIZE EMAIL
|--------------------------------------------------------------------------
*/

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}


/*
|--------------------------------------------------------------------------
| FIND SUPABASE USER BY EMAIL
|--------------------------------------------------------------------------
|
| Supabase admin.listUsers() is used because we need the user's
| Supabase auth ID.
|
*/

async function findSupabaseUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];

    const user = users.find(
      (item) =>
        item.email?.trim().toLowerCase() === normalizedEmail
    );

    if (user) {
      return user;
    }

    if (users.length < perPage) {
      return null;
    }

    page++;
  }
}


/*
|--------------------------------------------------------------------------
| SEND PASSWORD RESET OTP
|--------------------------------------------------------------------------
*/

async function sendResetOtp(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    /*
    |--------------------------------------------------------------------------
    | CHECK BOTH DATABASES
    |--------------------------------------------------------------------------
    */

    const mongoUser = await Users.findOne({
      email: normalizedEmail,
    });

    const supabaseUser = await findSupabaseUserByEmail(
      normalizedEmail
    );

    /*
    |--------------------------------------------------------------------------
    | USER DOES NOT EXIST ANYWHERE
    |--------------------------------------------------------------------------
    |
    | We deliberately return a generic response instead of telling
    | someone whether an email belongs to a LABLY account.
    |
    */

    if (!mongoUser && !supabaseUser) {
      return res.status(200).json({
        message:
          "If an account exists with this email, a reset OTP has been sent.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | DELETE OLD RESET OTP
    |--------------------------------------------------------------------------
    */

    await Forgotpassword.deleteMany({
      email: normalizedEmail,
    });


    /*
    |--------------------------------------------------------------------------
    | GENERATE NEW OTP
    |--------------------------------------------------------------------------
    */

    const otp = String(generateotp());

    const otpHash = await bcrypt.hash(
      otp,
      10
    );


    /*
    |--------------------------------------------------------------------------
    | SAVE OTP
    |--------------------------------------------------------------------------
    */

    await Forgotpassword.create({
      email: normalizedEmail,

      otpHash,

      expiresAt: new Date(
        Date.now() + 10 * 60 * 1000
      ),
    });


    /*
    |--------------------------------------------------------------------------
    | SEND EMAIL
    |--------------------------------------------------------------------------
    */

    const { error } = await resend.emails.send({
      from: "Lably <security@mylably.com>",

      to: [normalizedEmail],

      subject: "Your LABLY Password Reset OTP",

      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">

          <h2>LABLY Password Reset</h2>

          <p>
            You requested to reset your LABLY account password.
          </p>

          <p>
            Your password reset OTP is:
          </p>

          <h1 style="
            letter-spacing:8px;
            font-size:32px;
          ">
            ${otp}
          </h1>

          <p>
            This OTP expires in 10 minutes.
          </p>

          <p>
            Use this code only on the LABLY password reset page.
          </p>

          <p>
            If you did not request a password reset,
            you can safely ignore this email.
          </p>

        </div>
      `,
    });


    if (error) {
      console.error(
        "RESEND PASSWORD OTP ERROR:",
        error
      );

      await Forgotpassword.deleteMany({
        email: normalizedEmail,
      });

      return res.status(500).json({
        message: "Unable to send password reset OTP.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      message:
        "If an account exists with this email, a reset OTP has been sent.",
    });

  } catch (error) {

    console.error(
      "SEND RESET OTP ERROR:",
      error
    );

    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}


/*
|--------------------------------------------------------------------------
| VERIFY PASSWORD RESET OTP
|--------------------------------------------------------------------------
*/

async function verifyResetOtp(req, res) {
  try {

    const {
      email,
      otp,
    } = req.body;


    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required.",
      });
    }


    const normalizedEmail =
      normalizeEmail(email);


    /*
    |--------------------------------------------------------------------------
    | FIND VALID OTP
    |--------------------------------------------------------------------------
    */

    const record =
      await Forgotpassword.findOne({
        email: normalizedEmail,

        expiresAt: {
          $gt: new Date(),
        },
      });


    if (!record) {
      return res.status(400).json({
        message:
          "Invalid or expired OTP.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | COMPARE OTP
    |--------------------------------------------------------------------------
    */

    const validOtp =
      await bcrypt.compare(
        String(otp),
        record.otpHash
      );


    if (!validOtp) {
      return res.status(400).json({
        message:
          "Invalid or expired OTP.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | GENERATE TEMPORARY RESET TOKEN
    |--------------------------------------------------------------------------
    |
    | The OTP itself is NOT used to change the password.
    |
    | After successful OTP verification we create a separate
    | short-lived reset token.
    |
    */

    const resetToken =
      crypto.randomBytes(32).toString("hex");


    const resetTokenHash =
      crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");


    /*
    |--------------------------------------------------------------------------
    | SAVE RESET TOKEN
    |--------------------------------------------------------------------------
    */

    record.resetTokenHash =
      resetTokenHash;

    record.resetTokenExpiresAt =
      new Date(
        Date.now() + 10 * 60 * 1000
      );

    record.verifiedAt =
      new Date();

    await record.save();


    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      message:
        "OTP verified successfully.",

      resetToken,
    });

  } catch (error) {

    console.error(
      "VERIFY RESET OTP ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Internal server error.",
    });
  }
}


/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

async function resetPassword(req, res) {
  try {

    const {
      email,
      resetToken,
      password,
      confirmPassword,
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | BASIC VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
      !email ||
      !resetToken ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({
        message:
          "Email, reset token and passwords are required.",
      });
    }


    if (password !== confirmPassword) {
      return res.status(400).json({
        message:
          "Passwords do not match.",
      });
    }


    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters.",
      });
    }


    const normalizedEmail =
      normalizeEmail(email);


    /*
    |--------------------------------------------------------------------------
    | HASH RESET TOKEN
    |--------------------------------------------------------------------------
    */

    const resetTokenHash =
      crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");


    /*
    |--------------------------------------------------------------------------
    | FIND VERIFIED RESET RECORD
    |--------------------------------------------------------------------------
    */

    const resetRecord =
      await Forgotpassword.findOne({
        email: normalizedEmail,

        resetTokenHash,

        resetTokenExpiresAt: {
          $gt: new Date(),
        },

        verifiedAt: {
          $ne: null,
        },
      });


    if (!resetRecord) {
      return res.status(400).json({
        message:
          "Password reset session is invalid or expired.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | FIND USER IN MONGODB
    |--------------------------------------------------------------------------
    */

    let mongoUser =
      await Users.findOne({
        email: normalizedEmail,
      });


    /*
    |--------------------------------------------------------------------------
    | FIND USER IN SUPABASE
    |--------------------------------------------------------------------------
    */

    let supabaseUser =
      await findSupabaseUserByEmail(
        normalizedEmail
      );


    /*
    |--------------------------------------------------------------------------
    | IF SUPABASE DOES NOT HAVE USER
    |--------------------------------------------------------------------------
    |
    | Create the authentication account so both systems can be
    | synchronized.
    |
    */

    if (!supabaseUser) {

      const {
        data,
        error,
      } =
        await supabase.auth.admin.createUser({
          email: normalizedEmail,

          password,

          email_confirm: true,
        });


      if (error) {
        console.error(
          "SUPABASE CREATE USER ERROR:",
          error
        );

        return res.status(500).json({
          message:
            "Unable to repair authentication account.",
        });
      }


      supabaseUser =
        data.user;
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE SUPABASE PASSWORD
    |--------------------------------------------------------------------------
    */

    const {
      error: updateSupabaseError,
    } =
      await supabase.auth.admin.updateUserById(
        supabaseUser.id,
        {
          password,
        }
      );


    if (updateSupabaseError) {

      console.error(
        "SUPABASE PASSWORD UPDATE ERROR:",
        updateSupabaseError
      );

      return res.status(500).json({
        message:
          "Unable to update authentication password.",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE / REPAIR MONGODB
    |--------------------------------------------------------------------------
    */

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );


    if (mongoUser) {

      mongoUser.supabaseUserId =
        supabaseUser.id;

      mongoUser.passwordHash =
        passwordHash;

      await mongoUser.save();

    } else {

      mongoUser =
        new Users({
          email:
            normalizedEmail,

          supabaseUserId:
            supabaseUser.id,

          passwordHash,

          emailVerified:
            true,
        });

      await mongoUser.save();
    }


    /*
    |--------------------------------------------------------------------------
    | DELETE RESET RECORD
    |--------------------------------------------------------------------------
    |
    | This makes the reset token one-time use.
    |
    */

    await Forgotpassword.deleteOne({
      _id: resetRecord._id,
    });


    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      message:
        "Password updated successfully.",
    });

  } catch (error) {

    console.error(
      "RESET PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      message:
        "Internal server error.",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  sendResetOtp
);


router.post(
  "/verify",
  verifyResetOtp
);


router.post(
  "/reset",
  resetPassword
);


export default router;