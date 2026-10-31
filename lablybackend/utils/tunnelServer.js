import http from "http";
import express from "express";
import scientistEmailAccept from "../routes/scientistEmailAccept.js";

/**
 * utils/tunnelServer.js
 * ------------------------------------------------------------
 * A small PLAIN-HTTP server on 127.0.0.1 that ngrok forwards to. The public
 * internet reaches ONLY what is needed for scientists to accept a job from
 * their email, not your whole API:
 *
 *   GET  /ngrok-health            -> { ok: true }   (the health listener pings this)
 *   GET/POST /booking-email/...   -> the accept page
 *
 * Set NGROK_EXPOSE_ALL=true to forward the WHOLE app instead (for testing the
 * apps from a phone). Plain HTTP on localhost also avoids ngrok having to trust
 * the local mkcert certificate.
 */
export function startTunnelServer(fullApp) {
  const port = Number(process.env.NGROK_LOCAL_PORT) || 3001;

  let app;
  if (String(process.env.NGROK_EXPOSE_ALL).toLowerCase() === "true") {
    app = fullApp;
  } else {
    app = express();
    app.get("/ngrok-health", (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));
    app.use("/booking-email", scientistEmailAccept);
    app.use((_req, res) => res.status(404).send("Not found"));
  }

  const server = http.createServer(app);
  server.on("error", (err) => {
    console.error(`LABLY tunnel server could not start on 127.0.0.1:${port}:`, err.message);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`LABLY tunnel server (for ngrok) on http://127.0.0.1:${port}`);
  });
  return server;
}
