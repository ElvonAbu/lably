import Users from "../models/signup.js";
import dotenv from "dotenv";
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

    email:
      normalizeEmail(email)

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


    if (
      users.length <
      perPage
    ) {

      return null;

    }


    page++;

  }

}


/*
|--------------------------------------------------------------------------
| CREATE SUPABASE USER
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
| NORMAL LOGIN
|--------------------------------------------------------------------------
*/

export async function login(
  req,
  res,
  next
) {

  const {
    email,
    password
  } = req.body;


  if (
    !email ||
    !password
  ) {

    return res.status(400).json({

      message:
        "Email and password required"

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
    | NEITHER DATABASE HAS USER
    |--------------------------------------------------------------------------
    */

    if (
      !mongoUser &&
      !supabaseUser
    ) {

      return res.status(401).json({

        message:
          "Invalid email or password"

      });

    }


    /*
    |--------------------------------------------------------------------------
    | SUPABASE EXISTS
    |--------------------------------------------------------------------------
    |
    | Let Supabase verify the password.
    |
    */

    if (supabaseUser) {

      const {
        data,
        error
      } =
      await supabase.auth.signInWithPassword({

        email:
          normalizedEmail,

        password:
          password

      });


      if (error) {

        return res.status(401).json({

          message:
            "Invalid email or password"

        });

      }


      /*
      |--------------------------------------------------------------------------
      | MONGODB MISSING
      |--------------------------------------------------------------------------
      |
      | Repair MongoDB.
      |
      */

      if (!mongoUser) {

        const newUser =
          new Users({

            email:
              normalizedEmail,

            supabaseUserId:
              supabaseUser.id,

            emailVerified:
              true

          });


        await newUser.save();


        req.userdata = {

          ...data,

          mongoUser:
            newUser

        };

      }

      else {

        /*
        |--------------------------------------------------------------------------
        | BOTH EXIST
        |--------------------------------------------------------------------------
        |
        | Make sure IDs are synchronized.
        |
        */

        if (
          mongoUser.supabaseUserId !==
          supabaseUser.id
        ) {

          mongoUser.supabaseUserId =
            supabaseUser.id;

          await mongoUser.save();

        }


        req.userdata = {

          ...data,

          mongoUser:
            mongoUser

        };

      }


      return next();

    }


    /*
    |--------------------------------------------------------------------------
    | MONGODB EXISTS
    | SUPABASE DOES NOT
    |--------------------------------------------------------------------------
    |
    | Automatically repair Supabase.
    |
    */

    if (
      mongoUser &&
      !supabaseUser
    ) {

      let newSupabaseUser;


      try {

        newSupabaseUser =
          await createSupabaseUser(

            normalizedEmail,

            password

          );

      } catch (createError) {

        console.error(
          "SUPABASE REPAIR ERROR:",
          createError
        );


        /*
        |--------------------------------------------------------------------------
        | Check again in case another request
        | created it simultaneously.
        |--------------------------------------------------------------------------
        */

        newSupabaseUser =
          await findSupabaseUser(
            normalizedEmail
          );


        if (!newSupabaseUser) {

          return res.status(500).json({

            message:
              "Unable to synchronize account with Supabase."

          });

        }

      }


      /*
      |--------------------------------------------------------------------------
      | LINK MONGODB TO SUPABASE
      |--------------------------------------------------------------------------
      */

      mongoUser.supabaseUserId =
        newSupabaseUser.id;


      await mongoUser.save();


      /*
      |--------------------------------------------------------------------------
      | AUTHENTICATE
      |--------------------------------------------------------------------------
      */

      const {
        data,
        error
      } =
      await supabase.auth.signInWithPassword({

        email:
          normalizedEmail,

        password:
          password

      });


      if (error) {

        return res.status(401).json({

          message:
            "Invalid email or password"

        });

      }


      req.userdata = {

        ...data,

        mongoUser:
          mongoUser

      };


      return next();

    }


  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );


    return res.status(500).json({

      message:
        "Server Error",

      error:
        error.message

    });

  }

}


/*
|--------------------------------------------------------------------------
| GET ALL USERS
|--------------------------------------------------------------------------
*/

export async function getallusers(
  req,
  res,
  next
) {

  try {

    const allusers =
      await Users.find();


    req.allusers =
      allusers;


    next();

  }

  catch (e) {

    return res.status(500).json({

      message:
        "Coming from the getallusers middleware",

      error:
        e.message

    });

  }

}


/*
|--------------------------------------------------------------------------
| GOOGLE LOGIN
|--------------------------------------------------------------------------
|
| LEFT AS YOUR EXISTING GOOGLE FLOW.
|--------------------------------------------------------------------------
*/

export async function loginwithgoogle(
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

    return res.status(400).json({

      message:
        `Error coming from googlelogin ${error}`

    });

  }


  return res.status(200).json({

    url:
      data.url

  });

}