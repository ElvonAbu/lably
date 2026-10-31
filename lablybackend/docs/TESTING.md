# LABLY Phase-1 Matching: Test Plan (run it on the web)

Every test says **Do**, **Expect**, and **Proves**. Do them in order the first time. After that, change code and re-run only the tests you affected.

---

## 0. How to run it

**Terminal 1 (backend)**
```
cd lablybackend
npm run server        # nodemon: restarts by itself whenever you save a .js file
```
**Terminal 2 (frontend, for the real patient flow)**
```
cd Frontend-main
npm install              # socket.io-client is already in package.json
npm run dev
```
**Open the test console:** `http://localhost:3000/match-dev/console`
(use `https://` if you have certs in `/certs`). It needs **no login**. It shows live status, jobs, scientists and the socket events a patient and scientist would receive.

**What you should see in Terminal 1 on boot**
```
Database Connected
LABLY socket.io ready
LABLY matching rules: {...}
Google Connected            <- or "Google DOWN: ..." / "Google bypassed: ..."
```

**Changing code and re-testing:** save the file, nodemon restarts the server, then press **Reset cache / breaker / counters** and **Reset scientists** in the console. Stuck? Press **Seed** again.
Seeded scientists live in Mongo, so they survive restarts. Timers and the cache are in memory and do not.

**Two modes to remember**
| Mode | How to set | Use it for |
|---|---|---|
| `haversine` | console dropdown, or `DISTANCE_MODE=haversine` | deterministic seed counts, no Google cost |
| `auto` | console dropdown | real Google road distances |

---

## A. Boot and the Google listener

| # | Do | Expect | Proves |
|---|---|---|---|
| T1 | Valid `GOOGLE_MAPS_API_KEY`, start server | `Google Connected` right after `Database Connected` | startup probe works (F44) |
| T2 | Put a wrong key, restart | `Google DOWN: every Google API is denied for this key (enable Routes API; check key restrictions)...` | bad key is detected at boot (Routes API 403 and Legacy REQUEST_DENIED are both "denied", see F47) |
| T3 | Remove the key, restart | `Google DOWN: GOOGLE_MAPS_API_KEY is not set...` | missing config is announced |
| T4 | Start with `DISTANCE_MODE=haversine` | `Google bypassed: DISTANCE_MODE=haversine (...)` | test mode is explicit |
| T5 | Server running with a good token: turn your **Wi-Fi off**, create 2-3 jobs in the console | after about 3 failed calls: `LABLY Google circuit OPEN...` then `Google DOWN: ...`. Console header shows **down** and breaker **OPEN** | outage detection (F22, F44) |
| T6 | Turn Wi-Fi **back on** and wait up to about 60 s | `Google RECOVERED (recovered: probe ok)`. Header shows **up**, breaker closed | recovery probe (F44) |
| T7 | Console: press **Check Google now** | the response shows the current state. This spends 1 request of the free allowance | manual probe |

Messages print only when the state **changes**, not on every call.

---

## B. Seeds and the 4-stage count (Haversine mode)

Setup for B and C: console, press **Seed**, set mode to **haversine**, press **Set mode**, and **Reset cache**.

| # | Do | Expect | Proves |
|---|---|---|---|
| T8 | Press **Create test job** (pin = the hub) | Job shows `Searching`, notified **1** immediately (Seed Near). Then **2** at about 12 s, **3** at about 24 s, **4** at about 36 s (Haversine mode needs `ASSUMED_KMH=15`, see FEATURES section 5; with Google on it depends on real road minutes). Time left counts down from 48 | stages, F7 to F10, F16 |
| T9 | Let T8 finish | At about 48 s: `NoCoverage`. `GET /match-dev/waitlist` has one new entry | F9, F32 |
| T10 | Watch Terminal 1 during T8 | One line per stage: `stage 1/4 (<= 2 min, <= 3500 m): idle=4 prefilter=1 notified=1 tooFar=0 tooSlowThisStage=0 unverified=0` | F17 |
| T11 | Check timing with a stopwatch | `NoCoverage` appears at 48 s plus or minus 1 s, never later | hard 48 s (F8, F9) |
| T12 | Console events panel during T8 | `job_update` lines with `ids-leaked=no`, and `booking_offer OFFER` lines | F15, F36 |

---

## C. Accepting (first wins)

Press **Reset scientists** before each test, then **Create test job**.

| # | Do | Expect | Proves |
|---|---|---|---|
| T13 | Within 5 s press **Accept newest job** for **Seed Near** | `200 Booking locked`. Job `Matched`, matched to Seed Near, timers stop (no more stage lines). Seed Near becomes **not idle**, claimed for the job | F28, F29 |
| T14 | Right after T13, press Accept for **Seed Near** again, or another notified scientist | `409 Already taken, expired, or you were not notified` | first accept wins |
| T15 | New job. Within 5 s press Accept for **Seed Edge** (not yet notified) | `409` and Seed Edge stays **idle** | notified-only rule (F29, F30) |
| T16 | New job. Wait 12 s so Seed Mid is notified. Accept as Seed Mid | `200` | accepting in a later stage |
| T17 | After a job ended in `NoCoverage`, try to Accept | `409` | no accept on dead jobs |
| T18 | New job. Accept as Seed Near. Look at the events panel | Other notified scientists get `booking_offer WITHDRAWN (Matched)`. The winner does not | stale offers (F31) |
| T19 | **Create 2 jobs at once**, then **Double-accept test** | Exactly **one** `200` and one `409`. The scientist is claimed by only one job | double-accept gap closed (F28) |
| T20 | New job, wait until after 48 s, but try Accept at about 47 to 48 s | If it lands before `expiresAt` it can win; after it gets `409` | window is hard (F29) |

---

## D. Cancel

| # | Do | Expect | Proves |
|---|---|---|---|
| T21 | Create job, press **Cancel latest job** at about 15 s | `Canceled`. Terminal 1 prints **no more** stage lines for it. Events show `WITHDRAWN (Canceled)` to notified scientists | F33, F31 |
| T22 | Cancel a `Matched` job (real web app: cancel button) | `409 Matched/approved requests can't be canceled here` | rule kept |
| T23 | Cancel the same job twice | second response is a `409` | conditional update |

---

## E. Coverage edge cases

| # | Do | Expect | Proves |
|---|---|---|---|
| T24 | Patch every seed scientist to `isOnline:false` (or `isAvailable:false`) via `PATCH /match-dev/scientists/:id`, create a job | notified stays **0**, job ends `NoCoverage` at 48 s, waitlist entry | F10, F32 |
| T25 | Create a job with **lat 6.50, lng 3.45** (far from the hub) | **Immediately** `NoCoverage`, hub shows "no hub". **No** waitlist entry | F5 (known gap by design) |
| T26 | Deactivate/delete the hub, create a job | same as T25 | no hub in DB |
| T27 | Move one scientist 5 km away (`PATCH` latitude), create a job at the hub | that scientist is never notified (prefilter) | F11 |
| T28 | Put a scientist just inside 2.25 km of the hub but far from the patient (patient at the far side) | notified when the stage's minutes cover them; **never** if beyond 3500 m by road, even if the route is fast. The hub distance of the scientist is irrelevant (the hub is measured from the patient) | stage + distance rules (F12, F13) |

---

## F. Distance: Google, cache, budget, rules

Setup: valid token, mode **auto**, **Reset cache / counters**, **Reset scientists**.

| # | Do | Expect | Proves |
|---|---|---|---|
| T29 | Create a test job at the hub and let it run | Header counters: **1 Directions** (hub), about **7 Matrix requests**, cache hits growing in later stages. Offers say `via google` | Matrix use (F12, F13) |
| T30 | Compare the per-stage counts with T8 | Same or **fewer** scientists per stage than Haversine (roads are longer). Some may join a stage later | road rule (F40) |
| T31 | Create a **second job** right after the first (within 5 min) | Requests barely increase (cache hits jump) | cache (F19) |
| T32 | Set `GOOGLE_CACHE_TTL_MS=10000`, restart, run a job, wait 15 s, run another | Requests increase again, the cache did **not** reuse old pairs | TTL (F20) |
| T33 | Put 30 seed-like scientists inside 3.5 km (add them in Mongo) | Matrix requests per stage = **1 Pro/Essentials call** (up to 100 origins) or 2 Legacy calls (24 + 6); there is no second hub Matrix any more | chunking (F24) |
| T34 | Set `GOOGLE_TIMEOUT_MS=1` (forces slow/failed calls), restart, run a job | Log shows `unverified=N (held back...)`, no one is notified (strict), `NoCoverage` | strict road rule (F41) |
| T35 | Same as T34 with `UNVERIFIED_POLICY=estimate` | Scientists whose straight line x 1.3 is inside the limit **are** notified. Offers say `via haversine` | F42 |
| T36 | Bad key (403) in mode `auto`, strict | `Google DOWN` once, both API families skipped for 10 min (no breaker, nothing counted as used), stage logs show `unverified`, ends `NoCoverage` | F23, F41, F47 |
| T37 | Mode `haversine` with **no token** | Works exactly like T8 | F43 |

---

## G. Stuck-scientist repair

| # | Do | Expect | Proves |
|---|---|---|---|
| T38 | **Simulate crash: first scientist stuck busy**, then **Run stuck-scientist repair** | Response `released: 1`. Scientist is idle again, "claimed for job" empty. Terminal prints `released stuck scientist ...` | F35 |
| T39 | Accept a job normally (Matched), then run repair | `released: 0`. The scientist stays busy (they hold a real job) | no false release |
| T40 | Set a scientist busy **by hand** (`PATCH isAvailable:false`), run repair | `released: 0` | hand-set busy is never touched |
| T41 | Simulate stuck, do **not** run repair, wait up to 60 s | The scientist frees itself (the 60 s interval, 30 s grace) | automatic repair |

---

## H. Restart recovery (change code and save while a job runs)

| # | Do | Expect | Proves |
|---|---|---|---|
| T42 | Create a job, at about 20 s save any backend file (nodemon restarts) | Terminal: `LABLY resumed 1 searching job(s)`. Job continues at the right stage (not from zero) and still ends at the **original** 48 s mark | F34 |
| T43 | Create a job, **stop** the server, wait over 48 s, start it | Terminal shows startup recovery. The job is `NoCoverage` right away | expired job on boot |
| T44 | Same as T42 with the job already `Matched` | Nothing resumes. Job stays `Matched` | no double action |

---

## I. Real web app (patient flow)

| # | Do | Expect | Proves |
|---|---|---|---|
| T45 | Log in on the web app, create a booking whose map pin is at/near **6.4541, 3.3947** (seeded + haversine mode) | Response shows `Status: "Searching"`. `GET /testrequest/:id` shows `notifiedCount` rising | F1, F2, F6 |
| T46 | (Already wired in this zip: `RequestStatusCard` uses `useJobRealtime`) Watch the status card after booking | Card shows "N scientists are viewing your request" counting up, and the timer reaches 0 at the same time the server marks `NoCoverage` | F16, F36 |
| T47 | As a **different** logged-in user call `GET /testrequest/<someone else's id>` | `403 Not allowed` | owner check |
| T48 | Call `/testrequest` with no token | `401` | auth |
| T49 | Cancel from the web UI during a search | Job `Canceled`, console events show the withdrawal | F33 |

---

## J. Environment

| # | Do | Expect | Proves |
|---|---|---|---|
| T50 | Start with `NODE_ENV=production` | `/match-dev/console` and every `/match-dev/*` route return 404 and the "enabled" log line is absent | F38 |
| T51 | Start with the old `.env` order (token set only in `.env`) | `Google Connected` with no import-order tricks | lazy env (F26) |

---

## K. What I could NOT test for you

These need real conditions, so check them yourself:
- A real Google **429** (rate limit). It is simulated in my unit test only.
- Several server instances at once (not supported, see FEATURES.md section 11).
- A phone on your network joining the socket (works only if your firewall allows port 3000).

---

## Quick pass/fail checklist

Copy this and tick it off.

- [ ] T1 Google Connected on boot
- [ ] Offline tests: `node --test tests/googleTiers.test.mjs tests/minuteCascade.test.mjs` (no network, no database)
- [ ] T5/T6 down then recovered messages
- [ ] T8 count 1 to 4, T9 NoCoverage + waitlist, T11 within 48 s
- [ ] T13 to T16 accept rules, T18 withdrawals, T19 no double accept
- [ ] T21 cancel stops everything
- [ ] T24 to T26 coverage gaps
- [ ] T29 to T31 Google + cache, T34 strict, T35 estimate
- [ ] T38 to T40 stuck repair
- [ ] T42 restart resume
- [ ] T45/T46 real web flow
