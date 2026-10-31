# Merge log

Sources: `Lably-ready3.zip` (newer frontend, called **ready3**) and `lably-na-collabo-api-2_1.zip` (newer backend with matching, called **api2**).

## 1. Merge
Base = api2 (its backend is a strict superset of ready3's). ready3's newer frontend was laid over it.
Everything else in api2 was left untouched, including both `.env` files (the frontend `.env` is ready3's, the backend `.env` is api2's).

Taken from ready3 (newer frontend):
- `Frontend-main/src/App.jsx`, `layouts/` (MapLayout), `context/MapContext.jsx` (one persistent map)
- `pages/Home.jsx`, `pages/LocationSearch.jsx`
- `components/Map/` (Map.jsx, Map.css, PuckPin.jsx, RiderMarker.jsx)
- `components/RequestStatusCard/`, `ScientistFoundCard/`, `NoScientistFoundCard/`, `PuckLocationBadge/`, `ChooseTestCard`, `SymptomsCard`, `Footer`
- `hooks/UseReportHeight.js`, `utils/getAccuratePosition.js`, `utils/requestSearch.js`, `icons/FirstAidIcon.jsx`, 4 new SVGs
- `certs/dev-cert.pem`, `certs/dev-key.pem` (newer)
- `Frontend-main/.env`

Kept from api2: whole `lablybackend/`, `START_HERE.md`, `Frontend-main/package.json` + lock (has `socket.io-client`), `hooks/useJobRealtime.js`, `hooks/useCountUp.js`, and the real-booking API calls (`getTestRequest`, `acceptTestRequest`) in `api/testRequestApi.js`.

Not carried over: `Frontend-main/src.zip` (stray archive in ready3).

Wiring (ready3's screens now use api2's real backend instead of the mock placeholders):
- `LocationSearch.jsx`: phase (searching / found / not-found), scientist count, countdown and matched scientist come from the real booking.
- `RequestStatusCard.jsx`: ready3's UI (notes, tests) + api2's real count-up and server countdown; its `.css` regained api2's count animation.
- Removed the dev placeholders `hooks/UseSimulatedRiders.js` and `hooks/UseScientistMatch.js` (they are replaced by the real data).
- `hooks/useJobRealtime.js`: now clears the previous job when a new booking starts.

## 2. Bug: OTP failed but the user was saved and counted as "existing"
Cause: `signup()` created the Supabase user and the MongoDB user first, then sent the OTP. If the email failed, both records stayed, and the next attempt hit "User already exists".
`lablybackend/middlewares/signup.js`:
- If the OTP email fails (or anything fails afterwards), everything THIS request created in MongoDB and Supabase is rolled back.
- "Already exists" now means verified in MongoDB AND present in Supabase. An unverified leftover is resumed: ids are re-linked, the typed password is applied, a new OTP is sent.
- If MongoDB creation fails after Supabase was created, Supabase is rolled back too.
- Old OTP codes for the email are deleted before the new one is saved.
- `sendotp()` returns the real Resend error; outside production the 500 response includes `reason`. Startup warning if `resendkey` is missing.

New `lablybackend/scripts/syncUsers.js` + `npm run sync:users` (in `package.json`): reconciles MongoDB and Supabase by email. Dry run by default; `--apply` fixes ids and creates missing MongoDB users; `--apply --purge-unverified` also deletes never-verified MongoDB orphans. It never deletes anything from Supabase.

## 3. Live scientists on the map
Backend:
- `GET /testrequest/:id/scientists` (owner only): every online, available scientist within the matching cap (3.5 km by default), each with a live distance to the patient, plus `assigned` (the scientist who accepted).
- `PATCH /scientist-ops/location`: the scientist app reports its live position.
Frontend:
- `hooks/useNearbyScientists.js` polls the endpoint every 3 s; `hooks/useLiveRequest.js` combines it with the booking state.
- `Map.jsx`: a rider is drawn only once its position is inside the visible map (above the bottom sheet). While searching the map slowly zooms out, so scientists pop up as the view reaches them. As many as the backend returns.
- `RiderMarker.jsx` + `Map.css`: live distance chip ("850 m", "1.2 km") under each scientist; positions glide between updates.
- `ScientistFoundCard.jsx`: shows the live distance after the match.
- New `utils/formatDistance.js`.

## 4. Round 2
Login (only verified accounts can log in)
- The frontend logs in straight with Supabase (`LoginForm.jsx`), not through the backend `/login`, so the block is enforced at Supabase: new accounts are created UNCONFIRMED (`email_confirm: false` in `signup.js`) and Supabase refuses the password until the OTP step confirms them (`otp.js` already did that).
- `login.js` also returns 403 `EMAIL_NOT_VERIFIED` for unverified accounts. `LoginForm.jsx` shows a clear message.
- An older unverified leftover that was already confirmed is deleted and re-created unconfirmed the next time that email signs up.

No coverage (backend)
- `TestRequest.noCoverage = { reason, missing: ["scientist"|"hub"], message }` is saved together with Status `NoCoverage`. `Waitlist` gets `reason`, `missing`, `confirmedByUser`.
- The backend puts a no-coverage request on the waitlist by itself (also for "no hub", which used to skip it). `POST /testrequest/:id/waitlist` only confirms it.
- Fail fast: no hub, or nobody online + idle in range, ends as NoCoverage immediately instead of after 48 s. `MATCH_EARLY_NO_COVERAGE=false` turns that off.
- Cancel works for Matched requests too (scientist released and told) and is safe to call twice.
- `PATCH /testrequest/:id/details` saves notes and re-resolves changed tests (Pending / Searching / Matched). Create accepts `notes`.
- Speed: patient lookup and hub search run together; hubs are road-checked in parallel.

No coverage (frontend)
- The Oops card names the reason (scientist / hub / scientist and hub) and the waitlist text says "as soon as a scientist is available", "a hub is available", or "a scientist and hub are available". Join the waitlist calls the backend.
- Glitch fix: a new booking cleared the old booking id only after the server answered, so the previous "Oops" showed meanwhile. The id is now cleared at once.
- Back from the search screen and Log out now cancel a running search (a no-coverage request stays on the waitlist). Log out also clears local session data if Supabase is unreachable.
- Notes are saved while typing; removing a test or "Add test" updates the running request instead of starting a second one.

## 5. Round 3: scientists on the map
- The map keeps the original slow, linear zoom-out (same start zoom, same 48 s motion). Only where it ENDS changed: it now ends wide enough to cover the backend's matching distance (`radiusM` from `GET /testrequest/:id/scientists`, i.e. `MATCH_MAX_PATIENT_M`, 3.5 km by default). Until that is known it falls back to the old end zoom (14.3). Code: `zoomToFitRadius` + `searchRadiusM` in `Map.jsx`.
- Scientists were hidden behind a "is it inside the visible area" calculation. That gate is removed: every scientist the backend returns is now rendered as a marker at its own longitude / latitude (the map keeps it anchored while zooming and panning).
- `RiderMarker.jsx` stays hidden while its spot is outside the visible map and pops in the moment the zoom-out reaches it (IntersectionObserver; `Map.css` `.rider-marker` / `.rider-marker--in`).
- `useNearbyScientists.js` now logs a console warning if the request fails (it used to swallow errors).

## 6. Round 4
- No coverage -> waitlist is automatic (backend, done at the moment no coverage is detected). The screen no longer has a "Join the waitlist" button: it says what is missing and that the person is on the waitlist. The `POST /testrequest/:id/waitlist` route and its API call were removed.
- "Add test" keeps the search running (map zoom, scientists, count and countdown continue). Closing the sheet (tap outside / drag down) returns to the running search. The Add-test sheet's button reads "Update my request"; every other flow keeps "Get Tested".
- OTP boxes: pasting (or one-time-code autofill) now spreads the whole code over the six boxes (`VerifyOtp.jsx`).
- Scientist accept: new `POST /scientist-ops/offers/:id/accept` for the app (scientist from the login token). The existing email accept link now shows a confirm page and accepts on POST, so email scanners cannot accept a job by opening the link. App contract in `docs/SCIENTIST_APP.md`.

## 7. Round 5
- 20 s accept grace (`MATCH_GRACE_MS`, default 20000): `TestRequest.matchingState.graceEndsAt = expiresAt + 20 s`. The patient's countdown still ends at 48 s (`expiresAt`), but a notified scientist can accept, and NoCoverage is decided, only at `graceEndsAt`. Files: `models/TestRequest.js`, `services/matchingCascade.js` (start, accept filter, resume after restart).
- `GET /match-dev/seed?...&email=you@gmail.com` seeds scientists with addresses that land in your inbox (`you+seed+sci-near@gmail.com`).
- A warning is logged when `publicBaseUrl` is missing or localhost (`utils/scientistNotify.js`).
- `docs/EMAIL_ACCEPT_DEV.md`: how to accept from a phone / laptop email now (public tunnel + `publicBaseUrl`).

## 8. Round 6: a permanent address
- `index.js`: listens on `PORT` (set by hosts), skips the mkcert dev certificate when `PORT` is set (the host provides HTTPS), locks `/match-dev` behind the optional `MATCH_DEV_KEY` and warns if it is open on a public server.
- New `middlewares/devGuard.js` (the key check), `npm start` script in `lablybackend/package.json`.
- New `docs/DEPLOY.md` (host, env vars, custom domain `api.mylably.com`, test-tool lock).

## 9. Round 7: ngrok in `npm run dev`, count and map in step
ngrok
- Root `package.json`: `npm run dev` now starts BACKEND, FRONTEND and NGROK together (`npm run ngrok` alone also works). New dependency `@ngrok/ngrok` in `lablybackend/package.json`.
- New `lablybackend/scripts/ngrokTunnel.js`: opens the tunnel, HEALTH LISTENER every 15 s through the public path (UP/DOWN + response time in the console, re-opens after 3 failures), status at `http://127.0.0.1:4041/status`.
- New `lablybackend/utils/tunnelServer.js`: 127.0.0.1:3001 HTTP server that ngrok forwards to; exposes only `/booking-email` and `/ngrok-health` (`NGROK_EXPOSE_ALL=true` for everything). Started from `index.js` when `NGROK_AUTHTOKEN` is set; `GET /ngrok-status` added.
- New `lablybackend/utils/publicUrl.js` (`publicBaseUrl` > running tunnel > localhost); `utils/scientistNotify.js` uses it for the accept links. The tunnel state file lives in the OS temp folder so nodemon does not restart the backend.
- `docs/EMAIL_ACCEPT_DEV.md` rewritten for ngrok.
(The "camera follows notified scientists" experiment from this round was reverted in round 8.)

## 10. Round 8
- Map: back to the previous behaviour (slow linear zoom-out to the matching distance, ALL in-range scientists on the map). New rule: the zoom-out STOPS once the farthest scientist is in view (same zoom speed as before, shorter distance). `Map.jsx`, `middlewares/Testrequest.js`, `useNearbyScientists.js`.
- Time for scientists: `MATCH_OFFER_MIN_SECONDS` (default 45): the search stays open until the LAST-stage scientists have had at least that long after their offer (job end = later of 48 s + grace and last stage start + 45 s). The patient's timer still counts 48 s, then shows "Waiting for a reply". `services/matchingCascade.js`, `RequestStatusCard.jsx`.
- Speed: patient->scientist and patient->hub Google calls run together; offers go out while the job update is written (withdrawn if the job was taken in that instant); all offer emails of a stage go out in ONE Resend batch request (`utils/scientistNotify.js`).
- "Nobody accepted" is not "no coverage": if offers were sent but nobody accepted, the result is `noCoverage.reason = "no_acceptance"`, no waitlist, and the screen says to try again in a few minutes with a Try again button. If nobody could even be notified, it is still a waitlist case.
- Found card keeps the previous sample ID / reg no (`LABLY001NG` / `202601`) as placeholders; real `job.sampleId` / `job.regNo` are used as soon as the backend provides them (`useLiveRequest.js`).

## 11. Round 9
- "Try again later" instead of the waitlist whenever scientists exist: nobody accepted, OR scientists are online in range but busy / could not be notified. The waitlist is now ONLY for a missing hub or nobody online in range. The screen also treats an unknown reason as "try again" (never the waitlist text). `services/matchingCascade.js`, `NoScientistFoundCard.jsx`.
- An offer now ALWAYS stays open `MATCH_OFFER_MIN_SECONDS` (45 s) from the moment it is SENT: each notification pushes the closing time later if needed and re-arms the closing timer.

## 12. Round 10: no-coverage cases + reply wait
- `MATCH_REPLY_WAIT_SECONDS` (lablybackend/.env, default 30): once the patient's 48 s countdown ends and the app says "Waiting for a reply", scientists who were notified can still accept for this many more seconds; then the request ends. It replaces `MATCH_GRACE_MS` and `MATCH_OFFER_MIN_SECONDS` (removed). Restart the backend after changing it.
- Bug fixed: when the search timer ran out, `endNoCoverage` filled in `reason` before checking it, so the "offers sent, nobody accepted" branch never ran and those requests landed on the waitlist. Now: offers sent -> `no_acceptance` (try again, no waitlist).
- No scientist passes the matching rules (idle scientists nearby but all too far by road / too slow) and no offer could be sent -> `no_scientist` coverage (waitlist). Routing provider down (unverified) -> try again.
- `NoScientistFoundCard.jsx`: one variant per `coverage.reason` (`no_scientist`, `no_hub`, `no_hub_and_scientist` = waitlist; `no_acceptance` = encouraging message + "Try again" that unlocks after `TRY_AGAIN_DELAY_S` = 10 s). Unknown reasons fall back to "try again".

## Not run
No dependencies are installed here and there is no network, so the app was not started: backend files were syntax-checked and the frontend files bracket-checked. Please run `npm install` in both folders, then test.
