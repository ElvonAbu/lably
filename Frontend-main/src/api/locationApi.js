import { apiClient } from "./apiClient";

export function saveUserLocation(latitude, longitude) {
  return apiClient("/userlocation", {
    method: "POST",
    body: JSON.stringify({
      latitude,
      longitude,
    }),
  });
}