import express from "express";

import VerifyOTP from "../middlewares/otp.js";

const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| VERIFY SIGNUP OTP
|--------------------------------------------------------------------------
|
| POST /verifyemailaddress/
|
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  VerifyOTP
);


export default router;