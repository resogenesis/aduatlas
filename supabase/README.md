# ADUAtlas — Supabase backend

Version-controlled schema + setup for the data layer the app and the `api/`
serverless functions depend on.

## What's here

- `migrations/0001_init.sql` — tables, RLS, grants, triggers, RPCs.

## Schema (one-paragraph map)

- **`users`** — one row per buyer/account, **email-first** (Stripe can pay
  before signup). Billing columns (`paid_at`, `paid_tier`, `refunded_at`,
  `stripe_customer_id`, `role`) are **service-role-write only** — RLS + column
  grants make them read-only to the signed-in user, so the anon client can't
  self-grant paid access. App data the user owns: `completed_chapters` (jsonb),
  `builder_packet` (jsonb), `knowledge_result` (jsonb). `auth_user_id` links to
  Supabase Auth and is wired automatically by the `on_auth_user_created` trigger.
- **`leads`** — top-of-funnel email capture (PII). No direct anon access; writes
  go through the `capture_lead()` RPC.
- **`stripe_events`** — webhook idempotency ledger (service-role only).

Entitlement is always derived server-side from `paid_at is not null and
refunded_at is null` (see `users_is_paid`). The `localStorage` flag in
`paymentStore.js` stays a UX hint only.

## Apply the migration

**Option A — Supabase CLI (preferred, keeps history):**
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — one-off:** paste `migrations/0001_init.sql` into
Supabase Studio → SQL editor → Run.

## Environment variables

Frontend (`.env.local`, `VITE_`-prefixed → safe to ship):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Serverless (`api/*`, **never** `VITE_`-prefixed — set in Vercel project env):
```
SUPABASE_URL=                     # can mirror VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=        # service role — bypasses RLS, used by webhook
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ROADMAP=             # $99 course
STRIPE_PRICE_REPORT=              # $399 feasibility report
STRIPE_COUPON_ROADMAP_CREDIT=     # optional: $99-off credit
APP_BASE_URL=                     # e.g. https://aduatlas.com
RENTCAST_API_KEY=                 # property-lookup
RESEND_API_KEY=                   # email
RESEND_FROM=
```

## Hosting note (open item)

The `api/` functions are Vercel-style and have **no runtime on GitHub Pages**
(the current deploy target is static-only). To run the backend in prod, host the
app on Vercel (frontend + functions together) or move the functions to Supabase
Edge Functions. Until then the app falls back to localStorage/mock flows.

## Follow-ups (not in this migration)

- Wire real Supabase Auth into `src/stores/authStore.js` (currently mock) and
  source paid state from `users` instead of the localStorage flag.
- Builder marketplace tables (`builders`, `leads`→builder routing, lead-fee
  Stripe product) — Slice 6.
