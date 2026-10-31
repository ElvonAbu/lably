import { apiClient } from "./apiClient";

/**
 * api/testRequestApi.js  (REPLACES your current file)
 * Only change: + getTestRequest(id) and + acceptTestRequest(id, scientistId).
 */

/**
 * Preview resolved lab tests (no booking saved).
 */
export function previewResolvedTests(payload) {
  return apiClient("/testrequest/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Submit booking.
 * payload: {
 *   patientid,
 *   proceedMode: "test" | "symptoms" | "checkup",
 *   selectedTests?: string[],
 *   symptoms?: string[],
 *   packageId?: "silver" | "gold" | "platinum",
 *   location?: { lat, lng, address }
 * }
 */
export function createTestRequest(payload) {
  return apiClient("/testrequest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listMyTestRequests() {
  return apiClient("/testrequest/mine", { method: "GET" });
}

/** NEW: one request (owner only). Used by useJobRealtime for polling. */
export function getTestRequest(id) {
  return apiClient(`/testrequest/${id}`, { method: "GET" });
}

/**
 * NEW: live scientist positions for the map (owner only).
 * -> { data: { riders: [{ id, lat, lng, distanceM, travelMode, updatedAt }], assigned } }
 * `riders` = every online, available scientist near the pin (as many as the backend has);
 * `assigned` = the scientist who accepted (kept live after the match).
 */
export function getNearbyScientists(id) {
  return apiClient(`/testrequest/${id}/scientists`, { method: "GET" });
}



/** NEW: save notes and/or change tests of an open request. body: { notes?, selectedTests? } */
export function updateTestRequestDetails(id, body) {
  return apiClient(`/testrequest/${id}/details`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** NEW (dev/testing): accept as a scientist. Real scientist app/email link comes later. */
export function acceptTestRequest(id, scientistId) {
  return apiClient(`/testrequest/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({ scientistId }),
  });
}

export function cancelTestRequest(id) {
  return apiClient(`/testrequest/${id}/cancel`, { method: "PATCH" });
}
