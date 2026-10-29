import { ChevronRight, X } from "lucide-react";

import { useReportHeight } from "../../hooks/UseReportHeight";

import ScientistAvatar from "../../assets/svg/eos-icons_scientist.svg";
import ContactScientistIcon from "../../assets/svg/Contact_scientist.svg";
import InAppMessageIcon from "../../assets/svg/In-app_message_icon.svg";

import "./ScientistFoundCard.css";

// Dashed line + clock, matching the "Booking Timeline" row in the design.
function TimelineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 4v2M4 11v2M4 18v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="14.5" cy="12" r="7" fill="currentColor" />
      <path
        d="M14.5 8.5V12l2.4 1.6"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SirenIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 18v-6a5 5 0 0 1 10 0v6" />
      <path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z" />
      <path d="M21 12h1M2 12h1M12 2v1M4.9 4.9l.7.7M19.1 4.9l-.7.7" />
      <path d="M12 12v6" />
    </svg>
  );
}

/*
 * Shown once a scientist has accepted the request.
 *
 * `scientist` = { name, etaMins, sampleId, regNo } (see UseScientistMatch.js)
 *
 * The price is fixed — there is nothing to negotiate on this screen.
 */
function ScientistFoundCard({
  scientist,
  userAddress,
  scientistAddress,
  onContact,
  onMessage,
  onTimeline,
  onSos,
  onCheckout,
  onCancel,
  onHeightChange,
}) {
  const sheetRef = useReportHeight(onHeightChange);

  const eta = scientist?.etaMins;

  return (
    <div className="scientist-found-sheet" ref={sheetRef}>
      <div className="scientist-found-handle" />

      <div className="scientist-found-scroll">
        <div className="scientist-found-top">
          <h2 className="scientist-found-title">
            {eta != null
              ? `Scientist is approx ~ ${eta} mins away`
              : "Scientist is on the way"}
          </h2>

          {scientist?.sampleId && (
            <p className="scientist-found-sample">Sample ID: {scientist.sampleId}</p>
          )}

          {scientist?.regNo && (
            <span className="scientist-found-reg">REG NO: {scientist.regNo}</span>
          )}
        </div>

        <div className="scientist-found-actions">
          <div className="scientist-found-action">
            <img
              src={ScientistAvatar}
              alt=""
              className="scientist-found-avatar"
              draggable="false"
            />
            <span className="scientist-found-action-label">
              {scientist?.name ? `Sct. ${scientist.name}` : "Your scientist"}
            </span>
          </div>

          <button
            type="button"
            className="scientist-found-action scientist-found-action-btn"
            onClick={onContact}
          >
            <img
              src={ContactScientistIcon}
              alt=""
              className="scientist-found-action-icon"
              draggable="false"
            />
            <span className="scientist-found-action-label">Contact Scientist</span>
          </button>

          <button
            type="button"
            className="scientist-found-action scientist-found-action-btn"
            onClick={onMessage}
          >
            <img
              src={InAppMessageIcon}
              alt=""
              className="scientist-found-action-icon"
              draggable="false"
            />
            <span className="scientist-found-action-label">In-app message</span>
          </button>
        </div>

        <div className="scientist-found-list">
          <button
            type="button"
            className="scientist-found-row scientist-found-row-primary"
            onClick={onTimeline}
          >
            <span className="scientist-found-row-icon">
              <TimelineIcon />
            </span>
            <span className="scientist-found-row-text">Booking Timeline</span>
            <ChevronRight size={16} />
          </button>

        </div>

        <p className="scientist-found-label">Your current request</p>

        <div className="scientist-found-location">
          <span className="scientist-found-dot scientist-found-dot-user" />
          <span className="scientist-found-location-text">
            {userAddress || "Your location"}
          </span>
        </div>

        <div className="scientist-found-location">
          <span className="scientist-found-dot scientist-found-dot-scientist" />
          <span className="scientist-found-location-text">
            {scientistAddress || "Scientist's current location"}
          </span>
        </div>

        <button
          type="button"
          className="scientist-found-row scientist-found-row-sos"
          onClick={onSos}
        >
          <span className="scientist-found-row-icon">
            <SirenIcon />
          </span>
          <span className="scientist-found-row-text">SOS emergency</span>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="scientist-found-footer">
        <button type="button" className="scientist-found-checkout" onClick={onCheckout}>
          Proceed to checkout
        </button>

        <button type="button" className="scientist-found-cancel" onClick={onCancel}>
          Cancel
          <X size={22} />
        </button>
      </div>
    </div>
  );
}

export default ScientistFoundCard;
