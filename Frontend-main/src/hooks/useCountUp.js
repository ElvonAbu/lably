import { useEffect, useRef, useState } from "react";

/**
 * hooks/useCountUp.js  (NEW)
 *
 * Turns a number that JUMPS (0 -> 2) into one that COUNTS (0 -> 1 -> 2).
 *
 *   const shown = useCountUp(notifiedCount);
 *
 * - Goes up one at a time. The first step is immediate, then each further step
 *   waits `stepMs`. For big jumps the steps get faster, so one jump never takes
 *   much more than ~1.4 s in total.
 * - Goes DOWN (or resets for a new request) instantly.
 * - Respects "reduce motion": the value just follows the target.
 */
export function useCountUp(target, stepMs = 650) {
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
  const [shown, setShown] = useState(0);
  const lastStepAt = useRef(0);
  const burst = useRef({ target: 0, gap: 0 }); // size of the current jump

  // Target went below what we show (reset / new request): snap down right away.
  if (shown > safeTarget) {
    setShown(safeTarget);
  }

  useEffect(() => {
    if (shown >= safeTarget) return undefined;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // A new jump starts whenever the target changes: remember how big it is.
    if (burst.current.target !== safeTarget) {
      burst.current = { target: safeTarget, gap: safeTarget - shown };
    }
    const betweenSteps = Math.max(
      100,
      Math.min(stepMs, 1400 / Math.max(1, burst.current.gap))
    );
    const wait = reduceMotion
      ? 0
      : Math.max(0, betweenSteps - (Date.now() - lastStepAt.current));

    const timer = setTimeout(() => {
      lastStepAt.current = Date.now();
      setShown((n) => (reduceMotion ? safeTarget : Math.min(n + 1, safeTarget)));
    }, wait);

    return () => clearTimeout(timer);
  }, [shown, safeTarget, stepMs]);

  return Math.min(shown, safeTarget);
}
