# LABLY - one version: tiered routing + walking / driving scientists

Backend = `lablybackend/`, frontend = `Frontend-main/` (unchanged).

## Routing tiers (spent in this order, free allowances first)
`GOOGLE_TIER_ORDER=pro,essentials,mapbox,legacy`

| # | Tier | What it is | Traffic |
|---|------|-----------|---------|
| 1 | Google **Pro** | Routes API, `TRAFFIC_AWARE` (5,000 free / month) | yes (driving only) |
| 2 | Google **Essentials** | Routes API, `TRAFFIC_UNAWARE` (10,000 free) | no |
| 3 | **Mapbox** | Directions + Matrix, `driving-traffic` (100,000 free) | yes where Mapbox has coverage; **plain driving where it does not (Nigeria)** |
| 4 | Google **Legacy** | Directions / Distance Matrix (10,000 free) | no |

- Every call reserves a unit in the usage ledger first; at the internal limit (90% of the free cap) the next tier takes over.
- **Failover:** if a provider *fails* (timeout, 5xx, 429), the next tier of the *other* provider answers. Each provider has its own circuit breaker.
- If Mapbox rejects `driving-traffic` for a place, it retries with `driving` and the answer is tagged `traffic: unaware`.
- Walking: Google `WALK` (Essentials/Legacy, no Pro) and Mapbox `walking`. Walking has no traffic.

## Operation mode: walking or driving scientist
Each scientist has `travelMode: "driving" | "walking"` (default `driving`; old records count as driving).
A walking scientist is matched and notified by WALKING distance and walking time; a driving scientist by DRIVING distance and driving time.

### One continuous cascade (two ways to qualify, evaluated together)
Stages open every 12 s (2 -> 4 -> 7 -> 10 min, 48 s total). In every stage, each online + idle scientist who has not
been offered this request yet is tested ONCE:

| Test | Applies to | Rule |
|------|-----------|------|
| Distance cap | everyone, own mode | scientist -> patient <= **3.5 km** |
| **Minute band** | everyone, own mode | travel time to the patient <= this stage's minutes (0-2, >2-4, >4-7, >7-10) |
| **Extended walking rule** | walking scientists only | walking to patient + walking patient -> hub <= **51 min** |
| Hub rule | the request (checked at hub assignment) | patient collection point -> hub <= **2.25 km** |

A scientist qualifies if the distance cap holds AND (the minute band holds OR, for a walker, the extended rule holds).
The distance cap, the hub rule and the 51-minute rule are evaluated independently.

- **No second phase.** The extended rule is part of the same loop; it does not wait for the minute bands to fail.
- **No duplicates.** `matchingState.notifiedScientistIds` is the record: whoever was offered (by band or by the extended
  rule) is never offered again, in this or any later stage.
- **No priority for either mode.** Everyone who qualifies in a stage is notified at the same instant.
- **When the extended rule starts.** A long-walk scientist (e.g. 14 min to the patient) is slower than every band, so they
  have to join at some stage. By default the extended rule is applied from the **last** stage (`WALK_EXTENDED_FROM_STAGE`
  unset = 4), so they never jump ahead of drivers or walkers in the earlier bands. Set `WALK_EXTENDED_FROM_STAGE=1` to apply
  it from the first stage instead. `WALK_COMBINED_MAX_MIN` (51) is configurable too.
- A walker eligible by a minute band is offered by the band; the extended rule never re-offers them.
- Offers carry `qualifiedBy: "band" | "extended"`.

Example: 14 min walk to the patient + 32 min walk to the hub = 46 min <= 51, within 3.5 km -> qualifies (stage 4 by default).

Matching principles
1. Walking and driving scientists share the **same** matching system (one cascade).
2. Each scientist's ETA is calculated in **their declared travel mode**.
3. Scientists in the same minute band get **equal opportunity**.
4. The cascade **expands** (2 -> 4 -> 7 -> 10 min) when the current stage does not secure an assignment.
5. The selected hub must be **within 2.25 km** of the patient's collection point.

### Combined journey
Scientist -> patient -> hub, measured in the scientist's mode. It is in the in-app offer (`combinedJourneyM`, `combinedJourneyMin`, `collectionToHubM/Min`, `travelMode`) **and in the offer email**
(rows: You -> patient, Patient -> hub, **Combined journey**). It is information only, never a rejection rule.
After acceptance it is also saved on the job (`scientistSnapshot.combinedJourneyKm/Min`, `travelMode`, `etaToPatientMin`).

### Changing the mode
- **Scientist app (when it exists):** `PATCH /scientist-ops/travel-mode` body `{ "travelMode": "walking" }` (Supabase auth, same as the patient routes). `GET /scientist-ops/me` returns the current mode.
  It takes effect from the next matching stage (matching reads it from the database each time).
- **Console:** http://localhost:3000/match-dev/console
  - section 3 has a mode dropdown on every scientist row, plus **Add DRIVING scientist** / **Add WALKING scientist** buttons and a mode selector on the custom-scientist form.
  - **Seed hub + 5 scientists** now includes `Seed Walker` (walking).

## Setup
```
cd lablybackend && npm install     # fill MAPBOX_ACCESS_TOKEN in .env (GOOGLE_MAPS_API_KEY is already there)
npm run server
```
New `.env` keys: `MAPBOX_ACCESS_TOKEN`, `MAPBOX_PROFILE=driving-traffic`, `MAPBOX_SAFETY_MARGIN`, `ASSUMED_WALK_KMH=5`, `COMPARE_*`.
Startup prints `Google Connected` and `Mapbox Connected` (or why not).

## Console comparison (Google vs Mapbox, beside matching)
Unchanged and mode-aware: every scientist leg is compared in **their** mode, e.g. `SCIENTIST -> PATIENT "Seed Walker" [walking]`, and the "MATCHER USED" line shows which tier actually answered and whether traffic was used.

## Tests (offline, no network)
`node --test tests/` -> googleTiers, minuteCascade, providerCompare, travelMode (includes the extended walking rule).
