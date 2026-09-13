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
| email_confirm: true
|
| This is VERY important.
|
| Supabase will not put the account into
| "waiting for verification".
|
| LABLY's own OTP remains the verification
| mechanism for your application.
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

      email_confirm: true

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

    return null;
  }

  return data;
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
| SIGN UP
|--------------------------------------------------------------------------
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


  /*
  |--------------------------------------------------------------------------
  | REQUIRED FIELDS
  |--------------------------------------------------------------------------
  */

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


  /*
  |--------------------------------------------------------------------------
  | PASSWORD MATCH
  |--------------------------------------------------------------------------
  */

  if (
    password !== confirmpassword
  ) {

    return res.status(400).json({

      message:
        "Passwords do not match"

    });

  }


  try {

    const normalizedEmail =
      normalizeEmail(email);


    /*
    |--------------------------------------------------------------------------
    | CHECK BOTH DATABASES
    |--------------------------------------------------------------------------
    */

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
    | BOTH ALREADY EXIST
    |--------------------------------------------------------------------------
    */

    if (
      mongoUser &&
      supabaseUser
    ) {

      return res.status(409).json({

        message:
          `User already exists. Try logging in with ${normalizedEmail}.`

      });

    }


    let finalSupabaseUser;


    /*
    |--------------------------------------------------------------------------
    | MONGODB EXISTS
    | SUPABASE DOES NOT
    |--------------------------------------------------------------------------
    |
    | Repair Supabase.
    |
    */

    if (
      mongoUser &&
      !supabaseUser
    ) {

      finalSupabaseUser =
        await createSupabaseUser(
          normalizedEmail,
          password
        );


      mongoUser.supabaseUserId =
        finalSupabaseUser.id;


      mongoUser.email =
        normalizedEmail;


      await mongoUser.save();

    }


    /*
    |--------------------------------------------------------------------------
    | SUPABASE EXISTS
    | MONGODB DOES NOT
    |--------------------------------------------------------------------------
    |
    | Repair MongoDB.
    |
    */

    else if (
      !mongoUser &&
      supabaseUser
    ) {

      finalSupabaseUser =
        supabaseUser;


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

    }


    /*
    |--------------------------------------------------------------------------
    | NEITHER EXISTS
    |--------------------------------------------------------------------------
    |
    | Create Supabase first.
    |
    */

    else if (
      !mongoUser &&
      !supabaseUser
    ) {

      finalSupabaseUser =
        await createSupabaseUser(
          normalizedEmail,
          password
        );


      const newUser =
        new Users({

          email:
            normalizedEmail,

          supabaseUserId:
            finalSupabaseUser.id,

          emailVerified:
            false

        });


      await newUser.save();

    }


    /*
    |--------------------------------------------------------------------------
    | GENERATE LABLY OTP
    |--------------------------------------------------------------------------
    */

    const userotp =
      String(generateotp());


    /*
    |--------------------------------------------------------------------------
    | SEND OTP
    |--------------------------------------------------------------------------
    */

    const sent =
      await sendotp(
        userotp,
        normalizedEmail
      );


    if (!sent) {

      return res.status(500).json({

        message:
          "Failed to send OTP."

      });

    }


    /*
    |--------------------------------------------------------------------------
    | SAVE OTP
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | SUCCESS
    |--------------------------------------------------------------------------
    */

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