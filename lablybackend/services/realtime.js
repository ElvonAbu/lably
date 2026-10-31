/**
 * services/realtime.js
 * ------------------------------------------------------------
 * Socket.IO wiring. Two kinds of events:
 *
 *   job_update     -> PATIENT UI. Sent to rooms  user:<supabaseUserId>
 *                     and job:<jobId>. Drives "N scientists are viewing..."
 *                     / Matched / NoCoverage.
 *   booking_offer  -> SCIENTIST app (future). Sent to room scientist:<id>.
 *                     Either a new offer, or { withdrawn: true } when the offer
 *                     is no longer valid (accepted by someone else / expired /
 *                     canceled).
 *
 * TODO (hardening, not in Phase 1): "join" is unauthenticated. Verify the
 * Supabase token in a socket middleware before letting anyone join a room.
 */

let io = null;

export function initRealtime(socketIoInstance) {
  io = socketIoInstance;

  io.on("connection", (socket) => {
    socket.on("join", (payload = {}) => {
      if (payload.userId) socket.join(`user:${payload.userId}`);
      if (payload.jobId) socket.join(`job:${payload.jobId}`);
      if (payload.scientistId) socket.join(`scientist:${payload.scientistId}`);
    });
  });

  console.log("LABLY socket.io ready");
}

/**
 * What the patient is allowed to see over the socket.
 * The scientist id list stays on the server; the UI only needs the count.
 */
function publicJob(job) {
  const ms = job.matchingState || {};
  return {
    ...job,
    matchingState: {
      stageIndex: ms.stageIndex,
      currentStageMin: ms.currentStageMin,
      notifiedCount: ms.notifiedCount,
      startedAt: ms.startedAt,
      expiresAt: ms.expiresAt,
    },
  };
}

/** Patient UI listens for this. Pass a plain object (job.toObject()). */
export function emitJobUpdate(job) {
  if (!io || !job) return;
  const payload = { type: "job_update", job: publicJob(job) };
  if (job.supabaseUserId) {
    io.to(`user:${job.supabaseUserId}`).emit("job_update", payload);
  }
  if (job._id) {
    io.to(`job:${String(job._id)}`).emit("job_update", payload);
  }
}

/** Scientist app (and later the email pipeline) listens for this. */
export function emitBookingOffer(scientistId, offer) {
  if (!io || !scientistId) return;
  io.to(`scientist:${String(scientistId)}`).emit("booking_offer", offer);
}
