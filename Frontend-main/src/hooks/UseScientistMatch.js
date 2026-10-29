import { useEffect, useRef } from "react";

/*
 * DEV / PLACEHOLDER — decides when a scientist accepts the request.
 *
 * TODO(backend): replace the timer below with the real signal that a
 * scientist accepted booking `bookingId` (websocket event or polling
 * GET /testrequest/:id). Call `onMatch(scientist)` with:
 *   {
 *     id, name, etaMins, sampleId, regNo, phone?
 *   }
 *
 * In `npm run dev` a mock scientist "accepts" after a few seconds so the
 * found screen can be built and tested. It never runs in a production
 * build. Turn it off locally with VITE_MOCK_SCIENTIST_MATCH=false, change
 * the delay with VITE_MOCK_MATCH_DELAY_MS.
 */

const MOCK_ENABLED =
  import.meta.env.DEV &&
  import.meta.env.VITE_MOCK_SCIENTIST_MATCH !== "false";

const MOCK_DELAY_MS =
  Number(import.meta.env.VITE_MOCK_MATCH_DELAY_MS) || 9000;

const MOCK_SCIENTIST = {
  id: "mock-scientist-1",
  name: "Malcom Ekene",
  etaMins: 15,
  sampleId: "LABLY001NG",
  regNo: "202601",
};

export function useScientistMatch({ enabled, onMatch }) {
  const onMatchRef = useRef(onMatch);

  useEffect(() => {
    onMatchRef.current = onMatch;
  });

  useEffect(() => {
    if (!enabled || !MOCK_ENABLED) {
      return undefined;
    }

    const timer = setTimeout(() => {
      onMatchRef.current?.(MOCK_SCIENTIST);
    }, MOCK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [enabled]);
}
