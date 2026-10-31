// FIRST import in the file: loads .env before anything else reads process.env.
// (Replaces `import dotenv from "dotenv"` + `dotenv.config()`.)
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import dns from "dns";
import { Server } from "socket.io"; // NEW

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const db_url = process.env.databaseurl;
const app = express();
// Hosting platforms (Railway, Render, ...) tell the app which port to use via PORT.
const port = Number(process.env.PORT) || 3000;

import Loginroute from "./routes/Login.js";
import Signuproute from "./routes/signup.js";
import Forgotpassword from "./routes/ForgotPassword.js";
import otp from "./routes/otp.js";
import userlocation from "./routes/userlocation.js";
import registertest from "./routes/registertest.js";
import patientdetails from "./routes/patientdetails.js";
// === smart booking ===
import Testrequest from "./routes/Testrequest.js";
// === NEW: matching ===
import matchDev from "./routes/matchDev.js";
import scientistEmailAccept from "./routes/scientistEmailAccept.js";
import scientistOps from "./routes/scientistOps.js";
import devGuard from "./middlewares/devGuard.js";
import { startTunnelServer } from "./utils/tunnelServer.js";
import { readNgrokState } from "./utils/publicUrl.js";
import { initRealtime } from "./services/realtime.js";
import { googleEvents, checkGoogle, mapboxEvents, checkMapbox } from "./utils/routeDistance.js";
import { attachCompareLogger, compareConfig } from "./utils/providerCompare.js";
import {
  resumeSearchingJobs,
  repairStuckScientists,
  matchingConfig,
} from "./services/matchingCascade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, "../certs");
const keyPath = path.join(certDir, "dev-key.pem");
const certPath = path.join(certDir, "dev-cert.pem");
// The mkcert dev certificate is for local use only. On a host (PORT is set) the platform
// provides HTTPS and forwards plain HTTP to this app.
const hasCerts =
  !process.env.PORT && fs.existsSync(keyPath) && fs.existsSync(certPath);

const allowedOrigins = (process.env.corsOrigins || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// The dev console (/match-dev/console) is served FROM this backend, so
// fetch() calls it makes carry this server's own origin header on
// POST/PATCH/DELETE - that's not a cross-origin request in any meaningful
// sense, so always allow it rather than requiring it in corsOrigins too.
allowedOrigins.push(`${hasCerts ? "https" : "http"}://localhost:${port}`);

mongoose
  .connect(db_url)
  .then(async () => {
    console.log("Database Connected");

    const server = hasCerts
      ? https.createServer(
          {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
          },
          app
        )
      : http.createServer(app);

    // NEW: Socket.IO on the same server (patient "N viewing" + scientist offers)
    const io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });
    initRealtime(io);

    console.log("LABLY matching rules:", JSON.stringify(matchingConfig()));

    // NEW: GOOGLE HEALTH LISTENER. Prints a terminal line whenever Google's
    // health CHANGES (same style as "Database Connected").
    googleEvents.on("status", ({ state, reason, previous }) => {
      if (state === "up") {
        console.log(
          previous === "down" ? `Google RECOVERED (${reason})` : "Google Connected"
        );
      } else if (state === "down") {
        const strict = matchingConfig().unverifiedPolicy === "strict";
        console.warn(
          `Google DOWN: ${reason}. ` +
            (strict
              ? "Rule is strict: scientists can't be road-verified until Google is back."
              : "Rule is estimate: using straight-line x detour factor.")
        );
      } else if (state === "off") {
        console.log(`Google bypassed: ${reason} (Haversine is the rule for this run)`);
      }
    });
    checkGoogle().catch(() => {}); // startup probe (1 tiny request), not awaited

    // NEW: MAPBOX HEALTH LISTENER. Mapbox is the 3rd tier (after Google Pro and Essentials,
    // before Google Legacy) and the failover when Google is unavailable. Same style as Google's.
    mapboxEvents.on("status", ({ state, reason, previous }) => {
      if (state === "up") {
        console.log(previous === "down" ? `Mapbox RECOVERED (${reason})` : "Mapbox Connected");
      } else if (state === "down") {
        console.warn(`Mapbox DOWN: ${reason}. The other tiers keep serving.`);
      }
    });
    checkMapbox().catch(() => {}); // startup probe (1 tiny request), not awaited

    // NEW: PROVIDER COMPARISON LISTENER. During matching, prints what GOOGLE
    // (the matcher's provider in this version) and MAPBOX (compared only) each
    // say about the scientist, the patient and the hub. See utils/providerCompare.js.
    attachCompareLogger();
    console.log("LABLY provider comparison:", JSON.stringify(compareConfig()));

    // NEW: RESTART RECOVERY. Runs BEFORE we accept traffic.
    try {
      await resumeSearchingJobs(); // jobs stuck in "Searching": resume or end
      await repairStuckScientists(); // scientists stuck busy after a crash
    } catch (e) {
      console.error("startup recovery failed", e);
    }
    // Safety net: re-check for stuck scientists every 60s (30s grace inside).
    setInterval(
      () => repairStuckScientists().catch((e) => console.error("repair", e)),
      60_000
    ).unref();

    server.listen(port, "0.0.0.0", () => {
      console.log(
        `Server running at ${hasCerts ? "https" : "http"}://localhost:${port}`
      );
      if (!hasCerts) {
        console.log("No cert found in /certs - running plain HTTP.");
      }
    });

    // ngrok forwards to this small local HTTP server (see utils/tunnelServer.js).
    if (process.env.NGROK_AUTHTOKEN) startTunnelServer(app);
  })
  .catch((err) => {
    console.log("Error connecting to Database", err?.message || err);
  });

app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use("/login", Loginroute);
app.use("/signup", Signuproute);
app.use("/verifyemailaddress", otp);
app.use("/forgotpassword", Forgotpassword);
app.use("/userlocation", userlocation);
app.use("/registertest", registertest);
app.use("/patientdetails", patientdetails);
// === smart booking ===
app.use("/testrequest", Testrequest);
// NEW: scientist accepts straight from the offer email, no app login needed -
// deliberately mounted with NO auth middleware (the signed token IS the auth).
app.use("/booking-email", scientistEmailAccept);

// Is the ngrok tunnel healthy? (written by scripts/ngrokTunnel.js; also http://127.0.0.1:4041/status)
app.get("/ngrok-status", (_req, res) => {
  res.json(readNgrokState() ?? { status: "not running" });
});
app.use("/scientist-ops", scientistOps); // scientist app: change travel mode (walking / driving)

// === NEW: dev-only seed/test routes. NEVER mounted in production. ===
if (process.env.NODE_ENV !== "production") {
  app.use("/match-dev", devGuard, matchDev);
  console.log("LABLY /match-dev routes enabled (non-production)");
  if (process.env.PORT && !process.env.MATCH_DEV_KEY) {
    console.warn(
      "LABLY WARNING: /match-dev is open to the internet. Set MATCH_DEV_KEY (or NODE_ENV=production) on a public server."
    );
  }
}

app.get("/", (req, res) => {
  res.json({ message: "Api works" });
});
