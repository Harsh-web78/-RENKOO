# RENKOO — Production Runbook

Verified from repository. No secret values are stored here — set all
secrets in the provider dashboards only.

## 1. Vercel (frontend) environment variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://renkoo-backend.onrender.com/api` (no trailing slash; baked in at build time — redeploy after changing) |

- Framework preset: Next.js. Build command: `npm run build`. Output: default.
- Root directory: `frontend`.

## 2. Render (backend) environment variables

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (enables boot fail-fast on missing `JWT_ACCESS_SECRET`) |
| `PORT` | Set by Render automatically; code defaults to `4000` locally |
| `DATABASE_URL` | Render Postgres connection string + `?sslmode=require` |
| `FRONTEND_URL` | `https://renkoo.online,http://localhost:3000` (CORS allowlist; comma-separate if more origins — keep `http://localhost:3000` so local dev against the prod API keeps working; retain `https://renkoo.vercel.app` as an extra entry only while the old deployment still serves traffic) |
| `APP_PUBLIC_URL` | `https://renkoo.online` (single canonical URL — links inside emails; never a comma list) |
| `JWT_ACCESS_SECRET` | Strong random 256-bit value; boot fails without it in production |
| `TOKEN_ENCRYPTION_KEY` | Strong random value; without it Google OAuth tokens store as plaintext |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | `GOOGLE_REDIRECT_URI=https://renkoo-backend.onrender.com/api/google/callback` (must match Google Cloud console exactly) |
| `RESEND_API_KEY` | Required for email delivery |
| `EMAIL_FROM` | Verified sender, e.g. `RENKOO <hello@yourdomain.com>` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | `RAZORPAY_MODE=test` until live keys are used |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Optional; AI features report `PROVIDER_NOT_CONFIGURED` without them |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Only if the Stripe fallback is used |

`REDIS_URL` is reserved/future — the app does not read it. `JWT_REFRESH_SECRET`
is defined but unused by the code (no token rotation; access tokens live 7d).

## 3. Database migration command

Migration history is a single tested baseline:
`backend/prisma/migrations/20260907000000_baseline/` (47 tables, 12 enums,
generated from the live schema; verified zero-drift on a fresh database).
Superseded per-feature migrations are preserved for audit under
`backend/prisma/migrations_archive/` and are invisible to Prisma.

Run on Render as a release step, before starting the app:

```sh
npx prisma migrate deploy
```

Never run `prisma db push` or `prisma migrate dev` against production.
Never run `migrate reset`. Keep a database backup before every deploy
that includes a migration.

Adopting an existing database (e.g. one originally created with
`db push`): after verifying its schema matches, mark the baseline
applied once — `prisma migrate resolve --applied 20260907000000_baseline`
— then `migrate deploy` becomes a safe no-op. This marks without
running anything, so existing rows are never touched.

## 4. Build command (Render)

```sh
npm install && npx prisma generate && npm run build
```

(Root directory: `backend`. `npm run build` already runs `prisma generate`.)

## 5. Start command (Render)

```sh
node dist/main.js
```

Listens on `$PORT`. No migration runs at boot by design.

## 6. Health URLs

- Readiness (DB + provider presence): `GET https://renkoo-backend.onrender.com/api/health`
  → `200` with `{ok:true}` when healthy, `503` with `{ok:false}` when the DB is down.
- Liveness (process only): `GET https://renkoo-backend.onrender.com/api/health/live`
- Configure the Render health check against `/api/health`.

## 7. Razorpay webhook URL

```
POST https://renkoo-backend.onrender.com/api/billing/razorpay/webhook
```

Signature verified with `RAZORPAY_WEBHOOK_SECRET` (fail-closed), idempotent
via `BillingEvent`. `USD` checkout stays disabled until Razorpay confirms
international-cards activation (`RAZORPAY_INTERNATIONAL_CARDS=AVAILABLE`).

## 8. Resend configuration

- Set `EMAIL_FROM` to a domain-verified sender. Without it, mail falls back
  to Resend's test sender (`onboarding@resend.dev`), which is delivery-limited.
- `APP_PUBLIC_URL=https://renkoo.online` so email links point at production.
- Scheduled report delivery is NOT implemented (`supported:false`); do not
  promise it to customers.

## 9. Google OAuth configuration

- Google Cloud console → Authorized redirect URI:
  `https://renkoo-backend.onrender.com/api/google/callback`
- Scopes: `openid email profile webmasters.readonly analytics.readonly`.
- Google Business Profile management is NOT available (no `business.manage`
  scope) — the product reports it honestly as unavailable.

## 10. Post-deploy smoke test

1. `GET /api/health` → `200`, `ok:true`, `database.status:"UP"`.
2. `GET /api/health/live` → `200`.
3. Load `https://renkoo.online`, log in, open the dashboard.
4. Create a website, run a crawl, check opportunities render.
5. Connect Google (Search Console) and confirm property selection.
6. Trigger a test email (invite/verify) and confirm sender + links.

## 11. Rollback guidance

- Render: roll back to the previous deploy. Vercel: promote the previous
  deployment. Both are code-only rollbacks.
- Database rollbacks are NOT automatic: every migration ships forward-only.
  Restore from the pre-deploy database backup if a migration must be undone.

## 12. Secrets handling

- Secrets live in Vercel/Render dashboards only. Never commit `.env`.
- `NEXT_PUBLIC_*` values ship to the browser — never put secrets there
  (only the public backend base URL).
- Rotate `JWT_ACCESS_SECRET` with care: rotation invalidates all sessions.

## 13. Provider activation checklist

- [ ] Razorpay live keys + webhook secret + webhook URL registered
- [ ] Resend sender domain verified; `EMAIL_FROM` set
- [ ] Google OAuth consent + redirect URI registered; test connect flow
- [ ] `TOKEN_ENCRYPTION_KEY` set before any Google connection in production
- [ ] Baseline migration tested on scratch DB; `migrate deploy` wired as release step
- [ ] `NEXT_PUBLIC_API_URL` set on Vercel before frontend deploy
