import fs from "fs";
import os from "os";
import path from "path";

/**
 * utils/publicUrl.js
 * ------------------------------------------------------------
 * The PUBLIC address of this backend, used in the offer-email accept links.
 *   1. publicBaseUrl in .env (explicit, always wins; use it for a deployed server)
 *   2. the ngrok tunnel started by `npm run dev` (scripts/ngrokTunnel.js writes its
 *      address to a temp file, so a changing ngrok address needs no .env edit)
 *   3. https://localhost:3000 (only works on this computer)
 */
// In the system temp folder, NOT in the project: nodemon restarts the backend whenever a
// file inside it changes, and this file is rewritten every few seconds.
export const NGROK_STATE_FILE = path.join(os.tmpdir(), "lably-ngrok-state.json");

export function readNgrokState() {
  try {
    return JSON.parse(fs.readFileSync(NGROK_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

const FRESH_MS = 90_000; // the tunnel script refreshes the file every few seconds

export function getPublicBaseUrl() {
  const explicit = String(process.env.publicBaseUrl || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const state = readNgrokState();
  if (
    state?.status === "up" &&
    state.url &&
    Date.now() - new Date(state.checkedAt || 0).getTime() < FRESH_MS
  ) {
    return String(state.url).replace(/\/$/, "");
  }
  return "https://localhost:3000";
}
