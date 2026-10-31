import "./SignupForm.css";

import { Icon } from "@iconify/react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useState } from "react";

import { createClient } from "@supabase/supabase-js";

import { apiClient } from "../../api/apiClient";


/* ==================================================
   SUPABASE
================================================== */

const supabaseurl =
  import.meta.env.VITE_supabaseurl;

const supabasekey =
  import.meta.env.VITE_supabasekey;

const supabase =
  createClient(
    supabaseurl,
    supabasekey
  );


/* ==================================================
   SIGNUP FORM
================================================== */

function SignupForm() {

  const navigate =
    useNavigate();


  /* ==================================================
     FORM STATE
  ================================================== */

  const [email, setEmail] =
    useState(
      () =>
        sessionStorage.getItem(
          "signup_draft_email"
        ) || ""
    );


  const [password, setPassword] =
    useState("");


  const [confirmPassword, setConfirmPassword] =
    useState("");


  /* ==================================================
     PASSWORD VISIBILITY
  ================================================== */

  const [showPassword, setShowPassword] =
    useState(false);


  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);


  /* ==================================================
     ERROR STATE
  ================================================== */

  const [emailError, setEmailError] =
    useState("");


  const [passwordError, setPasswordError] =
    useState("");


  const [confirmError, setConfirmError] =
    useState("");


  const [errorMessage, setErrorMessage] =
    useState("");


  /* ==================================================
     TOUCH STATE
  ================================================== */

  const [emailTouched, setEmailTouched] =
    useState(false);


  const [confirmTouched, setConfirmTouched] =
    useState(false);


  /* ==================================================
     SUBMITTING STATE
  ================================================== */

  const [isSubmitting, setIsSubmitting] =
    useState(false);


  const [isGoogleSubmitting, setIsGoogleSubmitting] =
    useState(false);


  /* ==================================================
     EMAIL VALIDATION
  ================================================== */

  const isValidEmail =
    (value) => {

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(value);

    };


  /* ==================================================
     FORM VALIDATION
  ================================================== */

  const isFormValid =
    email.trim().length > 0 &&
    isValidEmail(email) &&
    password.length >= 6 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;


  /* ==================================================
     EMAIL CHANGE
  ================================================== */

  const handleEmailChange =
    (e) => {

      const value =
        e.target.value;


      setEmail(value);


      sessionStorage.setItem(
        "signup_draft_email",
        value
      );


      if (!emailTouched) {
        return;
      }


      if (!value.trim()) {

        setEmailError(
          "Email address is required."
        );

      }

      else if (!isValidEmail(value)) {

        setEmailError(
          "Please enter a valid email address, e.g. name@example.com."
        );

      }

      else {

        setEmailError("");

      }

    };


  /* ==================================================
     EMAIL BLUR
  ================================================== */

  const handleEmailBlur =
    () => {

      setEmailTouched(true);


      if (!email.trim()) {

        setEmailError(
          "Email address is required."
        );

      }

      else if (!isValidEmail(email)) {

        setEmailError(
          "Please enter a valid email address, e.g. name@example.com."
        );

      }

      else {

        setEmailError("");

      }

    };


  /* ==================================================
     PASSWORD CHANGE
  ================================================== */

  const handlePasswordChange =
    (e) => {

      const value =
        e.target.value;


      setPassword(value);


      if (
        value.length > 0 &&
        value.length < 6
      ) {

        setPasswordError(
          "Password must be at least 6 characters."
        );

      }

      else {

        setPasswordError("");

      }


      if (confirmTouched) {

        if (
          confirmPassword &&
          value !== confirmPassword
        ) {

          setConfirmError(
            "Passwords do not match."
          );

        }

        else {

          setConfirmError("");

        }

      }

    };


  /* ==================================================
     CONFIRM PASSWORD CHANGE
  ================================================== */

  const handleConfirmChange =
    (e) => {

      const value =
        e.target.value;


      setConfirmPassword(value);


      if (!confirmTouched) {
        return;
      }


      if (!value) {

        setConfirmError(
          "Please confirm your password."
        );

      }

      else if (
        value !== password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

      }

      else {

        setConfirmError("");

      }

    };


  /* ==================================================
     CONFIRM PASSWORD BLUR
  ================================================== */

  const handleConfirmBlur =
    () => {

      setConfirmTouched(true);


      if (!confirmPassword) {

        setConfirmError(
          "Please confirm your password."
        );

      }

      else if (
        confirmPassword !== password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

      }

      else {

        setConfirmError("");

      }

    };


  /* ==================================================
     GOOGLE SIGN IN
  ================================================== */

  const handleGoogleSignIn =
    async () => {

      if (isGoogleSubmitting) {
        return;
      }


      setErrorMessage("");

      setIsGoogleSubmitting(true);


      try {

        const {
          data,
          error,
        } =
          await supabase.auth.signInWithOAuth({

            provider:
              "google",

            options: {

              /*
              ------------------------------------------
              IMPORTANT

              We keep this dynamic.

              localhost:
              http://localhost:5173/home

              iPhone:
              http://172.20.10.5:5173/home
              ------------------------------------------
              */

              redirectTo:
                `${window.location.origin}/home`,

              queryParams: {

                prompt:
                  "consent",

              },

              skipBrowserRedirect:
                true,

            },

          });


        if (error) {

          console.error(
            "Google Sign In error:",
            error
          );


          setErrorMessage(
            error.message ||
            "Unable to sign in with Google."
          );


          setIsGoogleSubmitting(false);

          return;

        }


        if (!data?.url) {

          setErrorMessage(
            "Something went wrong starting Google sign-in."
          );


          setIsGoogleSubmitting(false);

          return;

        }


        window.location.href =
          data.url;

      }

      catch (err) {

        console.error(
          "Unexpected error during Google Sign In:",
          err
        );


        setErrorMessage(
          "Unexpected error signing in with Google."
        );


        setIsGoogleSubmitting(false);

      }

    };


  /* ==================================================
     EMAIL/PASSWORD SIGNUP
  ================================================== */

  const handleSubmit =
    async (e) => {

      e.preventDefault();


      if (isSubmitting) {
        return;
      }


      setEmailError("");


      let hasError =
        false;


      /* ==================================================
         EMAIL VALIDATION
      ================================================== */

      if (!email.trim()) {

        setEmailError(
          "Email address is required."
        );

        hasError = true;

      }

      else if (!isValidEmail(email)) {

        setEmailError(
          "Please enter a valid email address, e.g. name@example.com."
        );

        hasError = true;

      }


      /* ==================================================
         PASSWORD VALIDATION
      ================================================== */

      if (!password) {

        setPasswordError(
          "Please create a password."
        );

        hasError = true;

      }

      else if (password.length < 6) {

        setPasswordError(
          "Password must be at least 6 characters."
        );

        hasError = true;

      }

      else {

        setPasswordError("");

      }


      /* ==================================================
         CONFIRM PASSWORD VALIDATION
      ================================================== */

      if (!confirmPassword) {

        setConfirmError(
          "Please confirm your password."
        );

        hasError = true;

      }

      else if (
        confirmPassword !== password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

        hasError = true;

      }

      else {

        setConfirmError("");

      }


      setEmailTouched(true);

      setConfirmTouched(true);


      if (hasError) {
        return;
      }


      setIsSubmitting(true);


      try {

        /* ==================================================
           BACKEND SIGNUP

           IMPORTANT:

           We no longer use:

           import.meta.env.VITE_apiUrl

           Instead we use the central apiClient.

           Therefore:

           localhost → localhost:3000

           iPhone LAN → Mac LAN IP:3000
        ================================================== */

        const data =
          await apiClient(
            "/signup",
            {

              method:
                "POST",

              body:
                JSON.stringify({

                  email:
                    email.trim(),

                  password:
                    password,

                  confirmpassword:
                    confirmPassword,

                }),

            }
          );


        console.log(
          "=========================================="
        );

        console.log(
          "LABLY SIGNUP RESPONSE"
        );

        console.log(
          "DATA:",
          data
        );

        console.log(
          "=========================================="
        );


        /* ==================================================
           OTP SENT
        ================================================== */

        sessionStorage.setItem(
          "signup_email",
          email.trim()
        );


        sessionStorage.setItem(
          "otp_purpose",
          "signup"
        );


        sessionStorage.removeItem(
          "signup_draft_email"
        );


        /* ==================================================
           GO TO OTP

           Password remains in React Router state.

           It is NOT stored in sessionStorage.
        ================================================== */

        navigate(
          "/verify",
          {

            state: {

              email:
                email.trim(),

              from:
                "/signup",

              purpose:
                "signup",

              password:
                password,

            },

          }
        );

      }

      catch (error) {

        console.error(
          "LABLY SIGNUP ERROR:",
          error
        );


        setEmailError(
          error?.message ||
          "Unable to create your account."
        );

      }

      finally {

        setIsSubmitting(
          false
        );

      }

    };


  /* ==================================================
     RENDER
  ================================================== */

  return (

    <form
      className="auth-form"
      onSubmit={handleSubmit}
      noValidate
    >

      {/* ==================================================
          GOOGLE
      ================================================== */}

      <button
        type="button"
        className="google-button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleSubmitting}
      >

        <Icon
          icon="logos:google-icon"
          width="20"
        />

        {
          isGoogleSubmitting
            ? "Connecting..."
            : "Continue with Google"
        }

      </button>


      {errorMessage && (

        <span className="field-error">

          {errorMessage}

        </span>

      )}


      {/* ==================================================
          DIVIDER
      ================================================== */}

      <div className="auth-divider">

        <span>
          OR
        </span>

      </div>


      {/* ==================================================
          EMAIL
      ================================================== */}

      <div className="auth-input-group">

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
          className={
            emailError
              ? "input-error"
              : ""
          }
        />


        {emailError && (

          <span className="field-error">

            {emailError}

          </span>

        )}

      </div>


      {/* ==================================================
          PASSWORD
      ================================================== */}

      <div className="auth-input-group">

        <div className="password-wrapper">

          <input
            type={
              showPassword
                ? "text"
                : "password"
            }
            placeholder="Create password"
            value={password}
            onChange={handlePasswordChange}
            className={
              passwordError
                ? "input-error"
                : ""
            }
          />


          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowPassword(
                (prev) => !prev
              )
            }
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
            tabIndex={-1}
          >

            <Icon
              icon={
                showPassword
                  ? "mdi:eye-off-outline"
                  : "mdi:eye-outline"
              }
              width="20"
            />

          </button>

        </div>


        {passwordError && (

          <span className="field-error">

            {passwordError}

          </span>

        )}

      </div>


      {/* ==================================================
          CONFIRM PASSWORD
      ================================================== */}

      <div className="auth-input-group">

        <div className="password-wrapper">

          <input
            type={
              showConfirmPassword
                ? "text"
                : "password"
            }
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={handleConfirmChange}
            onBlur={handleConfirmBlur}
            className={
              confirmError
                ? "input-error"
                : ""
            }
          />


          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowConfirmPassword(
                (prev) => !prev
              )
            }
            aria-label={
              showConfirmPassword
                ? "Hide password"
                : "Show password"
            }
            tabIndex={-1}
          >

            <Icon
              icon={
                showConfirmPassword
                  ? "mdi:eye-off-outline"
                  : "mdi:eye-outline"
              }
              width="20"
            />

          </button>

        </div>


        {confirmError && (

          <span className="field-error">

            {confirmError}

          </span>

        )}

      </div>


      {/* ==================================================
          CREATE ACCOUNT
      ================================================== */}

      <button
        className="auth-submit btn-primary"
        type="submit"
        disabled={
          !isFormValid ||
          isSubmitting
        }
      >

        {
          isSubmitting
            ? "Creating Account..."
            : "Create an Account"
        }

      </button>


      {/* ==================================================
          LOGIN
      ================================================== */}

      <p className="auth-switch">

        Have an account?

        <Link to="/login">
          Sign in
        </Link>

      </p>


      {/* ==================================================
          PRIVACY
      ================================================== */}

      <p className="auth-privacy">

        By continuing you acknowledge Our{" "}

        <a href="#">
          Privacy Policy
        </a>.

      </p>

    </form>

  );

}


export default SignupForm;