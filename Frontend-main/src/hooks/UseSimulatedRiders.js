import { useEffect, useMemo, useState } from "react";

/*
 * DEV / PLACEHOLDER — fake nearby scientists.
 *
 * TODO(backend): replace with the real live feed of scientist positions
 * (websocket / polling). Return the same shape: [{ id, lat, lng }].
 *
 * While `active`, one scientist on foot starts a few hundred metres from `origin`
 * (already on screen when the request starts) and rides
 * towards the user, stopping a short distance away. Positions are updated
 * once a second; the marker glides between updates (see RiderMarker).
 */

const START_DISTANCE_M = 190;
const STOP_DISTANCE_M = 55;
const SPEED_MPS = 4.2; // brisk walk / light jog
const START_BEARING_DEG = 285; // coming in from the west-north-west
const STOP_BEARING_DEG = 250;
const TICK_MS = 1000;

const EMPTY = [];

function offsetPoint(origin, distanceM, bearingDeg) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const dNorth = Math.cos(bearing) * distanceM;
  const dEast = Math.sin(bearing) * distanceM;

  return {
    lat: origin.lat + dNorth / 111320,
    lng: origin.lng + dEast / (111320 * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

export function useSimulatedRiders({ origin, active }) {
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(0);
  // Which scientist turns up: picked at random for each new request.
  // TODO(backend): send `gender: "male" | "female"` with each real scientist.
  const [gender, setGender] = useState("male");

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => setStartedAt(null));
      return undefined;
    }

    queueMicrotask(() => {
      const t = Date.now();
      setStartedAt(t);
      setNow(t);
      setGender(Math.random() < 0.5 ? "female" : "male");
    });

    const id = setInterval(() => setNow(Date.now()), TICK_MS);

    return () => clearInterval(id);
  }, [active]);

  const originLat = origin?.lat;
  const originLng = origin?.lng;

  return useMemo(() => {
    if (!active || startedAt == null || originLat == null || originLng == null) {
      return EMPTY;
    }

    const base = { lat: originLat, lng: originLng };
    const start = offsetPoint(base, START_DISTANCE_M, START_BEARING_DEG);
    const stop = offsetPoint(base, STOP_DISTANCE_M, STOP_BEARING_DEG);

    const total = START_DISTANCE_M - STOP_DISTANCE_M;
    const travelled = Math.min(total, ((now - startedAt) / 1000) * SPEED_MPS);
    const t = total === 0 ? 1 : travelled / total;

    return [
      {
        id: "sim-rider-1",
        gender,
        lat: start.lat + (stop.lat - start.lat) * t,
        lng: start.lng + (stop.lng - start.lng) * t,
      },
    ];
  }, [active, startedAt, now, originLat, originLng, gender]);
}
