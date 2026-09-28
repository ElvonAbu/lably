import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
dotenv.config();
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const db_url = process.env.databaseurl;
const app = express();
const port = 3000;
import Loginroute from "./routes/Login.js";
import Signuproute from "./routes/signup.js";
import verifyidentity from "./routes/Identityverification.js";
import Forgotpassword from "./routes/ForgotPassword.js";
import otp from "./routes/otp.js";
import userlocation from "./routes/userlocation.js";
import registertest from "./routes/registertest.js";
// === NEW ===
import patientdetails from "./routes/patientdetails.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, "../certs");
const keyPath = path.join(certDir, "dev-key.pem");
const certPath = path.join(certDir, "dev-cert.pem");
const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

mongoose
  .connect(db_url)
  .then(() => {
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

    server.listen(port, () => {
      console.log(
        `Server running at ${hasCerts ? "https" : "http"}://localhost:${port}`
      );
      if (!hasCerts) {
        console.log(
          "No cert found in /certs — running plain HTTP. See /certs/README.md."
        );
      }
    });
  })
  .catch((err) => {
    console.log("Error connecting to Databse", err?.message || err);
  });

app.use(express.json());

const allowedOrigins = (process.env.corsOrigins || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    // === CHANGED: added PATCH for future use ===
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use("/login", Loginroute);
app.use("/signup", Signuproute);
// app.use("/verify",verifyidentity);
app.use("/verifyemailaddress", otp);
app.use("/forgotpassword", Forgotpassword);
app.use("/userlocation", userlocation);
app.use("/registertest", registertest);
// === NEW: patient profile routes ===
app.use("/patientdetails", patientdetails);

app.get("/", (req, res) => {
  res.json({
    message: "Api works",
  });
});