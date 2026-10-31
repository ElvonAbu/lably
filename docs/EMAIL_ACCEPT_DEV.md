# Accepting a job from a normal email (phone or laptop) with ngrok

`npm run dev` now starts THREE things: backend, frontend and an ngrok tunnel with a health listener.
The offer email's **Accept** link opens a page on the tunnel's public address, so it works from any phone or laptop.

## One-time setup
1. Create a free ngrok account and copy your **Authtoken** (dashboard -> Your Authtoken).
2. In the ngrok dashboard open **Domains**: the free plan has one fixed domain (like `something.ngrok-free.dev`). Copy it.
3. In `lablybackend/.env` add:

       NGROK_AUTHTOKEN=<your authtoken>
       NGROK_DOMAIN=<your fixed domain>          # keeps the address the same every time
       # optional: NGROK_LOCAL_PORT=3001  NGROK_HEALTH_SECONDS=15

4. `npm run install:all` (installs the ngrok package), then `npm run dev` as always.

No `publicBaseUrl` edit is needed: the backend reads the tunnel address by itself (if `publicBaseUrl` IS set in `.env` it wins).
Without `NGROK_AUTHTOKEN` nothing breaks: the ngrok part prints a hint and stops, backend and frontend keep running.

## Health listener
- The console shows lines starting with `[ngrok]`: `tunnel open: https://...`, `UP ... (143 ms)`, `DOWN ... (reason)`.
- Every 15 s it requests `<public address>/ngrok-health` over the real internet path (internet -> ngrok -> your computer).
  After 3 failed checks in a row it re-opens the tunnel automatically.
- Look at it any time: `http://127.0.0.1:4041/status` or `https://localhost:3000/ngrok-status`
  (`status`: `up` / `down` / `starting`, `url`, `latencyMs`, `checkedAt`, `lastError`).

## What the tunnel exposes
Only the accept page (`/booking-email/...`) and `/ngrok-health`, NOT your whole API. The tunnel talks to a small plain-HTTP
server on `127.0.0.1:3001`. (`NGROK_EXPOSE_ALL=true` forwards the whole app instead, for testing the apps from a phone.)

## Test it
1. Seed scientists that email YOU (offers land in your normal inbox):

       https://localhost:3000/match-dev/seed?lat=<pin lat>&lng=<pin lng>&email=you@gmail.com

   Each gets an address like `you+seed+sci-near@gmail.com` (Gmail, Outlook.com, iCloud, Fastmail, Proton support "+").
2. Start a request in the app. Offer emails arrive as scientists are notified.
3. Open the email on your phone or laptop, tap **Accept this test**, then the button on the page. First accept wins.
   A scientist can still accept for `MATCH_REPLY_WAIT_SECONDS` (default 30) seconds after the patient's 48-second timer ends.

Note: on ngrok's free plan, the first visit from a browser shows an ngrok "You are about to visit..." page with a
**Visit Site** button; tap it once. For real scientists use a deployed backend instead (docs/DEPLOY.md).
