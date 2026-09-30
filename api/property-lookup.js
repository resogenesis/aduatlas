// Vercel-style serverless function: looks up public property records for an
// address and returns a normalized snapshot the property tools can render.
//
// Lot size / building size come from county assessor + parcel data, which has
// no free unified national API — so this proxies a property-data provider and
// keeps the API key server-side. Provider is swappable via env.
//
// THIS ENDPOINT SPENDS MONEY, AND IT USED TO DO SO FOR ANYONE WHO ASKED. It had
// no authentication, no tier check, no origin check and no rate limit, while
// proxying a third-party API that bills per call (Rentcast's free tier is about
// 50 lookups a month). A script pointed at it could exhaust the month's quota in
// seconds, or run up a bill, and nothing in the product would notice. Two things
// hold it now:
//
//   1. THE CALLER MUST BE ENTITLED TO IT. The only surface that uses this is the
//      feasibility model on /feasibility, which is gated at requireTier="report",
//      so the server requires the same thing the route does: a verified Supabase
//      access token whose account has a live Platinum-or-higher purchase. An
//      admin also passes, because the console previews the gated tools. An
//      anonymous caller, a caller with a bad token, and a Golden buyer are all
//      refused before the provider is touched.
//   2. A RATE LIMIT PER ACCOUNT AND PER ADDRESS. A legitimate Platinum buyer
//      looking up their own property needs a handful of calls, not hundreds. The
//      counters live in one serverless instance's memory, so this is a speed bump
//      rather than a guarantee: a burst spread across instances gets more through.
//      The entitlement check above is the boundary; this is what stops one paying
//      account from draining the quota by accident or on purpose.
//
// THE CALLER SENDS ITS TOKEN. src/components/tools/BuildableEnvelope.jsx sends
// the signed-in session's access token as "Authorization: Bearer" (fixed at the
// RC1 launch gate, DEF-01; before that every lookup answered 401) and shows an
// honest message for 401, 403, 429 and 501. Failing closed stays the rule for a
// metered endpoint.
//
// Required env (server-side, never VITE_-prefixed):
//   PROPERTY_API_PROVIDER   "rentcast" (default) | future adapters
//   RENTCAST_API_KEY        from https://app.rentcast.io (free tier ~50/mo)
//   SUPABASE_URL            to verify the caller's access token and read the
//   SUPABASE_SERVICE_ROLE_KEY  tier recorded on their account
//
// Query: GET /api/property-lookup?address=<full address>
//        Authorization: Bearer <supabase access token>   (required)
// Returns 200 { lotSize, buildingSize, yearBuilt, propertyType, latitude, longitude, source }
//   - lotSize / buildingSize in square feet (number) or null when unknown
//   - 401 { error: "authentication required" } with no or an unverifiable token
//   - 403 { error: "not-entitled" } for a signed-in caller without Platinum
//   - 429 { error: "too many requests" } when the per-account limit trips
//   - 501 { error: "not-configured" } when no provider key is set (frontend
//     then falls back to example data — the page still renders).
//
// NOTE: verify Rentcast's exact endpoint + field names against their current
// docs before relying in production; the adapter normalizes defensively.

import { service } from "./_admin.js";
import { PLAN_IDS, planRank } from "../src/lib/plans.js";

const PROVIDERS = {
  rentcast: async (address) => {
    const key = process.env.RENTCAST_API_KEY;
    if (!key) return { configured: false };

    const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" } });
    if (!resp.ok) throw new Error(`rentcast ${resp.status}`);

    const json = await resp.json();
    const rec = Array.isArray(json) ? json[0] : json;
    if (!rec) return { configured: true, found: false };

    return {
      configured: true,
      found: true,
      data: {
        lotSize: numberOrNull(rec.lotSize),
        buildingSize: numberOrNull(rec.squareFootage),
        yearBuilt: numberOrNull(rec.yearBuilt),
        propertyType: rec.propertyType || null,
        // Coordinates let the frontend center a satellite map on the parcel.
        latitude: coordOrNull(rec.latitude),
        longitude: coordOrNull(rec.longitude),
        source: "Public records · Rentcast",
      },
    };
  },
};

const numberOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Coordinates can legitimately be 0 or negative (W longitude), so only reject
// non-finite / clearly-out-of-range values.
const coordOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= 180 ? n : null;
};

// ── Who may spend a lookup ───────────────────────────────────────────────────
// The caller's Supabase access token, verified the way api/_admin.js verifies
// one, plus the entitlement recorded on their row. Returns
// { configured, userId, entitled }.
const entitledCaller = async (req) => {
  const svc = service();
  if (!svc) return { configured: false, userId: "", entitled: false };
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return { configured: true, userId: "", entitled: false };

  let authUser = null;
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (!error) authUser = data?.user || null;
  } catch {
    // A Supabase fault refuses the call rather than 500ing the endpoint, and in
    // particular rather than spending a metered lookup on an unverified caller.
    return { configured: true, userId: "", entitled: false };
  }
  if (!authUser?.id) return { configured: true, userId: "", entitled: false };

  try {
    const { data: row } = await svc
      .from("users")
      .select("id, role, paid_at, paid_tier, refunded_at")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    // Admins preview the gated tools from the console, the same allowance
    // src/components/gates/PaidGate.jsx makes on the client.
    if (row?.role === "admin") return { configured: true, userId: row.id || authUser.id, entitled: true };
    const live = Boolean(row?.paid_at) && !row?.refunded_at;
    // Platinum or higher, matched to the route's requireTier="report". An unknown
    // tier ranks 0 and fails closed.
    const entitled = live && planRank(row?.paid_tier) >= planRank(PLAN_IDS.PLATINUM);
    return { configured: true, userId: row?.id || authUser.id, entitled };
  } catch {
    return { configured: true, userId: authUser.id, entitled: false };
  }
};

// ── Abuse guard ──────────────────────────────────────────────────────────────
// Per-instance counters. Deliberately tight, because the quota behind this is
// about 50 calls a month: a homeowner checking their own property needs a few.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_IP = 12;
const hits = new Map();

const rateLimited = (key, max) => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
};

const clientIp = (req) => {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "unknown";
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Identity first: nothing below this line may spend a metered call for a
  // caller we have not established is entitled to one.
  const caller = await entitledCaller(req);
  if (!caller.configured) {
    res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
    return;
  }
  if (!caller.userId) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  if (!caller.entitled) {
    res.status(403).json({ error: "not-entitled" });
    return;
  }

  if (rateLimited(`user:${caller.userId}`, MAX_PER_ACCOUNT) || rateLimited(`ip:${clientIp(req)}`, MAX_PER_IP)) {
    res.status(429).json({ error: "too many requests" });
    return;
  }

  const address = (req.query?.address || "").trim();
  if (!address) {
    res.status(400).json({ error: "address required" });
    return;
  }

  const providerName = (process.env.PROPERTY_API_PROVIDER || "rentcast").toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    res.status(500).json({ error: `unknown provider: ${providerName}` });
    return;
  }

  try {
    const result = await provider(address);
    if (!result.configured) {
      res.status(501).json({ error: "not-configured" });
      return;
    }
    if (!result.found) {
      res.status(404).json({ error: "no-record" });
      return;
    }
    res.status(200).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message || "lookup failed" });
  }
}
