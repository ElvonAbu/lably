import { useCallback, useRef } from "react";

const MOBILE_QUERY = "(max-width: 640px)";

/**
 * Drag-to-dismiss for the mobile bottom-sheet layout. Downward drag moves
 * the sheet 1:1 with the finger; upward drag is clamped to 0 so it can
 * never be pulled past its resting position. Past a small threshold, it
 * finishes leaving the screen and closes — there's no "snap back to a
 * bigger sheet" state to fight with, just closed or not.
 */
export function useSheetDrag(sheetRef, onClose) {
  const startY = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    dragging.current = true;
    startY.current = e.clientY;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [sheetRef]);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const delta = Math.max(0, e.clientY - startY.current);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, [sheetRef]);

  const endDrag = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const delta = Math.max(0, e.clientY - startY.current);
    sheet.style.transition = "transform .25s cubic-bezier(.32,.72,0,1)";

    const threshold = Math.min(70, sheet.offsetHeight * 0.15);
    if (delta > threshold) {
      sheet.style.transform = "translateY(100%)";
      setTimeout(() => onClose?.(), 220);
    } else {
      sheet.style.transform = "translateY(0)";
    }
  }, [sheetRef, onClose]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}