import express from "express";
import { acceptBooking } from "../services/matchingCascade.js";
import { verifyAcceptToken } from "../utils/scientistNotify.js";

/**
 * routes/scientistEmailAccept.js
 * ============================================================
 * Mounted at /booking-email - deliberately has NO verifySupabaseAuth,
 * unlike routes/Testrequest.js. A scientist clicking a link from their
 * inbox doesn't have an app session; the signed token in the link IS
 * their credential (see utils/scientistNotify.js for how it's signed).
 *
 * Reuses the exact same acceptBooking() the app's authenticated
 * POST /testrequest/:id/accept uses - so "first accept wins", the 48s
 * cutoff, and "scientist must be online/idle" are enforced identically
 * whether the scientist accepts from the app or from this email link.
 *
 * Renders a plain HTML page (not JSON) since a human lands here straight
 * from their email client, often on a phone.
 * ============================================================
 */
const router = express.Router();

function page(title, body, ok) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} \u2014 Lably</title>
        <style>
          body{font-family:Arial,sans-serif;max-width:420px;margin:60px auto;padding:0 20px;
               text-align:center;color:#111}
          h1{font-size:22px;color:${ok ? "#0a7a3b" : "#a33"}}
          p{color:#555;line-height:1.5}
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>${body}</p>
      </body>
    </html>
  `;
}

/*
 * Email security scanners and link previewers open every link in a message
 * (GET) before the person does. If GET accepted the job, a scanner could take
 * it for the scientist. So:
 *   GET  /booking-email/accept?token=...  -> shows a page with an "Accept" button
 *   POST /booking-email/accept            -> the button; this is what accepts
 */
function confirmPage(token) {
  const safe = String(token).replace(/"/g, "&quot;");
  return page(
    "Accept this test?",
    `Tap the button to take this job. Whoever accepts first gets it.
     <form method="POST" action="accept" style="margin-top:24px">
       <input type="hidden" name="token" value="${safe}" />
       <button type="submit"
         style="background:#111;color:#fff;padding:12px 22px;border:0;border-radius:8px;
                font-weight:bold;font-size:16px;cursor:pointer">
         Accept this test
       </button>
     </form>`,
    true
  );
}

function badTokenPage(res, e) {
  const expired = e?.name === "TokenExpiredError";
  return res
    .status(410)
    .send(
      page(
        expired ? "Link expired" : "Invalid link",
        expired
          ? "This offer link has expired. If the job is still open you'll be offered it again from the app."
          : "This link isn't valid.",
        false
      )
    );
}

router.get("/accept", (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send(page("Missing link", "This accept link is incomplete.", false));
  }
  try {
    verifyAcceptToken(token); // only to give a clear message early
  } catch (e) {
    return badTokenPage(res, e);
  }
  return res.status(200).send(confirmPage(token));
});

router.post("/accept", express.urlencoded({ extended: false }), async (req, res) => {
  const token = req.body?.token;
  if (!token) {
    return res.status(400).send(page("Missing link", "This accept link is incomplete.", false));
  }
  let jobId, scientistId;
  try {
    ({ jobId, scientistId } = verifyAcceptToken(token));
  } catch (e) {
    return badTokenPage(res, e);
  }
  try {
    const result = await acceptBooking(jobId, scientistId);
    if (!result.ok) {
      // 409 = someone else already accepted, it expired, or you're not online/idle.
      return res.status(result.status).send(page("Not available", result.message, false));
    }
    return res
      .status(200)
      .send(
        page(
          "You're confirmed!",
          "This test is yours. Open the Lably app for the pickup address and patient details.",
          true
        )
      );
  } catch (e) {
    console.error("LABLY booking-email accept error:", e);
    return res
      .status(500)
      .send(page("Something went wrong", "Please try again from the app.", false));
  }
});

export default router;
