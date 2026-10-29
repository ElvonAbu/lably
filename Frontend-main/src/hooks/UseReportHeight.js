import { useLayoutEffect, useRef } from "react";

/*
 * Attach the returned ref to an element and `onHeight` is called with its
 * rendered height (px) on mount and whenever it changes. Called with 0 when
 * the element unmounts.
 *
 * Used by the bottom sheets on the request flow so the map can keep the
 * puck centred in the part of the map that is still visible above the sheet.
 */
export function useReportHeight(onHeight) {
  const ref = useRef(null);
  const callbackRef = useRef(onHeight);

  useLayoutEffect(() => {
    callbackRef.current = onHeight;
  });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const report = () => {
      callbackRef.current?.(Math.round(element.getBoundingClientRect().height));
    };

    report();

    let observer = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(report);
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      callbackRef.current?.(0);
    };
  }, []);

  return ref;
}
