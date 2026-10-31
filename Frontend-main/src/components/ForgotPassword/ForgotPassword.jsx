import AuthLayout from "../AuthLayout/AuthLayout";
import AuthHero from "../AuthHero/AuthHero";
import AuthCard from "../AuthCard/AuthCard";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Icon } from "@iconify/react";

import "./ForgotPassword.css";


const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_apiUrl ||
  "http://localhost:3000";


function ForgotPassword() {

  const navigate =
    useNavigate();


  const [
    email,
    setEmail,
  ] = useState(
    () =>
      sessionStorage.getItem(
        "forgot_draft_email"
      ) || ""
  );


  const [
    error,
    setError,
  ] = useState("");


  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  const isValidEmail =
    (value) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        value
      );


  /*
  |--------------------------------------------------------------------------
  | EMAIL CHANGE
  |--------------------------------------------------------------------------
  */

  const handleEmailChange =
    (e) => {

      const value =
        e.target.value;

      setEmail(value);

      sessionStorage.setItem(
        "forgot_draft_email",
        value
      );

      if (error) {
        setError("");
      }
    };


  /*
  |--------------------------------------------------------------------------
  | EMAIL BLUR
  |--------------------------------------------------------------------------
  */

  const handleEmailBlur =
    () => {

      if (!email.trim()) {
        return;
      }

      if (
        !isValidEmail(
          email.trim()
        )
      ) {
        setError(
          "Please enter a valid email address."
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | SUBMIT
  |--------------------------------------------------------------------------
  */

  const handleSubmit =
    async (e) => {

      e.preventDefault();

      const trimmedEmail =
        email.trim().toLowerCase();


      if (!trimmedEmail) {

        setError(
          "Please enter your email address."
        );

        return;
      }


      if (
        !isValidEmail(
          trimmedEmail
        )
      ) {

        setError(
          "Please enter a valid email address."
        );

        return;
      }


      setError("");
      setIsSubmitting(true);


      try {

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
                  email:
                    trimmedEmail,
                }),
            }
          );


        const contentType =
          response.headers.get(
            "content-type"
          ) || "";


        let data = {};


        if (
          contentType.includes(
            "application/json"
          )
        ) {

          data =
            await response.json();

        }


        if (!response.ok) {

          throw new Error(
            data?.message ||
            "Unable to send password reset OTP."
          );

        }


        /*
        |--------------------------------------------------------------------------
        | SAVE RESET EMAIL
        |--------------------------------------------------------------------------
        */

        sessionStorage.setItem(
          "forgot_email",
          trimmedEmail
        );


        sessionStorage.removeItem(
          "forgot_draft_email"
        );


        /*
        |--------------------------------------------------------------------------
        | GO TO OTP SCREEN
        |--------------------------------------------------------------------------
        */

        navigate(
          "/verify",
          {
            state: {
              email:
                trimmedEmail,

              from:
                "/forgot-password",

              otpPurpose:
                "password-reset",
            },
          }
        );

      } catch (err) {

        console.error(
          "FORGOT PASSWORD ERROR:",
          err
        );

        setError(
          err?.message ||
          "Unable to send password reset OTP."
        );

      } finally {

        setIsSubmitting(false);

      }
    };


  return (

    <div className="forgot-page-wrapper">

      <button
        type="button"
        className="auth-back"
        onClick={() =>
          navigate("/login")
        }
        aria-label="Go back"
      >
        <Icon
          icon="mdi:arrow-left"
          width="22"
        />
      </button>


      <AuthLayout
        illustration={
          <AuthHero />
        }
      >

        <AuthCard
          title="Forgot Password"
          subtitle="Enter your email and we'll send you an OTP to reset your password."
        >

          <form
            className="forgot-form"
            onSubmit={handleSubmit}
            noValidate
          >

            <div className="auth-input-group">

              <label>
                Email Address
              </label>


              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={
                  handleEmailChange
                }
                onBlur={
                  handleEmailBlur
                }
                className={
                  error
                    ? "input-error"
                    : ""
                }
              />


              {error && (
                <span className="field-error">
                  {error}
                </span>
              )}

            </div>


            <button
              className="auth-submit btn-primary"
              type="submit"
              disabled={
                !isValidEmail(
                  email.trim()
                ) ||
                isSubmitting
              }
            >

              {isSubmitting
                ? "Sending..."
                : "Send OTP"}

            </button>

          </form>

        </AuthCard>

      </AuthLayout>

    </div>
  );
}


export default ForgotPassword;