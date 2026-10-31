import { useEffect, useState } from "react";
import NoScientistArtwork from "../../assets/svg/NoscientistAvail.svg";
import "./NoScientistFoundCard.css";

// How long "Try again" stays locked after a no-acceptance ending, so people give scientists a
// moment to free up instead of re-requesting at once. 0 = no lock.
const TRY_AGAIN_DELAY_S = 15;

/*
 * One entry per ending the backend can report in coverage.reason:
 *
 *   WAITLIST endings (nothing could be offered because coverage is missing; the backend has
 *   already put the request on the waitlist):
 *     no_scientist          -> no scientist inside the matching rules
 *     no_hub                -> no hub near the pickup point
 *     no_hub_and_scientist  -> neither
 *   NOT a waitlist ending:
 *     no_acceptance         -> scientists were notified but nobody accepted: encouraging
 *                              message + "Try again"
 */
const VARIANTS = {
  no_scientist: {
    waitlist: true,
    title: "No scientist in your area right now",
    body: "You're on the waitlist. We'll let you know as soon as a scientist is available near you.",
  },
  no_hub: {
    waitlist: true,
    title: "No hub in your area yet",
    body: "You're on the waitlist. We'll let you know as soon as a hub is available near you.",
  },
  no_hub_and_scientist: {
    waitlist: true,
    title: "No scientist or hub in your area yet",
    body: "You're on the waitlist. We'll let you know as soon as a scientist and a hub are available near you.",
  },
  no_acceptance: {
    waitlist: false,
    title: "Scientists are busy right now",
    body: "Nearby scientists are tied up at the moment, but things free up quickly. Give it a moment and try again, there's a good chance someone will be available.",
  },
};

// coverage = { reason, missing: [...] } from the backend. Falls back to `missing` (older
// requests), and anything unknown is treated as "try again", never as a waitlist.
function pickVariant(coverage) {
  if (coverage?.reason && VARIANTS[coverage.reason]) return VARIANTS[coverage.reason];
  const missing = Array.isArray(coverage?.missing) ? coverage.missing : [];
  const hub = missing.includes("hub");
  const scientist = missing.includes("scientist");
  if (hub && scientist) return VARIANTS.no_hub_and_scientist;
  if (hub) return VARIANTS.no_hub;
  if (scientist) return VARIANTS.no_scientist;
  return VARIANTS.no_acceptance;
}

function NoScientistFoundCard({
  coverage,
  onTryAgain,
  onLogout,
  isLoggingOut = false,
  logoutError = "",
}) {
  const { waitlist, title, body } = pickVariant(coverage);

  // "Try again" unlocks after a short moment (only shown when this is NOT a waitlist ending)
  const [lockLeft, setLockLeft] = useState(waitlist ? 0 : TRY_AGAIN_DELAY_S);
  useEffect(() => {
    if (waitlist || lockLeft <= 0) return undefined;
    const id = setTimeout(() => setLockLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [waitlist, lockLeft]);

  return (
    <section className="no-scientist-page" role="status" aria-live="polite">
      <div className="no-scientist-content">
        <p className="no-scientist-eyebrow">Oops!</p>
        <img
          className="no-scientist-artwork"
          src={NoScientistArtwork}
          alt="Illustration of a scientist looking for something"
          draggable="false"
        />
        <h1 className="no-scientist-title">{title}</h1>
        <p className="no-scientist-feedback">{body}</p>
        {!waitlist && (
          <button
            type="button"
            className="no-scientist-waitlist-button"
            onClick={onTryAgain}
            disabled={lockLeft > 0}
          >
            {lockLeft > 0 ? `Try again in ${lockLeft}s` : "Try again"}
          </button>
        )}
        <button
          type="button"
          className="no-scientist-logout"
          onClick={onLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "Logging out…" : "Log out"}
        </button>
        {logoutError && (
          <p className="no-scientist-feedback" role="alert">
            {logoutError}
          </p>
        )}
      </div>
    </section>
  );
}

export default NoScientistFoundCard;
