import "./PasswordUpdated.css";

import { useNavigate } from "react-router-dom";

function PasswordUpdated() {
  const navigate = useNavigate();

  return (
    <div className="updated-page">
      

      <div className="updated-content">
        <div className="updated-check-wrapper">
  <svg className="updated-check-svg" viewBox="0 0 100 100">
    <circle
      className="updated-check-circle"
      cx="50"
      cy="50"
      r="45"
      fill="none"
      strokeWidth="6"
    />

    <path
      className="updated-check-mark"
      d="M28 52 L44 68 L74 34"
      fill="none"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength="100"
    />
  </svg>
</div>

        <h1 className="updated-title">Password Updated</h1>

        <p className="updated-subtitle">
          Your password has been successfully updated.
          <br />
          You can now log in with your new password.
        </p>

        <button
          type="button"
          className="updated-btn btn-primary"
          onClick={() => navigate("/login")}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default PasswordUpdated;