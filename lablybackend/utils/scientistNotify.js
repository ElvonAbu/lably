import { getPublicBaseUrl } from "./publicUrl.js";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import { modeWords } from "./travelMode.js";

/**
 * utils/scientistNotify.js
 * ============================================================
 * Emails a scientist when they're offered a test (mirrors the Resend
 * pattern already used for the signup welcome email in middlewares/otp.js).
 *
 * The email has an "Accept this test" button that works WITHOUT the
 * scientist being logged into the app - it's a signed link
 * (GET /booking-email/accept?token=...), handled in
 * routes/scientistEmailAccept.js, which is mounted with no auth
 * middleware. The link itself IS the credential, the same way an
 * "unsubscribe" or "reset password" email link works.
 *
 * App push notifications will replace/supplement this later; this file
 * only adds the email channel, it doesn't touch realtime.js's socket
 * offer (emitBookingOffer), which still fires first/alongside this.
 * ============================================================
 */

const resend = new Resend(process.env.resendkey);
let warnedLocalBase = false;

// Reuses the same secret already used to sign login JWTs (middlewares/jwtverify.js)
// rather than introducing a second secret to manage.
const TOKEN_SECRET = process.env.jwtkey;

// Generous on purpose: email delivery + a human reading/clicking it can
// easily take longer than the 48s matching window. The link itself can
// stay valid for a while - acceptBooking() still independently enforces
// the REAL 48s cutoff (matchingState.expiresAt) and "already taken" (409),
// so an old link can never double-book or outlive the job's own rules.
const ACCEPT_TOKEN_TTL = "2h";

/** Signed, scientist+job-specific token. Not valid for any other job or scientist. */
export function signAcceptToken(jobId, scientistId) {
  return jwt.sign(
    { jobId: String(jobId), scientistId: String(scientistId), purpose: "booking-accept" },
    TOKEN_SECRET,
    { expiresIn: ACCEPT_TOKEN_TTL }
  );
}

/** Throws on an invalid/expired/wrong-purpose token. Returns { jobId, scientistId }. */
export function verifyAcceptToken(token) {
  const decoded = jwt.verify(token, TOKEN_SECRET);
  if (decoded.purpose !== "booking-accept") throw new Error("Wrong token purpose");
  return { jobId: decoded.jobId, scientistId: decoded.scientistId };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

const fmtKm = (m) => (m != null && Number.isFinite(m) ? `${round1(m / 1000)} km` : null);
const fmtMin = (min) => (min != null && Number.isFinite(min) ? `${round1(min)} min` : null);

/**
 * Builds the offer email (subject + html). Pure function (no network), so it can be tested.
 *
 * Every number is in the scientist's OWN travel mode: a walking scientist reads walking
 * distance and time, a driving scientist reads driving distance and time.
 *
 *   YOUR TRIP TO THE PATIENT     scientist -> patient   (distance + time, in their mode)
 *   PATIENT TO HUB (drop-off)    patient -> hub         (distance + time, in their mode)
 *   COMBINED JOURNEY             scientist -> patient -> hub, added together
 */
export function buildBookingOfferEmail({
  scientist,
  job,
  acceptUrl,
  travelMode,
  distanceM,
  distanceMin,
  stageMin,
  collectionToHubM,
  collectionToHubMin,
  combinedJourneyM,
  combinedJourneyMin,
}) {
  const w = modeWords(travelMode); // { verb: "walk" | "drive", noun, adj }
  const hubName = job.hubSnapshot?.name || "a nearby hub";

  const toPatient = [fmtMin(distanceMin) ?? (stageMin ? `about ${stageMin} min` : null), fmtKm(distanceM)]
    .filter(Boolean)
    .join(" \u00b7 ");
  const toHub = [fmtMin(collectionToHubMin), fmtKm(collectionToHubM)].filter(Boolean).join(" \u00b7 ");
  const combined = [fmtMin(combinedJourneyMin), fmtKm(combinedJourneyM)].filter(Boolean).join(" \u00b7 ");

  const row = (label, value, strong) =>
    value
      ? `<tr>
          <td style="padding:8px 0;color:#555">${label}</td>
          <td style="padding:8px 0;text-align:right;${strong ? "font-weight:bold;font-size:16px" : ""}">${value}</td>
        </tr>`
      : "";

  const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2>New test request nearby</h2>
        <p>
          A patient is ${toPatient ? `<strong>${toPatient}</strong> ${w.verb === "walk" ? "on foot" : "away by road"}` : "close by"}
          and needs a sample collected, to be dropped at <strong>${hubName}</strong>.
          <span style="color:#888">Times and distances are for ${w.noun} (your travel mode).</span>
        </p>

        <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin:14px 0">
          ${row(`You \u2192 patient (${w.noun})`, toPatient)}
          ${row(`Patient \u2192 ${hubName} (${w.noun})`, toHub)}
          ${row("Combined journey", combined, true)}
        </table>
        ${
          combined
            ? `<p style="color:#888;font-size:12px;margin-top:-6px">
                Combined journey = you to the patient, then the patient\u2019s collection point to the hub.
              </p>`
            : ""
        }

        <p>
          This is a first-come offer \u2014 whoever accepts first gets the job.
          The exact address unlocks once you accept.
        </p>
        <p style="margin:28px 0">
          <a href="${acceptUrl}"
             style="background:#111;color:#fff;padding:12px 22px;border-radius:8px;
                    text-decoration:none;font-weight:bold;display:inline-block">
            Accept this test
          </a>
        </p>
        <p style="color:#888;font-size:12px">
          This link is yours alone and expires soon. If you're already offline,
          busy, or someone else accepts first, the link will say so instead.
        </p>
      </div>
    `;

  return { subject: "New test request near you \u2014 Lably", html };
}

/**
 * Fire-and-forget: send the offer email. Callers should NOT await this in
 * the hot matching path - call it and .catch() the error, same as
 * sendWelcomeEmail() in middlewares/otp.js, so a slow/down email provider
 * never delays a scientist's in-app offer.
 */
/** Builds the email for one scientist, or null when they have no email address. */
function buildOfferEmailPayload(args) {
  const { scientist, job } = args;
  if (!scientist?.email) return null; // seeded scientists may have no real inbox
  const token = signAcceptToken(job._id, scientist._id);
  const base = getPublicBaseUrl();
  const acceptUrl = `${base}/booking-email/accept?token=${encodeURIComponent(token)}`;
  if (!warnedLocalBase && /localhost|127\.0\.0\.1/.test(base)) {
    warnedLocalBase = true;
    console.warn(
      `LABLY: accept links in offer emails point at ${base}, which a phone or another computer cannot open. ` +
        "Start the ngrok tunnel (npm run dev) or set publicBaseUrl in lablybackend/.env (see docs/EMAIL_ACCEPT_DEV.md)."
    );
  }
  const { subject, html } = buildBookingOfferEmail({
    ...args,
    travelMode: args.travelMode ?? scientist.travelMode,
    acceptUrl,
  });
  return {
    from: "Lably <Onboarding@mylably.com>",
    to: [scientist.email],
    subject,
    html,
  };
}

export async function sendBookingOfferEmail(args) {
  const payload = buildOfferEmailPayload(args);
  if (!payload) return null;
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    console.error("LABLY booking offer email error:", error);
    return null;
  }
  return data;
}

/**
 * SPEED: all offer emails of one stage go out in ONE Resend request (batch) instead of one
 * request each, so every notified scientist gets theirs at the same moment and nobody waits
 * behind the others. If the batch call fails, each email is sent on its own as a fallback.
 */
export async function sendBookingOfferEmails(argsList) {
  const items = argsList
    .map((args) => ({ args, payload: buildOfferEmailPayload(args) }))
    .filter((x) => x.payload);
  if (items.length === 0) return;
  if (items.length === 1) {
    await sendBookingOfferEmail(items[0].args).catch((err) =>
      console.error("LABLY booking offer email failed:", err)
    );
    return;
  }
  try {
    const { error } = await resend.batch.send(items.map((x) => x.payload));
    if (error) throw new Error(error.message || "batch send failed");
  } catch (err) {
    console.error("LABLY batch offer email failed, sending one by one:", err.message);
    await Promise.allSettled(
      items.map((x) => resend.emails.send(x.payload))
    );
  }
}
