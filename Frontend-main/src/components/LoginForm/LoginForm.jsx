import "./LoginForm.css";

import { Icon } from "@iconify/react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseurl = import.meta.env.VITE_supabaseurl;
const supabasekey = import.meta.env.VITE_supabasekey;

const supabase = createClient(supabaseurl, supabasekey);

function LoginForm() {

  const navigate = useNavigate();

  const [email, setEmail] = useState(
    () => localStorage.getItem("rememberedEmail") || ""
  );

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false); 

  const isFormValid = email.trim().length > 0 && password.length > 0;

  const handleGoogleSignIn = async () => {
    if (isGoogleSubmitting) return;

    setErrorMessage("");
    setIsGoogleSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/home`,
          queryParams: {
            prompt: "consent",
          },
          skipBrowserRedirect: true, 
        },
      });

      if (error) {
        console.error("Google Sign In error:", error);
        setErrorMessage(error.message || "Unable to sign in with Google.");
        setIsGoogleSubmitting(false);
        return;
      }

      if (!data?.url) {
        setErrorMessage("Something went wrong starting Google sign-in.");
        setIsGoogleSubmitting(false);
        return;
      }

    
      window.location.href = data.url;
    } catch (err) {
      console.error("Unexpected error during Google Sign In:", err);
      setErrorMessage("Unexpected error signing in with Google.");
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isFormValid || isSubmitting) return;

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Unable to sign in. Please try again.");
        return;
      }

      localStorage.setItem("rememberedEmail", email.trim());
      navigate("/home");
    } catch (err) {
      console.error("Unexpected error during login:", err);
      setErrorMessage("Unexpected error signing in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>

      <button
        type="button"
        className="google-button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleSubmitting}
      >
        <Icon icon="logos:google-icon" width="20" />
        {isGoogleSubmitting ? "Connecting..." : "Continue with Google"}
      </button>

      <div className="auth-divider">
        <span>OR</span>
      </div>

      <div className="auth-input-group">
        <label>Email Address</label>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="auth-input-group">
        <label>Password</label>
        <div className="password-wrapper">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            <Icon
              icon={showPassword ? "mdi:eye-off-outline" : "mdi:eye-outline"}
              width="20"
            />
          </button>
        </div>
      </div>

      {errorMessage && <p className="auth-error">{errorMessage}</p>}

      <div className="auth-options">
        <Link to="/forgot-password">Forgot Password?</Link>
      </div>

      <button
        className="auth-submit btn-primary"
        type="submit"
        disabled={!isFormValid || isSubmitting}
      >
        {isSubmitting ? "Signing In..." : "Login"}
      </button>

      <p className="auth-switch">
        Don't have an account?
        <Link to="/signup">Sign Up</Link>
      </p>

    </form>
  );
}

export default LoginForm;