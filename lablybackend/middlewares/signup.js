import Users from "../models/signup.js";
import Otpmodel from "../models/otpmodel.js";
import bcrypt from "bcrypt";
import { generateotp } from "./otp.js";
import dotenv from "dotenv";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

/*
|--------------------------------------------------------------------------
| SUPABASE CLIENT
|--------------------------------------------------------------------------
*/

const supabase = createClient(
  process.env.subapaseprojurl,
  process.env.supabasepubkey
);


/*
|--------------------------------------------------------------------------
| SUPABASE ADMIN CLIENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
| supabasekey MUST ONLY exist in the backend .env.
|
*/

const supabaseAdmin = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);


/*
|--------------------------------------------------------------------------
| RESEND
|--------------------------------------------------------------------------
*/

if (!process.env.resendkey) {
  console.error(
    "STARTUP ERROR: resendkey is missing from lablybackend/.env - OTP emails cannot be sent."
  );
}

const resend = new Resend(
  process.env.resendkey
);


/*
|--------------------------------------------------------------------------
| NORMALIZE EMAIL
|--------------------------------------------------------------------------
*/

function normalizeEmail(email) {

  return email
    .trim()
    .toLowerCase();

}


/*
|--------------------------------------------------------------------------
| FIND MONGODB USER
|--------------------------------------------------------------------------
*/

async function findMongoUser(email) {

  return await Users.findOne({
    email: normalizeEmail(email)
  });

}


/*
|--------------------------------------------------------------------------
| FIND SUPABASE USER
|--------------------------------------------------------------------------
*/

async function findSupabaseUser(email) {

  const normalizedEmail =
    normalizeEmail(email);

  let page = 1;

  const perPage = 1000;

  while (true) {

    const {
      data,
      error
    } =
      await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

    if (error) {
      throw error;
    }

    const users =
      data?.users || [];

    const foundUser =
      users.find(
        user =>
          user.email
            ?.trim()
            .toLowerCase() ===
          normalizedEmail
      );

    if (foundUser) {
      return foundUser;
    }

    if (users.length < perPage) {
      return null;
    }

    page++;
  }

}


/*
|--------------------------------------------------------------------------
| CREATE SUPABASE USER
|--------------------------------------------------------------------------
|
| email_confirm: false
|
| The account is created UNCONFIRMED, so Supabase itself refuses to log
| the person in with their password (error "email_not_confirmed") until
| the LABLY OTP is verified. middlewares/otp.js then sets
| email_confirm: true. This also blocks logins done straight from the
| frontend with supabase-js, which never go through the backend /login.
|
|--------------------------------------------------------------------------
*/

async function createSupabaseUser(
  email,
  password
) {

  const {
    data,
    error
  } =
    await supabaseAdmin.auth.admin.createUser({

      email,

      password,

      email_confirm: false

    });

  if (error) {
    throw error;
  }

  return data.user;
}


/*
|--------------------------------------------------------------------------
| SEND OTP
|--------------------------------------------------------------------------
*/

async function sendotp(
  otp,
  useremail
) {

  const {
    data,
    error
  } =
    await resend.emails.send({

      from:
        "Lably <onboarding@mylably.com>",

      to: [useremail],

      subject:
        "OTP Verification",

      html: `

        <h2>Welcome to Lably!</h2>

        <p>Your verification code is:</p>

        <h1 style="letter-spacing:5px">
          ${otp}
        </h1>

        <p>This code expires in 10 minutes.</p>

        <p>If you didn't request this,
        you can ignore this email.</p>

      `

    });

  if (error) {

    console.error(
      "RESEND ERROR:",
      error
    );

    return { error };
  }

  return { data };
}


/*
|--------------------------------------------------------------------------
| CHECK MONGODB USER
|--------------------------------------------------------------------------
*/

export async function user_exist(email) {

  const existingUser =
    await findMongoUser(email);

  return !!existingUser;

}


/*
|--------------------------------------------------------------------------
| GOOGLE SIGNUP
|--------------------------------------------------------------------------
|
| LEFT AS YOUR EXISTING GOOGLE FLOW.
|
|--------------------------------------------------------------------------
*/

export async function signinwithgoogle(
  req,
  res,
  next
) {

  const {
    data,
    error
  } =
    await supabase.auth.signInWithOAuth({

      provider:
        "google",

      options: {
        prompt:
          "consent"
      }

    });

  if (error) {

    return res.status(500).json({

      message:
        "Error from backend"

    });

  }

  return res.status(200).json({

    url:
      data?.url

  });

}


/*
|--------------------------------------------------------------------------
| ROLLBACK
|--------------------------------------------------------------------------
|
| Signup creates records in TWO databases before the OTP email goes out.
| If anything fails after that (OTP email rejected, MongoDB write error,
| ...), undo ONLY what THIS request created, so MongoDB and Supabase never
| end up with a half-registered user that then shows up as "already exists".
|
| Leftovers from an earlier failed attempt are not touched here: they are
| picked up and resumed by the next signup attempt.
|
*/

async function rollbackSignup(created) {

  if (created.mongoUserId) {

    try {

      await Users.deleteOne({
        _id: created.mongoUserId
      });

    } catch (err) {

      console.error(
        "SIGNUP ROLLBACK (MongoDB) FAILED:",
        err
      );

    }

  }

  if (created.relinkedMongoUserId) {

    try {

      await Users.updateOne(
        { _id: created.relinkedMongoUserId },
        { supabaseUserId: created.previousSupabaseUserId }
      );

    } catch (err) {

      console.error(
        "SIGNUP ROLLBACK (relink) FAILED:",
        err
      );

    }

  }

  if (created.supabaseUserId) {

    try {

      const { error } =
        await supabaseAdmin
          .auth
          .admin
          .deleteUser(
            created.supabaseUserId
          );

      if (error) {
        throw error;
      }

    } catch (err) {

      console.error(
        "SIGNUP ROLLBACK (Supabase) FAILED:",
        err
      );

    }

  }

}


/*
|--------------------------------------------------------------------------
| SIGN UP
|--------------------------------------------------------------------------
|
| "User already exists" now means: verified in MongoDB AND present in
| Supabase. A user who was created but never finished the OTP step is an
| UNFINISHED signup, not an existing user: the next attempt resumes it
| (new password, new OTP) instead of answering 409.
|
*/

export async function signup(
  req,
  res,
  next
) {

  const {
    email,
    password,
    confirmpassword
  } = req.body;


  if (
    !email ||
    !password ||
    !confirmpassword
  ) {

    return res.status(400).json({

      message:
        "Some fields are missing"

    });

  }


  if (
    password !== confirmpassword
  ) {

    return res.status(400).json({

      message:
        "Passwords do not match"

    });

  }


  /*
  | Everything THIS request creates or changes, for rollback.
  */

  const created = {
    supabaseUserId: null,
    mongoUserId: null,
    relinkedMongoUserId: null,
    previousSupabaseUserId: null
  };


  try {

    const normalizedEmail =
      normalizeEmail(email);


    const [
      mongoUser,
      supabaseUser
    ] =
      await Promise.all([

        findMongoUser(
          normalizedEmail
        ),

        findSupabaseUser(
          normalizedEmail
        )

      ]);


    /*
    |--------------------------------------------------------------------------
    | ALREADY REGISTERED (verified in MongoDB + present in Supabase)
    |--------------------------------------------------------------------------
    */

    if (
      mongoUser &&
      mongoUser.emailVerified &&
      supabaseUser
    ) {

      /* keep the two ids in sync even when answering 409 */

      if (
        mongoUser.supabaseUserId !==
        supabaseUser.id
      ) {

        mongoUser.supabaseUserId =
          supabaseUser.id;

        await mongoUser.save();

      }

      return res.status(409).json({

        message:
          `User already exists. Try logging in with ${normalizedEmail}.`

      });

    }


    /*
    |--------------------------------------------------------------------------
    | MONGODB EXISTS, SUPABASE DOES NOT  ->  repair Supabase
    |--------------------------------------------------------------------------
    */

    if (
      mongoUser &&
      !supabaseUser
    ) {

      const newSupabaseUser =
        await createSupabaseUser(
          normalizedEmail,
          password
        );

      created.supabaseUserId =
        newSupabaseUser.id;

      created.relinkedMongoUserId =
        mongoUser._id;

      created.previousSupabaseUserId =
        mongoUser.supabaseUserId;

      mongoUser.supabaseUserId =
        newSupabaseUser.id;

      mongoUser.email =
        normalizedEmail;

      await mongoUser.save();

    }


    /*
    |--------------------------------------------------------------------------
    | SUPABASE EXISTS, MONGODB DOES NOT  ->  repair MongoDB
    |--------------------------------------------------------------------------
    */

    else if (
      !mongoUser &&
      supabaseUser
    ) {

      const newUser =
        new Users({

          email:
            normalizedEmail,

          supabaseUserId:
            supabaseUser.id,

          emailVerified:
            false

        });

      await newUser.save();

      created.mongoUserId =
        newUser._id;

    }


    /*
    |--------------------------------------------------------------------------
    | NEITHER EXISTS  ->  create Supabase, then MongoDB
    |--------------------------------------------------------------------------
    */

    else if (
      !mongoUser &&
      !supabaseUser
    ) {

      const newSupabaseUser =
        await createSupabaseUser(
          normalizedEmail,
          password
        );

      created.supabaseUserId =
        newSupabaseUser.id;

      const newUser =
        new Users({

          email:
            normalizedEmail,

          supabaseUserId:
            newSupabaseUser.id,

          emailVerified:
            false

        });

      await newUser.save();

      created.mongoUserId =
        newUser._id;

    }


    /*
    |--------------------------------------------------------------------------
    | BOTH EXIST BUT NEVER VERIFIED  ->  resume the unfinished signup
    |--------------------------------------------------------------------------
    |
    | The earlier attempt created both records and then stopped (for example
    | the OTP email failed). Link the ids and use the password the person
    | just typed. This account was never verified, so nobody legitimately
    | owns it yet.
    |
    */

    else {

      if (
        supabaseUser.email_confirmed_at ||
        supabaseUser.confirmed_at
      ) {

        /*
        | Older leftover: it was confirmed before any OTP, so it could
        | already log in. Replace it with an unconfirmed account (it was
        | never verified, so nothing is lost).
        */

        const { error: delError } =
          await supabaseAdmin
            .auth
            .admin
            .deleteUser(
              supabaseUser.id
            );

        if (delError) {
          throw delError;
        }

        const freshSupabaseUser =
          await createSupabaseUser(
            normalizedEmail,
            password
          );

        created.supabaseUserId =
          freshSupabaseUser.id;

        created.relinkedMongoUserId =
          mongoUser._id;

        created.previousSupabaseUserId =
          mongoUser.supabaseUserId;

        mongoUser.supabaseUserId =
          freshSupabaseUser.id;

        await mongoUser.save();

      } else {

        if (
          mongoUser.supabaseUserId !==
          supabaseUser.id
        ) {

          mongoUser.supabaseUserId =
            supabaseUser.id;

          await mongoUser.save();

        }

        const { error: pwError } =
          await supabaseAdmin
            .auth
            .admin
            .updateUserById(
              supabaseUser.id,
              { password }
            );

        if (pwError) {
          throw pwError;
        }

      }

    }


    /*
    |--------------------------------------------------------------------------
    | GENERATE + SEND LABLY OTP
    |--------------------------------------------------------------------------
    */

    const userotp =
      String(generateotp());

    const sent =
      await sendotp(
        userotp,
        normalizedEmail
      );


    if (
      !sent ||
      sent.error
    ) {

      /* The OTP never went out: leave nothing behind. */

      await rollbackSignup(created);

      return res.status(500).json({

        message:
          "Failed to send OTP.",

        ...(process.env.NODE_ENV !== "production" && {
          reason:
            sent?.error?.message ||
            String(sent?.error || "unknown")
        })

      });

    }


    /*
    |--------------------------------------------------------------------------
    | SAVE OTP (replace any older code for this email)
    |--------------------------------------------------------------------------
    */

    await Otpmodel.deleteMany({
      email:
        normalizedEmail
    });

    const otpDetails =
      new Otpmodel({

        email:
          normalizedEmail,

        otpHash:
          await bcrypt.hash(
            userotp,
            10
          ),

        expiresAt:
          new Date(
            Date.now() +
            10 * 60 * 1000
          )

      });

    await otpDetails.save();


    return res.status(200).json({

      success:
        true,

      message:
        "OTP sent successfully."

    });


  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    await rollbackSignup(created);

    return res.status(500).json({

      success:
        false,

      message:
        "Server Error",

      error:
        error.message

    });

  }

}
