import "./ResetPassword.css";

import {
  useState,
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


function ResetPassword() {

  const navigate =
    useNavigate();

  const location =
    useLocation();


  /*
  |--------------------------------------------------------------------------
  | RESET EMAIL
  |--------------------------------------------------------------------------
  */

  const email =
    location.state?.email ||
    sessionStorage.getItem(
      "forgot_email"
    ) ||
    "";


  /*
  |--------------------------------------------------------------------------
  | RESET TOKEN
  |--------------------------------------------------------------------------
  */

  const resetToken =
    location.state?.resetToken ||
    sessionStorage.getItem(
      "password_reset_token"
    ) ||
    "";


  /*
  |--------------------------------------------------------------------------
  | PASSWORD STATE
  |--------------------------------------------------------------------------
  */

  const [
    password,
    setPassword,
  ] = useState("");


  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");


  const [
    showPassword,
    setShowPassword,
  ] = useState(false);


  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | ERRORS
  |--------------------------------------------------------------------------
  */

  const [
    passwordError,
    setPasswordError,
  ] = useState("");


  const [
    confirmError,
    setConfirmError,
  ] = useState("");


  const [
    formError,
    setFormError,
  ] = useState("");


  const [
    confirmTouched,
    setConfirmTouched,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | SUBMITTING
  |--------------------------------------------------------------------------
  */

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | VALIDATION
  |--------------------------------------------------------------------------
  */

  const isFormValid =
    password.length >= 6 &&
    confirmPassword.length > 0 &&
    password ===
      confirmPassword;


  /*
  |--------------------------------------------------------------------------
  | PASSWORD CHANGE
  |--------------------------------------------------------------------------
  */

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

      } else {

        setPasswordError("");

      }


      if (confirmTouched) {

        if (
          confirmPassword &&
          value !==
            confirmPassword
        ) {

          setConfirmError(
            "Passwords do not match."
          );

        } else {

          setConfirmError("");

        }
      }
    };


  /*
  |--------------------------------------------------------------------------
  | CONFIRM PASSWORD
  |--------------------------------------------------------------------------
  */

  const handleConfirmChange =
    (e) => {

      const value =
        e.target.value;


      setConfirmPassword(
        value
      );


      if (!confirmTouched) {
        return;
      }


      if (
        value !== password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

      } else {

        setConfirmError("");

      }
    };


  /*
  |--------------------------------------------------------------------------
  | CONFIRM BLUR
  |--------------------------------------------------------------------------
  */

  const handleConfirmBlur =
    () => {

      setConfirmTouched(
        true
      );


      if (
        confirmPassword !==
        password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

      } else {

        setConfirmError("");

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


      let hasError = false;


      if (!password) {

        setPasswordError(
          "Please create a new password."
        );

        hasError = true;

      } else if (
        password.length < 6
      ) {

        setPasswordError(
          "Password must be at least 6 characters."
        );

        hasError = true;

      }


      if (!confirmPassword) {

        setConfirmError(
          "Please confirm your new password."
        );

        hasError = true;

      } else if (
        confirmPassword !==
        password
      ) {

        setConfirmError(
          "Passwords do not match."
        );

        hasError = true;

      }


      setConfirmTouched(true);


      if (hasError) {
        return;
      }


      if (!email || !resetToken) {

        setFormError(
          "Your password reset session has expired. Please request a new OTP."
        );

        return;
      }


      setFormError("");
      setIsSubmitting(true);


      try {

        /*
        |--------------------------------------------------------------------------
        | CALL BACKEND
        |--------------------------------------------------------------------------
        */

        const response =
          await fetch(
            `${API_URL}/forgotpassword/reset`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  email,

                  resetToken,

                  password,

                  confirmPassword,
                }),
            }
          );


        const data =
          await response.json()
            .catch(() => ({}));


        console.log(
          "=========================================="
        );

        console.log(
          "LABLY RESET PASSWORD RESPONSE"
        );

        console.log(
          "STATUS:",
          response.status
        );

        console.log(
          "OK:",
          response.ok
        );

        console.log(
          "DATA:",
          data
        );

        console.log(
          "=========================================="
        );


        if (!response.ok) {

          throw new Error(
            data?.message ||
            "Unable to reset password."
          );

        }


        /*
        |--------------------------------------------------------------------------
        | CLEAN RESET SESSION
        |--------------------------------------------------------------------------
        */

        sessionStorage.removeItem(
          "forgot_email"
        );

        sessionStorage.removeItem(
          "forgot_draft_email"
        );

        sessionStorage.removeItem(
          "password_reset_token"
        );

        sessionStorage.removeItem(
          "otp_purpose"
        );


        /*
        |--------------------------------------------------------------------------
        | SUCCESS
        |--------------------------------------------------------------------------
        */

        navigate(
          "/password-updated"
        );

      } catch (error) {

        console.error(
          "RESET PASSWORD ERROR:",
          error
        );

        setFormError(
          error?.message ||
          "Something went wrong. Please try again."
        );

      } finally {

        setIsSubmitting(
          false
        );

      }
    };


  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (

    <div className="reset-page">

      <button
        type="button"
        className="auth-back"
        onClick={() =>
          navigate(
            "/forgot-password"
          )
        }
        aria-label="Go back"
      >

        <Icon
          icon="mdi:arrow-left"
          width="22"
        />

      </button>


      <div className="reset-content">

        <h1 className="reset-title">
          Reset Password
        </h1>


        <p className="reset-subtitle">
          Create a new password for your account.
        </p>


        <form
          className="reset-form"
          onSubmit={
            handleSubmit
          }
          noValidate
        >

          {/* NEW PASSWORD */}

          <div className="auth-input-group">

            <label>
              New Password
            </label>


            <div className="password-wrapper">

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Create new password"
                value={password}
                onChange={
                  handlePasswordChange
                }
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
                    (prev) =>
                      !prev
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


          {/* CONFIRM PASSWORD */}

          <div className="auth-input-group">

            <label>
              Confirm Password
            </label>


            <div className="password-wrapper">

              <input
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                placeholder="Confirm new password"
                value={
                  confirmPassword
                }
                onChange={
                  handleConfirmChange
                }
                onBlur={
                  handleConfirmBlur
                }
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
                    (prev) =>
                      !prev
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


          {/* FORM ERROR */}

          {formError && (

            <span className="field-error">
              {formError}
            </span>

          )}


          {/* SUBMIT */}

          <button
            type="submit"
            className="reset-submit btn-primary"
            disabled={
              !isFormValid ||
              isSubmitting
            }
          >

            {isSubmitting
              ? "Updating..."
              : "Update Password"}

          </button>

        </form>

      </div>

    </div>
  );
}


export default ResetPassword;