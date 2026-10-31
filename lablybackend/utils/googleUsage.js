import mongoose from "mongoose";
import RouteUsage from "../models/RouteUsage.js";

/**
 * utils/googleUsage.js
 * ============================================================
 * Per-SKU ledger of how much of Google's FREE monthly allowance LABLY has
 * used. routeDistance.js asks this file for permission BEFORE every Google
 * call ("reserve"), so a SKU is never pushed past its internal limit.
 *
 * UNITS
 *   routes_*  : 1 unit = 1 request   (Compute Routes / Directions)
 *   matrix_*  : 1 unit = 1 ELEMENT   (origins x destinations) - this is what
 *               Matrix is billed on, NOT the number of HTTP calls.
 *   httpRequests is tracked next to units so you can see both.
 *
 * LIMITS (read at call time, so .env edits apply after a restart)
 *   Internal limit per SKU = GOOGLE_LIMIT_<SKU> if set, otherwise
 *   floor(free cap x GOOGLE_SAFETY_MARGIN)  (default margin 0.9).
 *   Free caps: Pro 5,000 | Essentials 10,000 | Legacy 10,000 per month.
 *   (Check https://developers.google.com/maps/billing-and-pricing/pricing -
 *   Google changes these.)
 *
 * MONTH
 *   Google resets free usage on the 1st at midnight Pacific time, so the
 *   month key is computed in America/Los_Angeles.
 *
 * STORAGE
 *   MongoDB (models/RouteUsage.js) when connected, so counts survive restarts
 *   and are shared by every backend instance. If MongoDB is not connected the
 *   ledger falls back to process memory (counts reset on restart).
 *   Reservations in MongoDB use an optimistic compare-and-set, so two
 *   instances can never both claim the last free unit.
 * ============================================================
 */

export const SKUS = {
  routes_pro: { kind: "routes", tier: "pro", family: "routesV2", freeCap: 5000, label: "Compute Routes Pro" },
  routes_essentials: { kind: "routes", tier: "essentials", family: "routesV2", freeCap: 10000, label: "Compute Routes Essentials" },
  routes_legacy: { kind: "routes", tier: "legacy", family: "legacy", freeCap: 10000, label: "Directions (Legacy)" },
  matrix_pro: { kind: "matrix", tier: "pro", family: "routesV2", freeCap: 5000, label: "Compute Route Matrix Pro" },
  matrix_essentials: { kind: "matrix", tier: "essentials", family: "routesV2", freeCap: 10000, label: "Compute Route Matrix Essentials" },
  matrix_legacy: { kind: "matrix", tier: "legacy", family: "legacy", freeCap: 10000, label: "Distance Matrix (Legacy)" },
  // Mapbox (3rd tier). Free tier: 100,000 Directions requests / 100,000 Matrix elements per month.
  routes_mapbox: { kind: "routes", tier: "mapbox", family: "mapbox", freeCap: 100000, label: "Mapbox Directions" },
  matrix_mapbox: { kind: "matrix", tier: "mapbox", family: "mapbox", freeCap: 100000, label: "Mapbox Matrix (elements)" },
};

const TIME_ZONE = "America/Los_Angeles";

/** "2026-10" in Pacific time (Google's billing-month boundary). */
export function monthKeyPT(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

/** Internal limit (units) for a SKU. */
export function limitFor(sku) {
  const def = SKUS[sku];
  if (!def) throw new Error(`Unknown SKU ${sku}`);

  const isMapbox = def.family === "mapbox";
  const raw = isMapbox
    ? process.env[`MAPBOX_LIMIT_${def.kind.toUpperCase()}`] // MAPBOX_LIMIT_ROUTES / MAPBOX_LIMIT_MATRIX
    : process.env[`GOOGLE_LIMIT_${sku.toUpperCase()}`];
  if (raw !== undefined && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const m = Number(isMapbox ? process.env.MAPBOX_SAFETY_MARGIN : process.env.GOOGLE_SAFETY_MARGIN);
  const margin = Number.isFinite(m) && m > 0 && m <= 1 ? m : 0.9;
  return Math.floor(def.freeCap * margin);
}

// ---------------------------------------------------------------
// In-memory fallback (also used by the offline tests)
// ---------------------------------------------------------------
const mem = new Map(); // `${month}|${sku}` -> { units, requests }

export function resetMemoryUsage() {
  mem.clear();
}

function useMongo() {
  return mongoose.connection?.readyState === 1;
}

let warnedMongo = false;
function warnMongo(err) {
  if (warnedMongo) return;
  warnedMongo = true;
  console.warn("LABLY google usage ledger: MongoDB failed, using memory for now:", err?.message || err);
}

function grantFor(want, room, partial) {
  if (partial) return Math.max(0, Math.min(want, room));
  return room >= want ? want : 0;
}

function reserveMemory(month, sku, want, { chunk, partial, force }) {
  const key = `${month}|${sku}`;
  const rec = mem.get(key) || { units: 0, requests: 0 };
  const room = force ? want : Math.max(0, limitFor(sku) - rec.units);
  const granted = grantFor(want, room, partial);
  if (!granted) return 0;
  rec.units += granted;
  rec.requests += Math.ceil(granted / chunk);
  mem.set(key, rec);
  return granted;
}

// ---------------------------------------------------------------
// MongoDB ledger
// ---------------------------------------------------------------
const ensured = new Set();

async function ensureDoc(month, sku) {
  const key = `${month}|${sku}`;
  if (ensured.has(key)) return;
  try {
    await RouteUsage.updateOne(
      { month, sku },
      { $setOnInsert: { units: 0, requests: 0 } },
      { upsert: true }
    );
  } catch (err) {
    if (err?.code !== 11000) throw err; // two instances created it at once: fine
  }
  ensured.add(key);
}

async function reserveMongo(month, sku, want, { chunk, partial, force }) {
  await ensureDoc(month, sku);
  const limit = limitFor(sku);

  for (let attempt = 0; attempt < 6; attempt++) {
    const doc = await RouteUsage.findOne({ month, sku }).lean();
    const used = doc?.units ?? 0;
    const room = force ? want : Math.max(0, limit - used);
    const granted = grantFor(want, room, partial);
    if (!granted) return 0;

    // compare-and-set: only succeeds if nobody changed `units` since we read it
    const r = await RouteUsage.updateOne(
      { month, sku, units: used },
      { $inc: { units: granted, requests: Math.ceil(granted / chunk) } }
    );
    if (r.matchedCount === 1) return granted;
  }
  return 0; // heavy contention: stay on the safe side and don't spend
}

// ---------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------
/**
 * Ask for permission to spend `want` units of `sku`.
 * @param {string} sku
 * @param {number} want
 * @param {{ chunk?: number, partial?: boolean, force?: boolean }} [o]
 *   chunk   units per HTTP call (to count httpRequests)
 *   partial true  -> may grant fewer than `want` (Matrix)
 *           false -> all or nothing (Directions)
 *   force   true  -> ignore the internal limit (paid overflow, GOOGLE_ALLOW_PAID)
 * @returns {Promise<number>} units granted (0 = not allowed)
 */
export async function reserve(sku, want, { chunk = 1, partial = false, force = false } = {}) {
  want = Math.floor(want);
  if (!(want > 0)) return 0;
  const month = monthKeyPT();
  const o = { chunk: Math.max(1, chunk), partial, force };

  if (useMongo()) {
    try {
      return await reserveMongo(month, sku, want, o);
    } catch (err) {
      warnMongo(err);
    }
  }
  return reserveMemory(month, sku, want, o);
}

/** Give back a reservation that Google definitely did NOT bill (denied / rejected). */
export async function refund(sku, units, requests = 1) {
  if (!(units > 0)) return;
  const month = monthKeyPT();

  if (useMongo()) {
    try {
      await RouteUsage.updateOne(
        { month, sku },
        { $inc: { units: -units, requests: -requests } }
      );
      return;
    } catch (err) {
      warnMongo(err);
    }
  }
  const rec = mem.get(`${month}|${sku}`);
  if (rec) {
    rec.units = Math.max(0, rec.units - units);
    rec.requests = Math.max(0, rec.requests - requests);
  }
}

/** For GET /match-dev/route-status: every SKU, this month. */
export async function getUsageSnapshot() {
  const month = monthKeyPT();
  const rows = {};
  let store = "memory";

  if (useMongo()) {
    try {
      const docs = await RouteUsage.find({ month }).lean();
      for (const d of docs) rows[d.sku] = { units: d.units, requests: d.requests };
      store = "mongo";
    } catch (err) {
      warnMongo(err);
    }
  }
  if (store === "memory") {
    for (const sku of Object.keys(SKUS)) {
      const rec = mem.get(`${month}|${sku}`);
      if (rec) rows[sku] = { units: rec.units, requests: rec.requests };
    }
  }

  const skus = {};
  for (const [sku, def] of Object.entries(SKUS)) {
    const u = rows[sku] || { units: 0, requests: 0 };
    const limit = limitFor(sku);
    skus[sku] = {
      label: def.label,
      units: u.units,
      httpRequests: u.requests,
      limit,
      freeCap: def.freeCap,
      remainingToLimit: Math.max(0, limit - u.units),
      aboveFreeCap: Math.max(0, u.units - def.freeCap), // > 0 means you are being billed
    };
  }
  return { month, timeZone: TIME_ZONE, store, skus };
}
