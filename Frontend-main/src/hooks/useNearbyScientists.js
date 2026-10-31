import { useEffect, useState } from "react";
import { getNearbyScientists } from "../api/testRequestApi";

/**
 * hooks/useNearbyScientists.js  (NEW)
 * Live scientist positions for the map, like a ride-hailing app.
 *
 *   const { riders, assigned } = useNearbyScientists({ jobId, active });
 *
 * - riders   : every online + available scientist near the patient's pin, as
 *              many as the backend returns: [{ id, lat, lng, distanceM, travelMode }]
  * - assigned : the scientist who accepted this request (same shape) or null
 * - radiusM  : the backend matching distance (metres); the map zooms out to cover it
 *
   * Polls GET /testrequest/:id/scientists every few seconds while `active`.
 * The map only SHOWS a rider once its location is inside the visible area
 * (see Map.jsx), so riders pop up as the search view zooms out to them.
 */
const POLL_MS = 3000;
const EMPTY = Object.freeze({ riders: Object.freeze([]), assigned: null, radiusM: 0 });

export function useNearbyScientists({ jobId, active }) {
  const [state, setState] = useState({ jobId: null, riders: EMPTY.riders, assigned: null, radiusM: 0 });

  useEffect(() => {
    if (!jobId || !active) return undefined;
    let stopped = false;

    const poll = () =>
      getNearbyScientists(jobId)
        .then((res) => {
          if (stopped) return;
          setState({
            jobId,
            riders: res?.data?.riders ?? EMPTY.riders,
                        assigned: res?.data?.assigned ?? null,
            radiusM: res?.data?.radiusM ?? 0,

          });
        })
        .catch((error) => {
          // Not silent any more: an empty map is easier to debug with this line.
          console.warn("LABLY nearby scientists request failed:", error?.message || error);
        });

    poll();
    const timer = setInterval(poll, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
      }, [jobId, active]);

  // Ignore data that belongs to a previous request or a closed screen.
  return jobId && active && state.jobId === jobId ? state : EMPTY;
}
