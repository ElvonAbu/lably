import { apiClient } from "./apiClient";

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

export function cancelTestRequest(id) {
  return apiClient(`/testrequest/${id}/cancel`, { method: "PATCH" });
}