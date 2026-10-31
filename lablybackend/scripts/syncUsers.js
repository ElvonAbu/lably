/**
 * scripts/syncUsers.js
 * ------------------------------------------------------------
 * Reconciles the MongoDB "Users" collection with Supabase Auth.
 *
 *   npm run sync:users                 -> DRY RUN: only reports what it would do
 *   npm run sync:users -- --apply      -> performs the safe fixes
 *   npm run sync:users -- --apply --purge-unverified
 *                                      -> ALSO deletes never-verified, orphaned
 *                                         MongoDB users (leftovers of failed signups)
 *
 * What it does for every user (matched by email):
 *   1. In both, supabaseUserId differs      -> sets MongoDB to Supabase's id.
 *   2. In Supabase only                     -> creates the MongoDB user
 *                                              (emailVerified = has signed in before).
 *   3. In MongoDB only, never verified      -> reported as ORPHAN; deleted only
 *                                              with --purge-unverified.
 *   4. In MongoDB only, verified            -> reported (needs a Supabase account;
 *                                              it is re-created automatically the next
 *                                              time the person logs in or signs up,
 *                                              because that needs their password).
 *   5. Duplicate MongoDB users, same email  -> reported, never auto-deleted.
 *
 * It never deletes anything from Supabase.
 * ------------------------------------------------------------
 */
import "dotenv/config";
import dns from "dns";
import mongoose from "mongoose";
import { createClient } from "@supabase/supabase-js";
import Users from "../models/signup.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge-unverified");

const supabaseAdmin = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const norm = (e) => String(e || "").trim().toLowerCase();

async function listAllSupabaseUsers() {
  const all = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    all.push(...users);
    if (users.length < perPage) return all;
  }
}

async function main() {
  await mongoose.connect(process.env.databaseurl);

  const [mongoUsers, supabaseUsers] = await Promise.all([
    Users.find({}),
    listAllSupabaseUsers(),
  ]);

  const sbByEmail = new Map();
  for (const u of supabaseUsers) if (u.email) sbByEmail.set(norm(u.email), u);

  const mongoByEmail = new Map();
  const duplicates = [];
  for (const u of mongoUsers) {
    const key = norm(u.email);
    if (mongoByEmail.has(key)) duplicates.push(key);
    else mongoByEmail.set(key, u);
  }

  const report = {
    mode: APPLY ? (PURGE ? "apply + purge-unverified" : "apply") : "dry-run",
    mongoUsers: mongoUsers.length,
    supabaseUsers: supabaseUsers.length,
    idsRelinked: 0,
    mongoCreated: 0,
    orphanUnverified: [],
    orphanVerified: [],
    orphansDeleted: 0,
    duplicates: [...new Set(duplicates)],
  };

  for (const [email, m] of mongoByEmail) {
    const sb = sbByEmail.get(email);
    if (sb) {
      if (m.supabaseUserId !== sb.id) {
        report.idsRelinked += 1;
        if (APPLY) {
          m.supabaseUserId = sb.id;
          await m.save();
        }
      }
    } else if (m.emailVerified) {
      report.orphanVerified.push(email);
    } else {
      report.orphanUnverified.push(email);
      if (APPLY && PURGE) {
        await Users.deleteOne({ _id: m._id });
        report.orphansDeleted += 1;
      }
    }
  }

  for (const [email, sb] of sbByEmail) {
    if (mongoByEmail.has(email)) continue;
    report.mongoCreated += 1;
    if (APPLY) {
      await new Users({
        email,
        supabaseUserId: sb.id,
        emailVerified: Boolean(sb.last_sign_in_at),
      }).save();
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to make the changes.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("SYNC FAILED:", err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
