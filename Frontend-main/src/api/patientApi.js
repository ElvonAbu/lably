import { apiClient } from "./apiClient";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Frontend PersonalInfoCard shape → backend payload */
export function frontendInfoToBackend(data, relationship) {
  const monthIndex = MONTHS.indexOf(data.month);
  const monthNum = monthIndex >= 0 ? monthIndex + 1 : Number(data.month);
  const day = String(data.day).padStart(2, "0");
  const month = String(monthNum).padStart(2, "0");
  const dateofbirth = `${data.year}-${month}-${day}`;

  return {
    fullname: data.name?.trim(),
    dateofbirth,
    gender: String(data.gender || "").toLowerCase(), // Male → male
    medicalhistory: data.history ?? "",
    relationship, // "self" | "other"
  };
}

/** Backend patient document → PersonalInfoCard initialValues */
export function backendPatientToFrontend(patient) {
  if (!patient) return null;

  const d = new Date(patient.dateofbirth);
  if (Number.isNaN(d.getTime())) return null;

  const genderRaw = patient.gender || "";
  const gender =
    genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1).toLowerCase();

  return {
    name: patient.fullname || "",
    month: MONTHS[d.getUTCMonth()] || MONTHS[d.getMonth()],
    day: String(d.getUTCDate() || d.getDate()),
    year: String(d.getUTCFullYear() || d.getFullYear()),
    gender, // Male / Female for the select
    history: patient.medicalhistory || "",
    // keep backend id for reference
    _id: patient._id,
  };
}

/** GET /patientdetails/me */
export function getMyPatientProfile() {
  return apiClient("/patientdetails/me", { method: "GET" });
}

/** POST /patientdetails — relationship "self" | "other" */
export function savePatientDetails(frontendData, relationship) {
  const body = frontendInfoToBackend(frontendData, relationship);
  return apiClient("/patientdetails", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** PUT /patientdetails/me */
export function updateMyPatientProfile(frontendData) {
  const body = frontendInfoToBackend(frontendData, "self");
  // relationship not required on PUT, but harmless if sent
  delete body.relationship;
  return apiClient("/patientdetails/me", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}