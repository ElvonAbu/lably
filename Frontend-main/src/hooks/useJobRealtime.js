import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getTestRequest } from "../api/testRequestApi";

/**
 * hooks/useJobRealtime.js  (NEW)
 * Live view of one TestRequest for the patient UI.
 *
 *   const { job, notifiedCount, status, secondsLeft } = useJobRealtime(jobId);
 *
 * - Socket.IO "job_update" gives instant updates.
 * - A 3s poll of GET /testrequest/:id is the safety net if the socket drops.
 * - secondsLeft counts down to matchingState.expiresAt (the server's 48s
 *   deadline), so the UI timer and the backend can never disagree.
 *
 * Needs:  npm i socket.io-client
 */
const API_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

export function useJobRealtime(jobId) {
  const [job, setJob] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const jobRef = useRef(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let stopped = false;
    // A new request must never inherit fields from the previous one.
    jobRef.current = null;

    const apply = (next) => {
      if (stopped || !next) return;
      jobRef.current = next;
      setJob(next);
    };

    // 1) first load + 3s polling fallback
    const poll = () =>
      getTestRequest(jobId)
        .then((r) => apply(r?.data))
        .catch(() => {});
    poll();
    const pollTimer = setInterval(poll, 3000);

    // 2) realtime
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("join", { jobId }));
    socket.on("job_update", (payload) => {
      if (String(payload?.job?._id) === String(jobId)) {
        // socket copy has no scientist id list; merge over what we have
        apply({ ...(jobRef.current || {}), ...payload.job });
      }
    });

    return () => {
      stopped = true;
      clearInterval(pollTimer);
      socket.disconnect();
    };
  }, [jobId]);

  // countdown to the server's expiresAt
  const expiresAt = job?.matchingState?.expiresAt;
  const status = job?.Status;
  useEffect(() => {
    if (!expiresAt || status !== "Searching") {
      setSecondsLeft(0);
      return undefined;
    }
    const tick = () =>
      setSecondsLeft(
        Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
      );
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [expiresAt, status]);

  return {
    job,
    status,
    notifiedCount: job?.matchingState?.notifiedCount ?? 0,
    secondsLeft,
  };
}
