import { apiClient } from "./apiClient";


// ============================================================
// TEST BACKEND CONNECTION
// ============================================================

export function testBackendConnection() {

    return apiClient("/");

}