/**
 * scripts/ngrokTunnel.js  (started by `npm run dev` together with the backend and frontend)
 * ------------------------------------------------------------
 * 1. Opens an ngrok tunnel to the backend's tunnel server (127.0.0.1:NGROK_LOCAL_PORT).
 * 2. HEALTH LISTENER: every NGROK_HEALTH_SECONDS (default 15) it requests
 *        <public url>/ngrok-health
 *    through the real public internet path (internet -> ngrok -> this computer), prints
 *    UP / DOWN with the response time, and re-opens the tunnel after 3 failures in a row.
 * 3. Writes its state to a temp file (the backend reads the public address from it for the
 *    accept links) and serves the same information at http://127.0.0.1:4041/status.
 *
 * Set in lablybackend/.env:
 *   NGROK_AUTHTOKEN=...        (ngrok dashboard -> Your Authtoken)  REQUIRED
 *   NGROK_DOMAIN=...           your fixed ngrok domain (dashboard -> Domains), keeps the address the same
 *   NGROK_LOCAL_PORT=3001      optional
 *   NGROK_HEALTH_SECONDS=15    optional
 * Without NGROK_AUTHTOKEN this script prints a hint and exits quietly; the
 * frontend and backend keep running.
 */
import "dotenv/config";
import fs from "fs";
import http from "http";
import { NGROK_STATE_FILE } from "../utils/publicUrl.js";

const TAG = "[ngrok]";
const log = (msg) => console.log(`${TAG} ${msg}`);

if (!process.env.NGROK_AUTHTOKEN) {
  log("NGROK_AUTHTOKEN is not set in lablybackend/.env, so no tunnel is started. (Frontend and backend are unaffected.)");
  process.exit(0);
}

let ngrok;
try {
  ngrok = (await import("@ngrok/ngrok")).default;
} catch {
  log("The package @ngrok/ngrok is not installed. Run: npm install   (in lablybackend)");
  process.exit(0);
}

const port = Number(process.env.NGROK_LOCAL_PORT) || 3001;
const everyMs = Math.max(5, Number(process.env.NGROK_HEALTH_SECONDS) || 15) * 1000;

const state = {
  status: "starting", // starting | up | down
  url: null,
  latencyMs: null,
  checkedAt: null,
  startedAt: null,
  failures: 0,
  checks: 0,
  lastError: null,
};

function saveState() {
  try {
    fs.writeFileSync(NGROK_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`could not write ${NGROK_STATE_FILE}: ${e.message}`);
  }
}

let listener = null;

async function openTunnel() {
  try {
    await listener?.close();
  } catch {
    /* already closed */
  }
  listener = null;

  // The backend's tunnel server may need a moment at start-up: retry a few times.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      listener = await ngrok.forward({
        addr: port,
        authtoken_from_env: true,
        ...(process.env.NGROK_DOMAIN ? { domain: process.env.NGROK_DOMAIN } : {}),
      });
      state.url = listener.url();
      state.startedAt = new Date().toISOString();
      state.status = "starting";
      state.lastError = null;
      log(`tunnel open: ${state.url}  ->  127.0.0.1:${port}`);
      saveState();
      return true;
    } catch (e) {
      state.lastError = e.message;
      log(`could not open the tunnel (attempt ${attempt}/5): ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  state.status = "down";
  saveState();
  return false;
}

async function healthCheck() {
  if (!state.url) return;
  const started = Date.now();
  state.checks += 1;
  try {
    const res = await fetch(`${state.url}/ngrok-health`, {
      signal: AbortSignal.timeout(6000),
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const wasDown = state.status !== "up";
    state.status = "up";
    state.latencyMs = Date.now() - started;
    state.failures = 0;
    state.lastError = null;
    state.checkedAt = new Date().toISOString();
    if (wasDown) log(`UP   ${state.url}  (${state.latencyMs} ms)`);
    else if (state.checks % 20 === 0) log(`still up  ${state.latencyMs} ms  (${state.checks} checks)`);
  } catch (e) {
    state.failures += 1;
    state.lastError = e.message;
    state.checkedAt = new Date().toISOString();
    if (state.status !== "down") log(`DOWN ${state.url}  (${e.message})`);
    state.status = "down";
    if (state.failures >= 3) {
      log("3 failed checks in a row: re-opening the tunnel...");
      state.failures = 0;
      await openTunnel();
    }
  }
  saveState();
}

http
  .createServer((req, res) => {
    if (req.url === "/status" || req.url === "/") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(state, null, 2));
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  })
  .on("error", () => {})
  .listen(4041, "127.0.0.1", () => log("health status: http://127.0.0.1:4041/status"));

const shutdown = async () => {
  try {
    state.status = "down";
    saveState();
    await listener?.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (await openTunnel()) {
  setTimeout(healthCheck, 2000);
  setInterval(healthCheck, everyMs);
}
