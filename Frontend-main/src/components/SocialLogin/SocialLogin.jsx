import "./SocialLogin.css";
import { Icon } from "@iconify/react";

function SocialLogin() {
  return (
    <div className="social-login">

      <button
        type="button"
        className="google-button"
        onClick={() => window.location.href = "/login/loginwithgoogle"}
      >
        <Icon
          icon="flat-color-icons:google"
          className="google-icon"
        />

        <span>
          Continue with Google
        </span>

      </button>

      <div className="divider">

        <span className="divider-line"></span>

        <span className="divider-text">
          OR
        </span>

        <span className="divider-line"></span>

      </div>

    </div>
  );
}

export default SocialLogin;