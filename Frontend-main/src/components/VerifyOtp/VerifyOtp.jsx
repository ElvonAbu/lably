import "./VerifyOtp.css";

import {
  useRef,
  useState,
  useEffect,
} from "react";

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

import { Icon } from "@iconify/react";


const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_apiUrl ||
  "http://localhost:3000";


function maskEmail(email) {

  if (
    !email ||
    !email.includes("@")
  ) {
    return "your email";
  }


  const [
    local,
    domain,
  ] = email.split("@");


  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }


  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}


function VerifyOtp() {

  const navigate =
    useNavigate();

  const location =
    useLocation();


  /*
  |--------------------------------------------------------------------------
  | DETERMINE OTP PURPOSE
  |--------------------------------------------------------------------------
  */

  const otpPurpose =
    location.state?.otpPurpose ||
    sessionStorage.getItem(
      "otp_purpose"
    ) ||
    "signup";


  const isPasswordReset =
    otpPurpose ===
    "password-reset";


  /*
  |--------------------------------------------------------------------------
  | EMAIL
  |--------------------------------------------------------------------------
  */

  const email =
    location.state?.email ||
    (
      isPasswordReset
        ? sessionStorage.getItem(
            "forgot_email"
          )
        : sessionStorage.getItem(
            "signup_email"
          )
    ) ||
    "";


  /*
  |--------------------------------------------------------------------------
  | SAVE PURPOSE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {

    sessionStorage.setItem(
      "otp_purpose",
      otpPurpose
    );

  }, [otpPurpose]);


  const maskedEmail =
    maskEmail(email);


  /*
  |--------------------------------------------------------------------------
  | OTP
  |--------------------------------------------------------------------------
  */

  const OTP_LENGTH = 6;


  const [
    values,
    setValues,
  ] = useState(
    Array(
      OTP_LENGTH
    ).fill("")
  );


  const inputsRef =
    useRef([]);


  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  const [
    otpError,
    setOtpError,
  ] = useState("");


  const [
    isVerifying,
    setIsVerifying,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | RESEND
  |--------------------------------------------------------------------------
  */

  const [
    isResending,
    setIsResending,
  ] = useState(false);


  const [
    countdown,
    setCountdown,
  ] = useState(0);


  /*
  |--------------------------------------------------------------------------
  | COUNTDOWN
  |--------------------------------------------------------------------------
  */

  useEffect(() => {

    if (countdown <= 0) {
      return;
    }


    const timer =
      setInterval(() => {

        setCountdown(
          (previous) =>
            previous > 0
              ? previous - 1
              : 0
        );

      }, 1000);


    return () =>
      clearInterval(timer);

  }, [countdown]);


  /*
  |--------------------------------------------------------------------------
  | INPUT CHANGE
  |--------------------------------------------------------------------------
  */

  const handleChange =
    (
      index,
      event
    ) => {

      const value =
        event.target.value
          .replace(
            /[^0-9]/g,
            ""
          )
          .slice(-1);


      const next =
        [...values];


      next[index] =
        value;


      setValues(next);


      if (otpError) {
        setOtpError("");
      }


      if (
        value &&
        index <
          OTP_LENGTH - 1
      ) {

        inputsRef
          .current[
            index + 1
          ]
          ?.focus();

      }
    };


  /*
  |--------------------------------------------------------------------------
  | KEYBOARD
  |--------------------------------------------------------------------------
  */

  const handleKeyDown =
    (
      index,
      event
    ) => {

      if (
        event.key ===
          "Backspace" &&
        !values[index] &&
        index > 0
      ) {

        inputsRef
          .current[
            index - 1
          ]
          ?.focus();

      }

    };


  /*
  |--------------------------------------------------------------------------
  | VERIFY OTP
  |--------------------------------------------------------------------------
  */

  const handleConfirm =
    async (event) => {

      event.preventDefault();


      if (!email) {

        setOtpError(
          "Your verification session has expired. Please start again."
        );

        return;
      }


      if (
        values.some(
          (value) =>
            value === ""
        )
      ) {

        setOtpError(
          `Please enter all ${OTP_LENGTH} digits of the code.`
        );

        return;
      }


      const otp =
        values.join("");


      setOtpError("");
      setIsVerifying(true);


      try {

        /*
        |--------------------------------------------------------------------------
        | PASSWORD RESET OTP
        |--------------------------------------------------------------------------
        */

        if (isPasswordReset) {

          const response =
            await fetch(
              `${API_URL}/forgotpassword/verify`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    email,
                    otp,
                  }),
              }
            );


          const data =
            await response.json()
              .catch(() => ({}));


          if (!response.ok) {

            throw new Error(
              data?.message ||
              "Invalid or expired OTP."
            );

          }


          /*
          |--------------------------------------------------------------------------
          | SAVE RESET INFORMATION
          |--------------------------------------------------------------------------
          */

          sessionStorage.setItem(
            "forgot_email",
            email
          );


          sessionStorage.setItem(
            "password_reset_token",
            data.resetToken
          );


          /*
          |--------------------------------------------------------------------------
          | REMOVE OLD OTP PURPOSE
          |--------------------------------------------------------------------------
          */

          sessionStorage.removeItem(
            "otp_purpose"
          );


          /*
          |--------------------------------------------------------------------------
          | GO TO NEW PASSWORD
          |--------------------------------------------------------------------------
          */

          navigate(
            "/reset-password",
            {
              state: {
                email,
                resetToken:
                  data.resetToken,
              },
            }
          );


          return;
        }


        /*
        |--------------------------------------------------------------------------
        | SIGNUP OTP
        |--------------------------------------------------------------------------
        */

        const response =
          await fetch(
            `${API_URL}/verifyemailaddress/`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  email,
                  otp,
                }),
            }
          );


        const data =
          await response.json()
            .catch(() => ({}));


        if (!response.ok) {

          throw new Error(
            data?.message ||
            "Incorrect verification code."
          );

        }


        /*
        |--------------------------------------------------------------------------
        | SIGNUP SUCCESS
        |--------------------------------------------------------------------------
        */

        sessionStorage.removeItem(
          "signup_email"
        );

        sessionStorage.removeItem(
          "signup_password"
        );

        sessionStorage.removeItem(
          "signup_draft_email"
        );

        sessionStorage.removeItem(
          "otp_purpose"
        );


        /*
        |--------------------------------------------------------------------------
        | YOUR EXISTING SIGNUP FLOW
        |--------------------------------------------------------------------------
        */

        navigate("/home");

      } catch (error) {

        console.error(
          "LABLY OTP VERIFICATION ERROR:",
          error
        );

        setOtpError(
          error?.message ||
          "Incorrect verification code."
        );

      } finally {

        setIsVerifying(false);

      }
    };


  /*
  |--------------------------------------------------------------------------
  | RESEND RESET OTP
  |--------------------------------------------------------------------------
  */

  const handleResend =
    async () => {

      if (
        countdown > 0 ||
        isResending
      ) {
        return;
      }


      if (!email) {

        setOtpError(
          "Your email could not be found."
        );

        return;
      }


      setOtpError("");
      setIsResending(true);


      try {

        if (isPasswordReset) {

          const response =
            await fetch(
              `${API_URL}/forgotpassword`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    email,
                  }),
              }
            );


          const data =
            await response.json()
              .catch(() => ({}));


          if (!response.ok) {

            throw new Error(
              data?.message ||
              "Unable to resend OTP."
            );

          }


          setCountdown(30);

          setValues(
            Array(
              OTP_LENGTH
            ).fill("")
          );


          inputsRef
            .current[0]
            ?.focus();

          return;
        }


        /*
        |--------------------------------------------------------------------------
        | SIGNUP RESEND
        |--------------------------------------------------------------------------
        |
        | Your existing backend does not currently expose a
        | dedicated signup resend endpoint, so we leave that
        | existing flow untouched.
        |
        */

        throw new Error(
          "Resend is not currently available for signup."
        );

      } catch (error) {

        setOtpError(
          error?.message ||
          "Unable to resend OTP."
        );

      } finally {

        setIsResending(false);

      }
    };


  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (

    <div className="otp-page">

      <button
        type="button"
        className="otp-back"
        onClick={() =>
          navigate(
            isPasswordReset
              ? "/forgot-password"
              : "/signup"
          )
        }
        aria-label="Go back"
      >

        <Icon
          icon="mdi:arrow-left"
          width="22"
        />

      </button>


      <div className="otp-content">

        <h1 className="otp-title">
          Verification Code
        </h1>


        <p className="otp-subtitle">

          We have sent the verification code

          <br />

          to your email{" "}

          {maskedEmail}.

        </p>


        <form
          className="otp-form"
          onSubmit={
            handleConfirm
          }
          noValidate
        >

          <div className="otp-inputs">

            {values.map(
              (
                value,
                index
              ) => (

                <input
                  key={index}
                  ref={(element) => {
                    inputsRef.current[index] =
                      element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={
                    index === 0
                      ? "one-time-code"
                      : "off"
                  }
                  maxLength={1}
                  value={value}
                  onChange={(event) =>
                    handleChange(
                      index,
                      event
                    )
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(
                      index,
                      event
                    )
                  }
                  className={
                    otpError
                      ? "otp-box otp-box-error"
                      : "otp-box"
                  }
                />

              )
            )}

          </div>


          {otpError && (

            <span className="field-error">
              {otpError}
            </span>

          )}


          <button
            type="submit"
            className="otp-submit btn-primary"
            disabled={
              isVerifying
            }
          >

            {isVerifying
              ? "Verifying..."
              : "Confirm"}

          </button>

        </form>


        <p className="otp-resend">

          {countdown > 0 ? (

            <>
              Resend available in{" "}
              {countdown}s
            </>

          ) : (

            <>
              Haven't got the email yet?{" "}

              <button
                type="button"
                className="otp-resend-link"
                onClick={
                  handleResend
                }
                disabled={
                  isResending
                }
              >

                {isResending
                  ? "Sending..."
                  : "Resend email"}

              </button>
            </>

          )}

        </p>

      </div>

    </div>
  );
}


export default VerifyOtp;