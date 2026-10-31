import { useMemo } from "react";
import { useJobRealtime } from "./useJobRealtime";
import { useNearbyScientists } from "./useNearbyScientists";

/**
 * hooks/useLiveRequest.js  (NEW)
 * One place that turns the REAL backend state of a booking into what the
 * request screen needs. Replaces the dev placeholders UseSimulatedRiders /
 * UseScientistMatch.
 *
 *   phase        "searching" | "found" | "not-found"   (from the job's Status)
 *   notifiedCount, secondsLeft                         (server-driven 48 s search)
 *   riders                                             (live nearby scientists)
 *   scientist    profile for ScientistFoundCard (name, etaMins, distanceM)
 *   scientistPosition  live position of the scientist who accepted
 */
export function useLiveRequest({ bookingId, active }) {
  const { job: rawJob, notifiedCount, secondsLeft } = useJobRealtime(
    active ? bookingId : null
  );

  // useJobRealtime keeps the last job until the next one loads: only trust a
  // job that belongs to THIS booking.
  const job =
    rawJob && bookingId && String(rawJob._id) === String(bookingId) ? rawJob : null;

  const jobStatus = job?.Status ?? null;
  const phase =
    jobStatus === "Matched" || jobStatus === "Approved"
      ? "found"
      : jobStatus === "NoCoverage"
      ? "not-found"
      : "searching";

  const { riders, assigned, radiusM } = useNearbyScientists({
    jobId: bookingId,
    active: Boolean(active) && phase !== "not-found",
  });

  const snapshot = job?.scientistSnapshot;

  const scientist = useMemo(() => {
    if (phase !== "found" || !snapshot) return null;

    const km = snapshot.distanceToPatientKm;
    return {
      id: job?.scientistId ? String(job.scientistId) : null,
      name: snapshot.displayName,
      etaMins:
        snapshot.etaToPatientMin != null
          ? Math.max(1, Math.round(snapshot.etaToPatientMin))
          : null,
      distanceM: assigned?.distanceM ?? (km != null ? Math.round(km * 1000) : null),
            travelMode: snapshot.travelMode,
      // Kept from the earlier version of the found card. TODO(backend): the booking does not
      // have these yet; when it does, they are used automatically (job.sampleId / job.regNo).
      sampleId: job?.sampleId ?? "LABLY001NG",
      regNo: job?.regNo ?? "202601",
    };
    }, [phase, snapshot, job?.scientistId, job?.sampleId, job?.regNo, assigned?.distanceM]);

  const scientistPosition = useMemo(() => {
    if (phase !== "found") return null;
    if (assigned) return assigned;
    if (snapshot?.latitude != null && snapshot?.longitude != null && job?.scientistId) {
      return {
        id: String(job.scientistId),
        lat: snapshot.latitude,
        lng: snapshot.longitude,
        distanceM:
          snapshot.distanceToPatientKm != null
            ? Math.round(snapshot.distanceToPatientKm * 1000)
            : null,
      };
    }
    return null;
  }, [phase, assigned, snapshot, job?.scientistId]);

  return {
    phase,
        jobStatus,
    // why there is no coverage: { reason, missing: ["scientist"|"hub"], message } or null
    noCoverage: phase === "not-found" ? job?.noCoverage ?? null : null,
    notifiedCount: job ? notifiedCount : 0,
    secondsLeft: job ? secondsLeft : 0,
        riders,
    radiusM,
    scientist,
    scientistPosition,
  };
}
