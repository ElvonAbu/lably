import { apiClient } from "./apiClient";


// ==================================================
// SIGN UP
// ==================================================

export function signup(
  email,
  password,
  confirmpassword
) {

  return apiClient(
    "/signup",
    {
      method: "POST",

      body: JSON.stringify({

        email,

        password,

        confirmpassword,

      }),

    }
  );

}


// ==================================================
// VERIFY OTP
// ==================================================

export function verifyOtp(
  otp
) {

  return apiClient(
    "/verifyemailaddress/verifyotp",
    {
      method: "POST",

      body: JSON.stringify({

        otp,

      }),

    }
  );

}