# LABLY Phase-1 Matching: Features Log

How to read this: every feature has an ID (F1, F2, ...). Each one says **what happens**, **where in the code**, and **why it exists**. Small details are included on purpose.

---

## 0. The 30-second picture

1. A patient creates a booking with a map pin.
2. The server picks the nearest **hub** (must be within 2.25 km).
3. The server starts a **48-second search**: 4 stages of 12 seconds. Each stage is a **driving-time band** (2, 4, 7, 10 minutes) and **notifies online, idle scientists** whose verified road route to the patient fits the band **and** the 3.5 km distance cap.
4. The patient UI shows "**N scientists are viewing your request**".
5. The **first scientist to accept wins**. Everyone else's offer is withdrawn.
6. Nobody accepts within 48 s: status becomes **NoCoverage** and the patient goes on the **waitlist**.

Who is in charge: `services/matchingCascade.js`. Everything else starts it, stores its results, measures distance for it, or displays it.

---

## 1. Timeline of one search

| Time | What happens | Time band | Who can be notified |
|---|---|---|---|
| 0 s | Stage 1 | up to 2 min | online + idle scientists whose road route to the patient is <= 2 min **and** <= 3.5 km |
| 12 s | Stage 2 | up to 4 min | **new** scientists <= 4 min and <= 3.5 km (earlier ones are not notified twice) |
| 24 s | Stage 3 | up to 7 min | new scientists <= 7 min and <= 3.5 km |
| 36 s | Stage 4 | up to 10 min | new scientists <= 10 min and <= 3.5 km |
| 48 s | Search ends | | still `Searching`? it becomes `NoCoverage` and the patient joins the waitlist |

A scientist must pass **both** patient-leg limits: 3.8 km away never qualifies even if the route is fast, and 3 km away at 8 minutes first qualifies at stage 4. The sample leg (patient to the assigned hub, **<= 2.25 km by road**) is verified once, when the hub is assigned (F2), not per scientist. The scientist to patient to hub total is shown in the offer (`combinedJourneyM`, `combinedJourneyMin`) for monitoring only and is **not** a rejection rule.

---

## 2. Status machine (`TestRequest.Status`)

| From | To | Triggered by | Code |
|---|---|---|---|
| (new) | `Pending` | booking saved | `newRequestMiddleware` |
| `Pending` | `Searching` | search starts | `startMatchingCascade` |
| `Pending` | `NoCoverage` | no pin or no hub | `startMatchingCascade` / middleware |
| `Searching` | `Matched` | first valid accept | `acceptBooking` |
| `Searching` | `NoCoverage` | 48 s passed | `endNoCoverage` |
| `Pending` / `Searching` / `NoCoverage` | `Canceled` | patient cancels | `cancelMatching` |
| `Matched` | (cannot cancel here) | | `cancelRequest` returns 409 |

Every change above is a **conditional database update** ("only if the status is still X"). That is why a late timer can never overwrite `Matched` or `Canceled` (F14, F32).

---

## 3. Feature list

### A. Creating a request

| ID | Feature | Where | Why / detail |
|---|---|---|---|
| F1 | A new booking is saved as `Pending` | `middlewares/Testrequest.js` | Same as before. Patient must belong to the logged-in account. |
| F2 | Nearest active **hub** is assigned at creation | `assignNearestHub` | Patient (the collection point) must be within the hub's `serviceRadiusKm`, **capped at 2.25 km by verified road** (`MATCH_HUB_MAX_M`). This is the sample leg, Rule B. If several hubs qualify, the closest wins. |
| F3 | Hub candidates are filtered by straight-line distance first | `assignNearestHub` | A hub clearly too far in a straight line is skipped without a Google request. |
| F4 | `hubSnapshot` stores name, coordinates, distance and `distanceSource` | `TestRequest.hubSnapshot` | Snapshot, so later edits to the hub don't change old bookings. `distanceSource` shows whether `"google"` or `"haversine"` produced the number. |
| F5 | No pin or no hub in range means `NoCoverage` immediately | middleware + `startMatchingCascade` | **No waitlist entry yet** for this case (deliberately deferred). |

### B. The search

| ID | Feature | Where | Why / detail |
|---|---|---|---|
| F6 | `Pending` becomes `Searching` atomically, and `matchingState` is initialised | `startMatchingCascade` | Sets stage 0, `currentStageMin` 2, empty notified list, count 0, `startedAt`, `expiresAt = startedAt + 48 s`. A job that was canceled in the meantime is untouched. |
| F7 | Stages: **2, 4, 7, 10 minutes**, hard distance cap **3500 m** | `matchRules()` | Set `MATCH_STAGES_MIN` and `MATCH_MAX_PATIENT_M` in `.env`, no code change. Total search = number of stages x 12 s. |
| F8 | Stage *n* runs at **startedAt + n x 12 s** (absolute time) | `scheduleStage` | Old design waited 12 s after the previous stage *finished*, so slow work pushed everything later. Absolute times can't drift. |
| F9 | A separate **48 s expiry timer** | `scheduleExpiry` | Ends the search at `expiresAt` even if a stage hangs. This is what makes 48 s a hard limit. |
| F10 | Only scientists who are **online and idle**, and not already notified for this job | `notifyNewScientists` query | `isOnline: true`, `isAvailable: true`, `_id` not in `notifiedScientistIds`. No ranking, no skills filter. |
| F11 | **Straight-line prefilter** with 100 m slack | `notifyNewScientists` step 1 | Free. A scientist clearly beyond the 3.5 km cap in a straight line is out. The **100 m slack** keeps scientists whose straight line is just over the cap but whose road could be shorter than the straight line suggests (rare). Only the patient leg: there is no per-scientist hub check. |
| F12 | **Road + time confirmation** with Google Route Matrix (scientist to patient) | step 2 | One request for all prefiltered scientists. It returns distance **and** duration together, so the minute rule adds no extra call. Keeps those with road distance <= 3.5 km **and** minutes <= the stage's band. Scientists who are in range but too slow for this stage are re-checked next stage (cached pairs are free). |
| F13 | **Hub rule is on the sample, not the scientist** | `assignNearestHub` | patient to hub <= 2.25 km by road, checked at creation. A nearby scientist cannot fix an unsuitable hub, and a nearby hub cannot excuse a far scientist. The old per-scientist "scientist to hub" check and its extra Matrix request are gone. If the assigned hub later becomes unavailable, a replacement is **not** re-validated yet (see section 11). |
| F14 | Stage result is written **only if the job is still `Searching`** | `findOneAndUpdate({Status:"Searching"})` | If someone accepted or canceled while we were measuring, nothing is written and **no offers are sent**. |
| F15 | Offers are emitted **after** the database write succeeds | end of `notifyNewScientists` | A scientist is never told about a job whose state didn't save. |
| F16 | `matchingState.notifiedCount` = number of scientists notified so far | same write | Drives the patient text "N scientists are viewing your request". It only goes up during a search. |
| F17 | One log line per stage | `console.log` in `notifyNewScientists` | `idle`, `prefilter`, `notified` (google vs other), `tooFar` (beyond 3.5 km), `tooSlowThisStage`, `unverified`. When a search ends in NoCoverage the terminal also prints the internal reason: `offers_sent_nobody_accepted`, `routing_unverified`, `no_online_idle_scientist_within_range`, `no_scientist_within_distance_and_time_limits`, `no_hub_or_pin`. |

### C. Distance measuring (`utils/routeDistance.js`)

| ID | Feature | Detail |
|---|---|---|
| F18 | **Stage budget: 8 s per stage for Google** (`STAGE_BUDGET_MS`) | Each Google call gets `min(2.5 s, time left in budget)`. If under 300 ms is left, Google is skipped and Haversine is used. Google can never push a stage past its 12 s slot. **A timeout caused by this shortened budget is not counted as a Google failure**, so a healthy-but-slow Google doesn't trip the circuit breaker. A normal 2.5 s timeout still counts. |
| F19 | Cache key is **directional** (from to) and rounded to 5 decimals | About 1 m precision. One-way streets can make A to B differ from B to A, so they are stored separately. |
| F20 | Cache **TTL of 5 minutes** | `GOOGLE_CACHE_TTL_MS`. Keep it short: Google's terms restrict long-term caching of results. Expired entries are deleted when asked for, and in bulk when the cache is full. |
| F21 | Cache cap of **500 entries** | Expired entries are dropped first, then the oldest. Cache is in the server's memory and is empty after a restart. |
| F22 | **Circuit breaker** | After 3 failures in a row (`GOOGLE_BREAKER_FAILURES`), Google is skipped for 60 s (`GOOGLE_BREAKER_OPEN_MS`). It closes by itself. A success resets the count. |
| F23 | **429 handling** | 429 / OVER_QUERY_LIMIT opens the breaker for the server's suggested time (1 to 120 s), otherwise 60 s. A 403 / REQUEST_DENIED (API not enabled, key rejected) is **not** an outage: see F47. "No route found" is treated as an answer, not a failure. |
| F24 | Matrix **chunking** | Routes API Matrix: 100 origins per request. Legacy Distance Matrix: 25 origins per request. Chunks run together. Google has no "minimum 2 elements" rule, so a single origin also uses Matrix (the Mapbox-era Directions special case is gone). |
| F25 | **Haversine fallback**, not cached | `routeDistance` still returns a Haversine number when Google can't answer (no key, breaker open, timeout, error, no time left in budget, every free allowance used with paid overflow off, or a Matrix "no route" cell), marked `source: "haversine"`. Not cached so Google is retried when it recovers. **Whether that number may qualify a scientist is decided by F40, not here.** |
| F26 | Config is read **at call time** | Fixes "dotenv ran too late": reading `process.env` when the file loads gives an empty key if `.env` isn't loaded yet. (In your repo it happened to work because `verifySupabaseAuth.js` calls `dotenv.config()` itself; this makes it independent of file order.) |
| F27 | **Test switch + counters** | `DISTANCE_MODE=auto\|haversine\|google` (`mapbox` is accepted as an old alias), or `POST /match-dev/route-mode`. `GET /match-dev/route-status` shows cache hits, Directions requests, Matrix requests, Matrix elements, failures, Haversine uses and the **monthly usage per SKU**. |

### C2. The road rule (`utils/distancePolicy.js`)

| ID | Feature | Detail |
|---|---|---|
| F40 | **Limits are ROAD limits** | The 3.5 km cap, the minute bands and the 2.25 km hub rule are all verified road limits. Only a Google-produced number (fresh or cached) is "road-verified". A Haversine fallback number is **unverified** and never silently qualifies a scientist. |
| F41 | **`UNVERIFIED_POLICY=strict` (default)** | An unverified candidate is **not eligible this stage** and is **not marked notified**, so the next stage (12 s later) re-checks them and Google gets another try. The stage log shows `unverified=N (held back...)`. **Trade-off:** if Google is down for the whole 48 s (or every free allowance is used up until the 1st, Pacific time, and `GOOGLE_ALLOW_PAID` is off), nobody is notified and the patient ends in NoCoverage. Same rule when choosing a hub: an unverifiable hub is skipped. |
| F42 | **`UNVERIFIED_POLICY=estimate` (optional)** | Unverified straight-line distance is multiplied by `DETOUR_FACTOR` (default 1.3) before comparing to the limit. Keeps matching alive in an outage, but those scientists are only *estimated* inside the road limit. Hub choices made this way are stored with `distanceSource: "estimate"`. |
| F43 | **`DISTANCE_MODE=haversine` is the explicit test exception** | You chose straight-line for that run, so Haversine numbers are used as-is. This is how you test the seed counts without Google. Without it (and without a key) strict mode makes nobody eligible. |

### C3. Google health listener (`utils/routeDistance.js` + `index.js`)

| ID | Feature | Detail |
|---|---|---|
| F44 | **Google health listener** | `googleEvents` emits a `status` event **only when Google's health changes**: `up`, `down` or `off`. `index.js` listens and prints a terminal line like the database one: `Google Connected`, `Google DOWN: <reason>. Rule is strict...`, `Google RECOVERED (...)`, `Google bypassed: DISTANCE_MODE=haversine`. "Down" means the circuit breaker tripped (3 failures in a row, a 429), no key is set, or both API families denied the key. |
| F45 | **Startup probe + recovery probe** | At boot, one tiny request checks Google (not awaited, so it never delays startup; `GOOGLE_STARTUP_PROBE=false` skips it so nodemon restarts don't spend free requests). While the breaker is open no real calls happen, so ONE probe is scheduled right after the pause. Success means `RECOVERED`. Failure re-trips the breaker and schedules the next probe. Probes are real requests: they count in the usage ledger. |
| F46 | **Browser test console** | `GET /match-dev/console` (dev only, no login): buttons for seed, reset, mode, test jobs, accept, cancel, double-accept, simulate stuck, repair, plus live jobs, scientists, Google status, per-SKU usage and socket events. Backed by dev routes `test-job`, `jobs`, `accept`, `cancel-job`, `simulate-stuck`, `google-check` (`mapbox-check` still works as an alias). See `docs/TESTING.md`. |

### C4. Google tiers and the usage ledger (`utils/routeDistance.js` + `utils/googleUsage.js` + `models/RouteUsage.js`)

| ID | Feature | Detail |
|---|---|---|
| F47 | **Tier order** `GOOGLE_TIER_ORDER=pro,essentials,legacy` | Free allowances are spent in that order, separately for Directions (`routes_*`) and Matrix (`matrix_*`). Pro = Routes API `TRAFFIC_AWARE`; Essentials = Routes API `TRAFFIC_UNAWARE`; Legacy = Directions / Distance Matrix (Legacy). Remove `legacy` if your project can't enable it. **Trade-off:** only Pro is traffic-aware, so Essentials and Legacy durations ignore live traffic (distances, which matching uses, are unaffected in practice). |
| F48 | **Per-SKU ledger** | One MongoDB document per (month, SKU): `units` (requests for Routes, **elements** for Matrix) and `requests` (HTTP calls). Reservation is an atomic compare-and-set, so several backend instances can't both take the last free unit. Falls back to process memory if MongoDB is not connected. |
| F49 | **Internal limits** | Per SKU: `GOOGLE_LIMIT_<SKU>` or `GOOGLE_SAFETY_MARGIN` (0.9) x the free cap (Pro 5,000 / Essentials 10,000 / Legacy 10,000). When a SKU reaches its limit the next tier is used. |
| F50 | **Matrix batches are split across tiers** | 10 scientists with 6 free Pro elements left: 6 go to Pro, 4 to the next tier. No free element is wasted. |
| F51 | **Month = Pacific time** | Google resets free usage on the 1st at midnight Pacific. |
| F52 | **API not enabled is not an outage** | A 403 from the Routes API (or REQUEST_DENIED from a Legacy API) means that family is disabled for the project. It is skipped for 10 min (`GOOGLE_FAMILY_SKIP_MS`), the unit is given back (Google did not bill it), and the next tier is tried. No breaker. Timeouts and 5xx keep the unit counted (Google may have billed it). |
| F53 | **Paid overflow is OFF unless you ask** | When every free pool is used up: `GOOGLE_ALLOW_PAID=false` -> Haversine (distancePolicy decides). `true` -> `GOOGLE_OVERFLOW_TIER` (default `essentials`, the cheapest) keeps serving and Google bills it. Usage above the free cap shows as `aboveFreeCap` in `route-status`. |
| F54 | **Travel mode** `GOOGLE_TRAVEL_MODE=DRIVE\|WALK\|BICYCLE` | WALK/BICYCLE skip the Pro tier (Google bills them as Essentials anyway). TWO_WHEELER is not supported (billed as Enterprise, 1,000 free). |
| F55 | **Cache hits cost nothing** | Result `sku` is `"cache"`. Every Google result also carries the `sku` that paid for it. |
| F56 | **Offline test** | `node --test tests/googleTiers.test.mjs`: fake Google, no network, no database. |


### D. Accepting, ending, recovering

| ID | Feature | Where | Detail |
|---|---|---|---|
| F28 | **Atomic scientist claim** | `acceptBooking` step 1 | `isAvailable: true` becomes `false` in one database operation, so one scientist can't hold two jobs. Also stamps `currentJobId` and `claimedAt`. |
| F29 | **Atomic job claim** (first accept wins) | `acceptBooking` step 2 | Job must be `Searching`, **before `expiresAt`**, and the scientist must be in `notifiedScientistIds`. So a late accept (after 48 s but before the timer fired) loses, and nobody can accept a job they weren't offered. |
| F30 | **Release on loss** | `releaseScientist` | If the job claim fails, the scientist is set idle again (only if the claim is still theirs). |
| F31 | **Offers are withdrawn on every ending** | `withdrawOffers` | `{ withdrawn: true, status }` goes to every notified scientist when the job is Matched (to the losers), NoCoverage, or Canceled. Fixes the "stale offer" problem. The scientist app must remove the offer card on this event. |
| F32 | **NoCoverage + waitlist** | `endNoCoverage` | Conditional update (only from `Searching`), then withdraw offers, then a `Waitlist` entry (a waitlist failure is logged, not fatal). |
| F33 | **Cancel** | `cancelMatching` | Stops timers, conditional update to `Canceled`, withdraws offers. Can't cancel `Matched` or `Approved`. |
| F34 | **Restart resume** | `resumeSearchingJobs` | Timers live in memory, so a restart loses them. At startup, jobs still `Searching` are ended (if past `expiresAt`) or resumed at the stage they should be in now. Single server instance only. |
| F35 | **Stuck-scientist repair** | `repairStuckScientists` | See section 4. |
| F36 | **Socket events** | `services/realtime.js` | `job_update` to the patient (rooms `user:<id>`, `job:<id>`), `booking_offer` to the scientist (room `scientist:<id>`). The patient copy **leaves out the list of scientist ids** and only carries the count. |

### E. Dev and wiring

| ID | Feature | Detail |
|---|---|---|
| F37 | **Seed**: `POST /match-dev/seed` | One hub + 4 scientists, one in each stage when `ASSUMED_KMH=15` in Haversine mode (see section 5). See section 5. |
| F38 | `/match-dev/*` is **only mounted when `NODE_ENV !== "production"`** | `seed` deletes data, so it must never exist in production. |
| F39 | `index.js` changes | `import "dotenv/config"` first; Socket.IO attached to the same server; startup recovery (F34, F35) runs **before** the server starts listening; a 60 s repair interval; listens on `0.0.0.0` so a phone on your network can reach it. |

---

## 4. The stuck-scientist repair (F35) in detail

**The gap:** accept does two steps: (1) claim the scientist, (2) claim the job. If the server crashes between them, the scientist is marked busy with no job, forever.

**The fix:**

1. Step 1 now also writes `currentJobId` and `claimedAt` on the scientist.
2. `repairStuckScientists()` looks for scientists who are `isAvailable: false`, have a `currentJobId`, and whose `claimedAt` is older than **30 seconds**.
3. For each, it loads that job. If the job is **not** `Matched`/`Approved` with **this scientist** on it, the scientist is released (idle, markers cleared).
4. The release is conditional ("only if the claim is unchanged"), so it can't undo a fresh claim.

**Why 30 s of grace:** it stops the repair from freeing someone who is in the middle of accepting right now.
**When it runs:** at startup, every 60 s, and on demand via `POST /match-dev/repair-scientists`.
**What it never touches:** scientists you set busy by hand (no `currentJobId`).

**To test it:** accept normally, then in Mongo set the job back to `Searching` with `scientistId: null` (simulating a crash between the two steps). Call `POST /match-dev/repair-scientists` and the scientist becomes idle again.

---

## 5. Seed data (F37)

Book the test request **at the hub: lat 6.4541, lng 3.3947**.

| Scientist | Straight-line to hub | Joins at | `notifiedCount` |
|---|---|---|---|
| Seed Near | about 134 m | 0 s | 1 |
| Seed Mid | about 567 m | 12 s | 2 |
| Seed Far | about 1663 m | 24 s | 3 |
| Seed Edge | about 2190 m | 36 s | 4 |

The old seed's third scientist sat about 2291 m from the hub, over the 2250 m rule, so the count could never pass 2.

In Haversine test mode minutes are estimated as metres / `ASSUMED_KMH` (default 25, so they enter earlier). With `ASSUMED_KMH=15` the seeds enter stages 1, 2, 3, 4 (about 0.5, 2.3, 6.6 and 8.8 min). With Google on, real road minutes decide the stage, and road distances over 3.5 km are excluded.

---

## 6. Endpoints

| Method | Path | Auth | What |
|---|---|---|---|
| POST | `/testrequest` | login | Create booking, assign hub, start search |
| GET | `/testrequest/mine` | login | My bookings |
| GET | `/testrequest/:id` | login (owner) | One booking (poll this) |
| POST | `/testrequest/:id/accept` | login | Body `{ scientistId }`. First valid accept wins |
| PATCH | `/testrequest/:id/cancel` | login (owner) | Cancel |
| GET | `/match-dev/console` | none (dev) | Browser test console |
| POST | `/match-dev/test-job` | none (dev) | Create a job without login (default pin = hub) |
| GET | `/match-dev/jobs` | none (dev) | Latest 10 jobs |
| POST | `/match-dev/accept` | none (dev) | Body `{ jobId, scientistId }` |
| POST | `/match-dev/cancel-job` | none (dev) | Body `{ jobId }` |
| POST | `/match-dev/simulate-stuck` | none (dev) | Fake a crash mid-accept on a scientist |
| POST | `/match-dev/google-check` | none (dev) | Probe Google now (spends 1 request). `/match-dev/mapbox-check` still works as an alias |
| POST | `/match-dev/seed` | none (dev) | Seed hub + scientists |
| POST | `/match-dev/reset` | none (dev) | Seed scientists online + idle again |
| GET | `/match-dev/route-status` | none (dev) | Mode, breaker, API families, cache, counters, monthly usage per SKU |
| POST | `/match-dev/route-mode` | none (dev) | Body `{ mode: "auto" or "haversine" or "google" }` |
| POST | `/match-dev/route-reset` | none (dev) | Clear cache, breaker, API-family skips, in-process counters (not the monthly usage ledger) |
| POST | `/match-dev/repair-scientists` | none (dev) | Run stuck-scientist repair now |
| GET/PATCH | `/match-dev/scientists`, `/hubs`, `/waitlist` | none (dev) | Inspect and nudge test data |

## 7. Socket events

| Event | To | Payload |
|---|---|---|
| `job_update` | patient (`user:<id>`, `job:<id>`) | `{ type, job }` (job without the scientist id list) |
| `booking_offer` | scientist (`scientist:<id>`) | new offer: `{ testRequestId, status:"Searching", stageMin, patientLocation, hub, distanceM, distanceMin, distanceSource, collectionToHubKm, combinedJourneyM, combinedJourneyMin }` (`radiusM` and `distanceToHubM` were removed) |
| `booking_offer` | scientist | withdrawal: `{ testRequestId, status, withdrawn: true }` |

Clients send `join` with `{ userId }`, `{ jobId }` or `{ scientistId }` to enter a room.

## 8. Environment variables (`lablybackend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | (empty) | Server-side key. Without it everything runs on Haversine. Enable the **Routes API** (and optionally the Legacy Directions + Distance Matrix APIs) |
| `GOOGLE_TIER_ORDER` | `pro,essentials,legacy` | Order the free allowances are spent in |
| `GOOGLE_SAFETY_MARGIN` | `0.9` | Switch tier at this fraction of each SKU's free cap |
| `GOOGLE_LIMIT_ROUTES_PRO` ... `GOOGLE_LIMIT_MATRIX_LEGACY` | 90% of the free cap | Exact internal limit per SKU (requests for ROUTES_*, elements for MATRIX_*) |
| `GOOGLE_ALLOW_PAID` | `false` | `true` keeps serving (and paying) after every free pool is used up |
| `GOOGLE_OVERFLOW_TIER` | `essentials` | Tier used for paid overflow |
| `GOOGLE_TRAVEL_MODE` | `DRIVE` | Also `WALK`, `BICYCLE` |
| `GOOGLE_TIMEOUT_MS` | `2500` | Max wait per Google call |
| `GOOGLE_CACHE_TTL_MS` | `300000` | Cache lifetime (5 min) |
| `GOOGLE_BREAKER_FAILURES` | `3` | Failures in a row before pausing Google |
| `GOOGLE_BREAKER_OPEN_MS` | `60000` | How long Google is paused |
| `GOOGLE_FAMILY_SKIP_MS` | `600000` | How long a denied API family is skipped |
| `GOOGLE_STARTUP_PROBE` | `true` | `false` = no 1-request probe at boot |
| `DISTANCE_MODE` | `auto` | `haversine` forces no Google at all (testing; Haversine then counts as the rule, F43) |
| `UNVERIFIED_POLICY` | `strict` | What to do when Google can't verify a road distance: `strict` (not eligible this stage) or `estimate` (straight-line x `DETOUR_FACTOR`) |
| `DETOUR_FACTOR` | `1.3` | Only used by `estimate` |
| `NODE_ENV` | (unset) | `production` turns the `/match-dev` routes off |

## 9. Constants you may want to tune (`matchingCascade.js`)

| Constant | Value | Meaning |
|---|---|---|
| `MATCH_MAX_PATIENT_M` | 3500 | Hard cap: scientist to patient by road |
| `MATCH_STAGES_MIN` | 2,4,7,10 | Driving-time band of each stage (minutes) |
| `MATCH_HUB_MAX_M` | 2250 | Patient to assigned hub by road (sample leg) |
| `ASSUMED_KMH` | 25 | Speed used only to estimate minutes when no Google duration exists (Haversine test mode, `UNVERIFIED_POLICY=estimate`) |
| `STAGE_DURATION_MS` | 12000 | Length of one stage |
| `TOTAL_SEARCH_MS` | 48000 | stages x duration |
| `STAGE_BUDGET_MS` | 8000 | Google time allowed per stage |
| `PREFILTER_SLACK_M` | 100 | Straight-line prefilter slack |
| `STUCK_GRACE_MS` | 30000 | How long before a claimed scientist counts as stuck |

---

## 10. Testing Google vs Haversine

1. `POST /match-dev/seed`
2. **Haversine run:** `POST /match-dev/route-mode` with `{ "mode": "haversine" }`, then create a test request pinned at 6.4541, 3.3947. Server log: `notified=1`, then 2, 3, 4. `GET /match-dev/route-status` shows `matrixRequests: 0`.
3. `POST /match-dev/reset`, then `POST /match-dev/route-reset`.
4. **Google run:** set `GOOGLE_MAPS_API_KEY`, `POST /match-dev/route-mode` with `{ "mode": "auto" }`, create the same request. Compare counts per stage. `route-status` shows Matrix requests and elements, cache hits on later stages, and the monthly usage per SKU.
5. **Failure run (strict rule):** put a wrong key in `.env` and use mode `auto`. Expect "circuit OPEN" once, then every stage logs `unverified=N` and nobody is notified, ending in NoCoverage. That is the strict road rule working, not a bug.
6. **Outage with estimate:** same as 5 with `UNVERIFIED_POLICY=estimate`. Scientists whose straight line x 1.3 is inside the limit are notified.
`GET /match-dev/route-status` also returns the active `rules` (policy, detour factor, mode).

---

## 11. What this does NOT do yet

| Gap | Note |
|---|---|
| Accept trusts `scientistId` from the request body | Needs scientist login. The notified-only check (F29) limits the damage. |
| Socket `join` is unauthenticated | Anyone who knows an id can listen. Needs token check. |
| Offers contain the patient's exact address | Plan: send an approximate area until accept. |
| Email accept link, scientist app | Marked `TODO` in code. Both paths should call the same `acceptBooking`. |
| No decline action | Declined scientists still count in "N viewing". |
| No-hub requests don't reach the waitlist | Deferred by you. |
| Scientists are never freed after finishing a job | Needs a "complete" step. Use `/match-dev/reset` for now. |
| One server instance only | Timers and cache are in memory. Several instances need a job queue. |
| Assigned hub is not re-validated during a search | The hub is verified (active, patient to hub <= 2.25 km by road) once, at creation. If it becomes unavailable mid-search nothing replaces it yet. |
| Sample-handling requirements and test compatibility are not modelled | Only distance and time are checked. Whether a hub can receive a given test, and storage or delivery rules, are outside this code. |
| Combined journey is only displayed | `combinedJourneyM` / `combinedJourneyMin` are in the offer. Add a threshold only after real route data shows the individual limits are not enough. |
| The 3.5 km cap, the minute bands and the hub limit are all road values | A scientist 1.8 km away in a straight line can be 3 km+ by road in Lagos, so fewer people qualify than with straight-line limits. Minute bands use Google's duration: only Pro is traffic-aware, so after the Pro allowance is used up (F47) durations are free-flow and can be optimistic. This is the decided rule (F40). |
| Strict mode + Google outage (or all free allowances used with paid overflow off) = NoCoverage | By design (F41). Switch to `estimate` if you prefer degraded matching over none. |


## Provider comparison (Google vs Mapbox console listener)

| # | Feature | What it does |
|---|---------|--------------|
| F47 | **Comparison listener** | `utils/providerCompare.js`. While matching runs, asks BOTH providers about the same legs (patient -> hub at hub assignment; scientist -> patient and scientist -> hub at every stage and for the scientist who accepts) and emits a `comparison` event. `index.js` calls `attachCompareLogger()` so it prints in the backend terminal: each provider's road metres + minutes, the road point each one snapped the scientist / patient / hub to (and how far it moved them), the difference, and what the matcher used (Google here). Fire-and-forget: never delays or changes a match. |
| F48 | **Probes** | `utils/googleProbe.js` (Routes API computeRoutes, Essentials, through the usage ledger) and `utils/mapboxProbe.js` (Directions v5). One pair each, never throw. |
| F49 | **Comparison switches** | `COMPARE_PROVIDERS` (default on outside production), `COMPARE_RADIUS_M` (6000), `COMPARE_MAX_SCIENTISTS` (10), `MAPBOX_ACCESS_TOKEN`, `MAPBOX_PROFILE`. |
| F50 | **On-demand check** | `POST /match-dev/compare-now` (and a console button) compares the latest job's hub + every seeded scientist without starting a search. |
| F51 | **Traffic awareness** | Mapbox `driving-traffic` profile; Google Routes Pro `TRAFFIC_AWARE` (probe falls back to Essentials, labelled, when Pro is used up). Console lines are tagged `[traffic aware]` / `[traffic unaware]`. `COMPARE_TRAFFIC`, `COMPARE_PRO_RESERVE`, `MAPBOX_PROFILE`. |

## Tiered routing + scientist travel mode

| # | Feature | What it does |
|---|---------|--------------|
| F52 | **Mapbox tier** | `GOOGLE_TIER_ORDER=pro,essentials,mapbox,legacy`. Mapbox Directions / Matrix, `driving-traffic` (plain `driving` when traffic coverage is unavailable), ledger SKUs `routes_mapbox` / `matrix_mapbox` (100,000 free), `MAPBOX_LIMIT_ROUTES/MATRIX`, `MAPBOX_SAFETY_MARGIN`. |
| F53 | **Per-provider breaker + failover** | A failing provider opens only its own breaker; the next tier of the other provider answers. A rejected token / disabled API skips that family (no outage, nothing billed). |
| F54 | **Operation mode** | `ScientistOps.travelMode` = `driving` \| `walking`. Matching measures each scientist's ETA with Google `DRIVE`/`WALK` or Mapbox `driving-traffic`/`walking`, one Matrix call per mode, cache per mode. Same stages, same minute bands, same rules for both. |
| F55 | **Combined journey in the offer + email** | scientist -> patient -> hub in the scientist's mode: `combinedJourneyM/Min`, `collectionToHubM/Min`, `travelMode` in the socket offer and as rows in the offer email (`buildBookingOfferEmail`). |
| F56 | **Scientist mode endpoint** | `PATCH /scientist-ops/travel-mode`, `GET /scientist-ops/me` (Supabase auth). |
| F57 | **Console mode controls** | Mode dropdown per scientist, add driving / walking scientist, seeded `Seed Walker`, `PATCH /match-dev/scientists/:id {travelMode}`, Mapbox status + tier order on the status line. |
| F58 | **Walking estimates** | `ASSUMED_WALK_KMH` (5) is used only when a real walking duration is unavailable (haversine test mode / `UNVERIFIED_POLICY=estimate`). |
| F59 | **Extended walking rule (same cascade)** | `WALK_COMBINED_MAX_MIN` (51): a walking scientist also qualifies when walking-to-patient + walking patient->hub <= 51 min, evaluated next to the minute bands from `WALK_EXTENDED_FROM_STAGE` (default: last stage). Distance cap (3.5 km) and hub rule (2.25 km) stay independent. De-duplicated through `notifiedScientistIds`; offers carry `qualifiedBy`. Job-trace shows which rule qualifies each scientist. |
