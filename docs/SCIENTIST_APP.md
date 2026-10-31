# Scientist app: how a scientist gets and accepts a job

Both channels use the SAME `acceptBooking()` (services/matchingCascade.js):
first accept wins, and "scientist must be online + idle" is enforced identically. A scientist can accept until the patient's 48 s search ends + `MATCH_REPLY_WAIT_SECONDS` (default 30 s; the "Waiting for a reply" window). The patient's timer stays at 48 s.

## 1. In the app (to build)
Auth: the scientist logs in with Supabase like everyone else; send the access token as `Authorization: Bearer <token>`.

| What | How |
|---|---|
| Who am I | `GET /scientist-ops/me` |
| Go online/offline | (not built yet: set `isOnline` / `isAvailable` on the ScientistOps document) |
| Receive offers | socket.io: connect, emit `join` with `{ scientistId }`, listen for `booking_offer` |
| Accept an offer | `POST /scientist-ops/offers/:testRequestId/accept` (scientist is taken from the token) |
| Report live position (every few seconds) | `PATCH /scientist-ops/location` body `{ latitude, longitude }` |
| Walking / driving | `PATCH /scientist-ops/travel-mode` body `{ travelMode }` |

`booking_offer` payload: `testRequestId, status, stageMin, travelMode, patientLocation, hub, distanceM, distanceMin, collectionToHubM/Min, combinedJourneyM/Min, ...`.
A later `booking_offer` with `withdrawn: true` means the job was taken, canceled or ended: remove it from the screen.
The patient's map reads the positions from `PATCH /scientist-ops/location`.

## 2. By email (works now)
Every notified scientist with an `email` gets the offer email. Its button opens
`GET <publicBaseUrl>/booking-email/accept?token=...` which shows an **Accept** button; pressing it sends
`POST /booking-email/accept`. (The extra step stops email scanners from accepting the job by opening the link.)
`publicBaseUrl` in `lablybackend/.env` must be the PUBLIC address of this backend (not localhost) for links to work on a phone.

## Not done yet (before production)
- The socket `join` event is not authenticated (see the TODO in services/realtime.js).
- `POST /testrequest/:id/accept` (dev) still trusts `scientistId` from the body. Use the route above from the app.
- Going online/offline has no endpoint yet.
