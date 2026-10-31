import crypto from "crypto";

/**
 * middlewares/devGuard.js
 * ------------------------------------------------------------
 * Optional lock for the /match-dev test tools when the backend is on a PUBLIC
 * address (a deployed server). Those tools can create jobs, seed scientists and
 * accept as any scientist, so they must not be open to the internet.
 *
 *   MATCH_DEV_KEY not set  -> open, exactly as before (local development)
 *   MATCH_DEV_KEY=secret   -> every /match-dev request needs the key:
 *       open  https://your-backend/match-dev/console?key=secret   once (the browser
 *       then remembers it in a cookie), or send the header  x-dev-key: secret
 *
 * To switch the tools off completely, set NODE_ENV=production.
 */
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export default function devGuard(req, res, next) {
  const key = process.env.MATCH_DEV_KEY;
  if (!key) return next();

  const cookie = /(?:^|;\s*)lably_dev_key=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const given =
    req.query.key || req.get("x-dev-key") || (cookie ? decodeURIComponent(cookie) : "");

  if (!given || !safeEqual(given, key)) {
    return res.status(401).json({ message: "Dev key required" });
  }

  if (req.query.key) {
    res.setHeader(
      "Set-Cookie",
      `lably_dev_key=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Strict; Path=/match-dev`
    );
  }
  return next();
}
