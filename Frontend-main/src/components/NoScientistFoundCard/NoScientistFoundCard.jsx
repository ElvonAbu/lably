import { useState } from "react";
import { useSignOut } from "../../hooks/UseSignOut";
import NoScientistArtwork from "../../assets/svg/NoscientistAvail.svg";
import "./NoScientistFoundCard.css";

function NoScientistFoundCard({ onJoinWaitlist }) {
  const [joined, setJoined] = useState(false);
  const { handleSignOut, isSigningOut, logoutError } = useSignOut();

  const handleJoinWaitlist = () => {
    // TODO(backend): await the real waitlist request here and only show the
    // check mark once it succeeds (show an error message if it fails).
    onJoinWaitlist?.();
    setJoined(true);
  };

  return (
    <section className="no-scientist-page" role="status" aria-live="polite">
      {joined ? (
        <div className="no-scientist-content no-scientist-joined">
          {/* same drawn check mark as the "Password updated" screen */}
          <div className="no-scientist-check-wrapper">
            <svg className="no-scientist-check-svg" viewBox="0 0 100 100">
              <circle
                className="no-scientist-check-circle"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                strokeWidth="6"
                pathLength="100"
              />
              <path
                className="no-scientist-check-mark"
                d="M28 52 L44 68 L74 34"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="100"
              />
            </svg>
          </div>

          <h1 className="no-scientist-title">You&apos;re on the waitlist</h1>
          <p className="no-scientist-feedback">
            We&apos;ll let you know as soon as a scientist is available.
          </p>

          <button
            type="button"
            className="no-scientist-logout"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Logging out…" : "Log out"}
          </button>

          {logoutError && (
            <p className="no-scientist-feedback" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      ) : (
        <div className="no-scientist-content">
          <p className="no-scientist-eyebrow">Oops!</p>

          <img
            className="no-scientist-artwork"
            src={NoScientistArtwork}
            alt="Illustration of a scientist looking for something"
            draggable="false"
          />

          <h1 className="no-scientist-title">
            Scientist not available at the moment
          </h1>

          <button
            type="button"
            className="no-scientist-waitlist-button"
            onClick={handleJoinWaitlist}
          >
            Join the waitlist
          </button>
        </div>
      )}
    </section>
  );
}

export default NoScientistFoundCard;
