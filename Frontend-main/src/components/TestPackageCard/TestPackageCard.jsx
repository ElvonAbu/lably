import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import "./TestPackageCard.css";

const PACKAGES = [
  { id: "silver", label: "Silver package" },
  { id: "gold", label: "Gold package" },
  { id: "platinum", label: "Platinum package" },
];

const OPEN_DURATION = 1000; // how long the unwrap sequence stays "open" before auto-closing

function GiftIcon() {
  const [open, setOpen] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const closeTimer = useRef(null);
  const restartTimer = useRef(null);

  const triggerOpen = () => {
    setOpen(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);

    closeTimer.current = setTimeout(() => {
      setOpen(false);
      // Restart the idle wiggle from scratch shortly after closing,
      // instead of resuming wherever it was paused mid-cycle.
      restartTimer.current = setTimeout(() => {
        setShakeKey((k) => k + 1);
      }, 400);
    }, OPEN_DURATION);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
  }, []);

  return (
    <div
      key={shakeKey}
      className={`test-package-icon${open ? " gift-icon-open" : ""}`}
      onMouseEnter={triggerOpen}
      onClick={triggerOpen}
      role="button"
      tabIndex={0}
      aria-label="Gift"
    >
      <svg className="gift-icon-svg" width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" overflow="visible">
        <ellipse className="gift-icon-shadow" cx="20" cy="34.5" rx="12" ry="1.6" fill="#7A11F1" opacity=".12" />

        <path className="gift-icon-sparkle gift-icon-sparkle-1" d="M2 6 L3.6 9.6 L7.2 11.2 L3.6 12.8 L2 16.4 L0.4 12.8 L-3.2 11.2 L0.4 9.6 Z" fill="#FFC94D" />
        <path className="gift-icon-sparkle gift-icon-sparkle-2" d="M36 2 L37.1 4.6 L39.7 5.7 L37.1 6.8 L36 9.4 L34.9 6.8 L32.3 5.7 L34.9 4.6 Z" fill="#C084FC" />
        <path className="gift-icon-sparkle gift-icon-sparkle-3" d="M39 22 L40 24.3 L42.3 25.3 L40 26.3 L39 28.6 L38 26.3 L35.7 25.3 L38 24.3 Z" fill="#FFC94D" />
        <path className="gift-icon-sparkle gift-icon-sparkle-4" d="M0 24 L1 26.3 L3.3 27.3 L1 28.3 L0 30.6 L-1 28.3 L-3.3 27.3 L-1 26.3 Z" fill="#7A11F1" />
        <path className="gift-icon-sparkle gift-icon-sparkle-5" d="M20 -2 L20.8 0 L22.8 0.8 L20.8 1.6 L20 3.6 L19.2 1.6 L17.2 0.8 L19.2 0 Z" fill="#C084FC" />

        <g className="gift-icon-box">
          <rect x="8" y="17" width="24" height="15" rx="2.5" fill="#9B3CF5" />
          <rect x="8" y="17" width="24" height="15" rx="2.5" fill="url(#giftBodyShade)" />
          <rect x="17.3" y="17" width="5.4" height="15" fill="#5B0FBD" />
          <rect x="17.3" y="17" width="5.4" height="15" fill="url(#ribbonShade)" />
        </g>

        <g className="gift-icon-lid">
          <rect x="6" y="13" width="28" height="7" rx="2" fill="#7A11F1" />
          <rect x="6" y="13" width="28" height="7" rx="2" fill="url(#giftLidShade)" />
          <rect x="17.3" y="13" width="5.4" height="7" fill="#5B0FBD" />
        </g>

        <g className="gift-icon-bow">
          <path d="M20 13C20 13 14.5 12.5 13.5 8.8C12.9 6.6 14.6 4.6 16.7 5.2C19 5.9 20 9 20 13Z" fill="#C084FC" />
          <path d="M20 13C20 13 25.5 12.5 26.5 8.8C27.1 6.6 25.4 4.6 23.3 5.2C21 5.9 20 9 20 13Z" fill="#B15CF7" />
          <circle cx="20" cy="13" r="2.1" fill="#5B0FBD" />
        </g>

        <defs>
          <linearGradient id="giftBodyShade" x1="8" y1="17" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" stopOpacity=".28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="giftLidShade" x1="6" y1="13" x2="34" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" stopOpacity=".35" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ribbonShade" x1="17.3" y1="17" x2="22.7" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#000" stopOpacity=".18" />
            <stop offset=".5" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function TestPackageCard({ onNext, onClose }) {
 const [selected, setSelected] = useState(null);

  return (
    <div className="test-package-overlay" onClick={onClose}>
      <div className="test-package-card" onClick={(e) => e.stopPropagation()}>
        <GiftIcon />

        <h2 className="test-package-title">Select your test package</h2>

        <div className="test-package-options">
          {PACKAGES.map((pkg) => (
            <label
              key={pkg.id}
              className={
                selected === pkg.id
                  ? "test-package-option test-package-option-active"
                  : "test-package-option"
              }
            >
              <input
                type="radio"
                name="test-package"
                value={pkg.id}
                checked={selected === pkg.id}
                onChange={() => setSelected(pkg.id)}
              />
              <span className="test-package-radio-dot">
                {selected === pkg.id && <Check size={14} color="white" strokeWidth={3} />}
              </span>
              <span className="test-package-label">{pkg.label}</span>
            </label>
          ))}
        </div>

       <button type="button" className="test-package-next btn-primary" disabled={!selected} onClick={() => onNext(selected)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default TestPackageCard;