import { useEffect, useRef, useState } from "react";
import { Marker } from "react-map-gl";

/*
 * The scientist on the map: a top-down purple motorbike with a rider
 * carrying a lab sample box. Whenever `lng/lat` change it glides to the new
 * position (instead of jumping) and turns to face the way it is travelling.
 *
 * Only this small component re-renders on every animation frame — the
 * big Map component does not.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Compass bearing (degrees, 0 = north) from one point to another.
function bearingBetween(from, to) {
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  const dy = to.lat - from.lat;

  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function BikeIcon() {
  return (
    <svg viewBox="0 0 40 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bikeJacket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A45CF8" />
          <stop offset="1" stopColor="#5A0BBA" />
        </linearGradient>
        <linearGradient id="bikeTank" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B07CFA" />
          <stop offset="1" stopColor="#6A18D8" />
        </linearGradient>
        <linearGradient id="bikeBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E6DEF5" />
        </linearGradient>
      </defs>

      {/* wheels */}
      <rect x="16.5" y="2" width="7" height="14" rx="3.5" fill="#1B1130" />
      <rect x="16" y="46" width="8" height="16" rx="4" fill="#1B1130" />

      {/* frame + tank */}
      <rect x="18" y="12" width="4" height="40" rx="2" fill="#3A2A5C" />
      <path
        d="M20 14c5 0 7 4 7 9.5S24.5 36 20 36s-7-7-7-12.5S15 14 20 14z"
        fill="url(#bikeTank)"
      />

      {/* handlebar + mirrors */}
      <rect x="4" y="19" width="32" height="3.2" rx="1.6" fill="#1B1130" />
      <circle cx="5" cy="17.5" r="2.4" fill="#B9A7DB" />
      <circle cx="35" cy="17.5" r="2.4" fill="#B9A7DB" />

      {/* arms */}
      <path d="M12 31 L7 21.5" stroke="#5A0BBA" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M28 31 L33 21.5" stroke="#5A0BBA" strokeWidth="4.4" strokeLinecap="round" />

      {/* sample box on the back */}
      <rect x="9.5" y="41" width="21" height="15" rx="3.5" fill="url(#bikeBox)" stroke="#CFC3E8" strokeWidth="1" />
      <rect x="18.8" y="44" width="2.4" height="9" rx="1" fill="#7A11F1" />
      <rect x="15.5" y="47.3" width="9" height="2.4" rx="1" fill="#7A11F1" />

      {/* rider: shoulders + helmet */}
      <ellipse cx="20" cy="33" rx="10.5" ry="6.5" fill="url(#bikeJacket)" />
      <circle cx="20" cy="30.5" r="5.8" fill="#fff" />
      <path d="M15.2 28.8c1.400-1.800 3.100-2.600 4.800-2.600s3.400.8 4.800 2.600c-1.400-.6-3-.9-4.800-.9s-3.400.3-4.800.9z" fill="#7A11F1" />
    </svg>
  );
}

function RiderMarker({ lng, lat, glideMs = 1000 }) {
  const [position, setPosition] = useState({ lng, lat });
  const positionRef = useRef({ lng, lat });

  // Continuous (unwrapped) angle so the bike never spins the long way round.
  const [heading, setHeading] = useState(0);
  const headingRef = useRef(0);

  useEffect(() => {
    const from = positionRef.current;

    if (from.lng === lng && from.lat === lat) {
      return undefined;
    }

    const target = bearingBetween(from, { lng, lat });
    const current = headingRef.current;
    const delta = ((((target - current) % 360) + 540) % 360) - 180;

    headingRef.current = current + delta;
    queueMicrotask(() => setHeading(headingRef.current));

    const duration = prefersReducedMotion() ? 0 : glideMs;
    let frame = 0;
    let startTime = null;

    const step = (time) => {
      if (startTime === null) {
        startTime = time;
      }

      const t = duration === 0 ? 1 : Math.min(1, (time - startTime) / duration);

      const next = {
        lng: from.lng + (lng - from.lng) * t,
        lat: from.lat + (lat - from.lat) * t,
      };

      positionRef.current = next;
      setPosition(next);

      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [lng, lat, glideMs]);

  return (
    <Marker
      longitude={position.lng}
      latitude={position.lat}
      anchor="center"
      style={{ zIndex: 2 }}
    >
      <div className="rider-marker" aria-label="Scientist">
        <span className="rider-marker-pulse" />
        <div
          className="rider-marker-bike"
          style={{ transform: `rotate(${heading}deg)` }}
        >
          <BikeIcon />
        </div>
      </div>
    </Marker>
  );
}

export default RiderMarker;
