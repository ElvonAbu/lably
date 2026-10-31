import { EventEmitter } from "node:events";
import { distanceM as haversineM } from "./geo.js";
import { probeGoogle } from "./googleProbe.js";
import { probeMapbox, mapboxToken } from "./mapboxProbe.js";
import { normalizeTravelMode } from "./travelMode.js";

/**
 * utils/providerCompare.js
 * ============================================================
 * SIDE-BY-SIDE: what does GOOGLE say and what does MAPBOX say?
 *
 * While matching runs, the matcher keeps using its ONE primary provider. In
 * parallel (fire-and-forget, it never delays or changes a match) this file asks
 * BOTH providers about the same legs and announces the answers on an event
 * emitter. index.js attaches a console listener, so in the backend terminal you
 * can SEE, for every match step:
 *
 *   - where each provider placed the scientist / the patient / the hub
 *     (the road point it snapped our coordinates to, and how far it moved them)
 *   - road distance + driving time from each provider
 *   - the difference between the two, and what the matcher actually used
 *
 * LEGS COMPARED
 *   patient   -> hub        when the hub is assigned (the 2.25 km rule)
 *   scientist -> patient    every stage (the 3.5 km / minute-band rule)
 *   scientist -> hub        every stage (information only)
 *   ... and again for the scientist who ACCEPTS.
 *
 * EVENTS (compareEvents)
 *   "comparison"  one payload per match step (see runComparison)
 *
 * ENV
 *   COMPARE_PROVIDERS=true|false     default: true outside production, false in production
 *   COMPARE_RADIUS_M=6000            idle scientists within this straight-line distance
 *                                    of the patient are compared (so a scientist who
 *                                    is "too far" is still shown)
 *   COMPARE_MAX_SCIENTISTS=10        hard cap per stage (each scientist = 2 legs x 2 providers)
 *   COMPARE_TRAFFIC=true             Google probe uses Routes Pro TRAFFIC_AWARE (false = no traffic);
 *                                    Mapbox follows MAPBOX_PROFILE (driving-traffic = traffic)
 *
 * COST: every compared leg is one Mapbox Directions request and one Google
 * Routes (Essentials) request. Google goes through the usage ledger, so it can
 * never exceed its internal free-allowance limit.
 * ============================================================
 */

export const compareEvents = new EventEmitter();

export function compareConfig() {
  const flag = String(process.env.COMPARE_PROVIDERS ?? "").toLowerCase();
  const enabled = flag ? flag === "true" : process.env.NODE_ENV !== "production";
  const num = (name, def) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    enabled,
    radiusM: num("COMPARE_RADIUS_M", 6000),
    maxScientists: num("COMPARE_MAX_SCIENTISTS", 10),
    googleKeySet: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    mapboxTokenSet: Boolean(mapboxToken()),
  };
}

export function compareEnabled() {
  return compareConfig().enabled;
}

const pt = (p) => ({ lat: Number(p.lat), lng: Number(p.lng) });

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Ask BOTH providers about the same legs, then emit ONE "comparison" event.
 * Never throws, never blocks the caller (call it without await).
 *
 * @param {object} o
 * @param {string|null} o.jobId
 * @param {"hub_assignment"|"stage"|"accepted"|"manual"} o.trigger
 * @param {number} [o.stage]      1-based stage number
 * @param {number} [o.stageMin]   the stage's driving-time band
 * @param {"google"|"mapbox"} o.primary   which provider the matcher is using
 * @param {{lat:number,lng:number}} o.patient
 * @param {{name?:string,lat:number,lng:number}|null} o.hub
 * @param {{id:any,name?:string,lat:number,lng:number,used?:{toPatient?:object,toHub?:object}}[]} [o.scientists]
 * @param {{source?:string,meters?:number,minutes?:number}} [o.usedPatientToHub] what the matcher used for patient -> hub
 */
export async function runComparison(o) {
  try {
    const cfg = compareConfig();
    if (!cfg.enabled) return null;

    const patient = pt(o.patient);
    const hub = o.hub ? { name: o.hub.name, ...pt(o.hub) } : null;

    // legs to ask about
    const legs = [];
    if (hub && (o.trigger === "hub_assignment" || o.trigger === "manual")) {
      legs.push({ kind: "patient_to_hub", mode: "driving", subject: null, from: patient, to: hub, used: o.usedPatientToHub });
    }
    const people = (o.scientists || []).slice(0, cfg.maxScientists);
    for (const s of people) {
      const from = pt(s);
      const mode = normalizeTravelMode(s.travelMode); // each scientist is compared in THEIR mode
      const subject = { id: String(s.id), name: s.name, travelMode: mode, ...from };
      legs.push({ kind: "scientist_to_patient", mode, subject, from, to: patient, used: s.used?.toPatient });
      if (hub) legs.push({ kind: "scientist_to_hub", mode, subject, from, to: hub, used: s.used?.toHub });
    }
    if (!legs.length) return null;

    const t0 = Date.now();
    const answered = await inBatches(legs, 6, async (leg) => {
      const [google, mapbox] = await Promise.all([
        probeGoogle(leg.from, leg.to, { mode: leg.mode }),
        probeMapbox(leg.from, leg.to, { mode: leg.mode }),
      ]);
      return { ...leg, straightM: Math.round(haversineM(leg.from, leg.to)), google, mapbox };
    });

    const payload = {
      at: new Date().toISOString(),
      jobId: o.jobId ? String(o.jobId) : null,
      trigger: o.trigger,
      stage: o.stage ?? null,
      stageMin: o.stageMin ?? null,
      primary: o.primary,
      patient,
      hub,
      legs: answered,
      tookMs: Date.now() - t0,
      skippedScientists: Math.max(0, (o.scientists || []).length - people.length),
    };
    compareEvents.emit("comparison", payload);
    return payload;
  } catch (err) {
    console.warn("LABLY provider comparison failed:", err?.message || err);
    return null;
  }
}

// ---------------------------------------------------------------
// CONSOLE LISTENER
// ---------------------------------------------------------------
const f = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "?");
const ll = (p) => (p ? `${f(p.lat, 6)}, ${f(p.lng, 6)}` : "?");
const mins = (s) => (Number.isFinite(s) ? `${f(s / 60, 1)} min` : "? min");
const snapTxt = (p) => (p ? `${ll(p)} (moved ${p.movedM} m)` : "n/a");

const KIND = {
  patient_to_hub: "PATIENT -> HUB",
  scientist_to_patient: "SCIENTIST -> PATIENT",
  scientist_to_hub: "SCIENTIST -> HUB",
};

/** Traffic label for what the MATCHER used (the router tags each answer). */
function usedTraffic(used) {
  if (used.source === "haversine") return "  [straight line, no traffic]";
  if (used.sku === "cache") return `  [cached, traffic ${used.traffic ?? "?"}]`;
  const t = used.traffic;
  if (t === "aware") return "  [traffic aware]";
  if (t === "n/a") return "  [walking, no traffic]";
  return "  [traffic UNAWARE]";
}

function providerLines(name, r, fromLabel, toLabel) {
  const tag = name.padEnd(6);
  if (!r.ok) return [`    ${tag} FAILED: ${r.error} (${r.ms} ms)`];
  return [
    `    ${tag} road ${f(r.meters)} m, ${mins(r.seconds)}   [traffic ${r.traffic ?? "?"}${r.fellBackFrom ? `, ${r.fellBackFrom} unavailable here -> plain driving` : ""}]  (${r.ms} ms)`,
    `           ${fromLabel} placed at ${snapTxt(r.from)}`,
    `           ${toLabel} placed at ${snapTxt(r.to)}`,
  ];
}

/** Pretty-prints a "comparison" payload. Exported so it can be reused or tested. */
export function formatComparison(p) {
  const head =
    p.trigger === "hub_assignment"
      ? "HUB ASSIGNMENT"
      : p.trigger === "accepted"
        ? "SCIENTIST ACCEPTED"
        : p.trigger === "manual"
          ? "MANUAL CHECK"
          : `STAGE ${p.stage} (<= ${p.stageMin} min)`;
  const lines = [
    "",
    `LABLY COMPARE ${p.jobId ? `job ${p.jobId} ` : ""}${head}  [matcher: ${p.primary === "tiered" ? "Google Pro > Essentials > Mapbox > Legacy" : p.primary}]  (took ${p.tookMs} ms)`,
    `  patient (collection point) input ${ll(p.patient)}`,
    p.hub ? `  hub "${p.hub.name ?? "hub"}" input ${ll(p.hub)}` : "  hub: none",
  ];

  for (const leg of p.legs) {
    const who = leg.subject ? `"${leg.subject.name ?? leg.subject.id}" ` : "";
    lines.push("");
    lines.push(`  ${KIND[leg.kind]}  ${who}[${leg.mode}] straight-line ${leg.straightM} m`);
    if (leg.subject) lines.push(`    scientist input ${ll(leg.subject)}`);

    const fromLabel = leg.kind === "patient_to_hub" ? "patient" : "scientist";
    const toLabel = leg.kind === "scientist_to_patient" ? "patient" : "hub";
    lines.push(...providerLines("google", leg.google, fromLabel, toLabel));
    lines.push(...providerLines("mapbox", leg.mapbox, fromLabel, toLabel));

    if (leg.google.ok && leg.mapbox.ok) {
      const dm = leg.mapbox.meters - leg.google.meters;
      const ds = leg.mapbox.seconds - leg.google.seconds;
      const pct = leg.google.meters ? (dm / leg.google.meters) * 100 : 0;
      lines.push(
        `    DIFF   mapbox - google = ${dm >= 0 ? "+" : ""}${f(dm)} m (${pct >= 0 ? "+" : ""}${f(pct, 1)}%), ` +
          `${ds >= 0 ? "+" : ""}${f(ds / 60, 1)} min`
      );
    }
    if (leg.used && Number.isFinite(leg.used.meters)) {
      lines.push(
        `    MATCHER USED ${leg.used.source}: ${f(leg.used.meters)} m` +
          (Number.isFinite(leg.used.minutes) ? `, ${f(leg.used.minutes, 1)} min` : "") +
          usedTraffic(leg.used)
      );
    }
  }
  if (p.skippedScientists) lines.push(`\n  (${p.skippedScientists} more scientist(s) not compared: COMPARE_MAX_SCIENTISTS)`);
  return lines.join("\n");
}

let attached = false;
/** Registers the console listener (idempotent). index.js calls this once at startup. */
export function attachCompareLogger(emitter = compareEvents, log = console.log) {
  if (attached && emitter === compareEvents) return;
  if (emitter === compareEvents) attached = true;
  emitter.on("comparison", (p) => log(formatComparison(p)));
}
