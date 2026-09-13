import express from "express"
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors"
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
dotenv.config();
import dns from "dns"; // === ADDED: allows Node.js to use reliable DNS servers ===
// === ADDED (Claude): Node.js was getting `querySrv ECONNREFUSED` when
// resolving the MongoDB SRV record. nslookup works correctly with
// Google DNS (8.8.8.8) and Cloudflare DNS (1.1.1.1), so we explicitly
// tell Node.js to use those DNS servers instead of the problematic
// system DNS resolver. ===
dns.setServers(["8.8.8.8", "1.1.1.1"]);
// === END ADDED ===
const db_url=process.env.databaseurl;
const app= express();
const port=3000;
import Loginroute from "./routes/Login.js";
import Signuproute from "./routes/signup.js";
import verifyidentity from "./routes/Identityverification.js";
import Forgotpassword from "./routes/ForgotPassword.js";
import otp from "./routes/otp.js";
import userlocation from "./routes/userlocation.js";

// === CHANGED (Claude): serve HTTPS using the same shared cert as the
// Vite frontend (see /certs/README.md). Once the frontend runs on
// https://<lan-ip>:5173, its fetch() calls to a plain http:// backend get
// blocked by the browser as mixed content — this keeps both sides on
// HTTPS so requests actually go through. Falls back to plain HTTP if the
// certs haven't been generated yet, so `npm run server` still works. ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(__dirname, "../certs");
const keyPath = path.join(certDir, "dev-key.pem");
const certPath = path.join(certDir, "dev-cert.pem");
const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

mongoose.connect(db_url).then(()=>{
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

    server.listen(port,()=>{
        console.log(`Server running at ${hasCerts ? "https" : "http"}://localhost:${port}`);
        if (!hasCerts) {
            console.log("No cert found in /certs — running plain HTTP. See /certs/README.md.");
        }
    });
// === END CHANGED ===
}).catch((err)=>{
    console.log("Error connecting to Databse");
});
app.use(express.json());
// === CHANGED (Claude): origin used to be hardcoded to "http://localhost:5173" only,
// which blocks requests from your phone's browser. Now it reads a list of allowed
// origins from corsOrigins in .env (comma-separated), so both work. ===
const allowedOrigins = (process.env.corsOrigins || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
// === END CHANGED ===


app.use("/login",Loginroute);
app.use("/signup",Signuproute);
// app.use("/verify",verifyidentity);
app.use("/verifyemailaddress",otp);
app.use("/forgotpassword",Forgotpassword);
app.use("/userlocation",userlocation);



app.get("/",(req,res)=>{
   res.json({
    "message":"Api works"
   });

})
