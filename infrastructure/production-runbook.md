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
npm install && npx playwright install --with-deps chromium && npx prisma generate && npm run build
```

(Root directory: `backend`. `npm run build` already runs `prisma generate`.)

Why the Playwright step is load-bearing:

- The website crawler and competitor crawler launch
  `chromium.launch({ headless: true })`, which requires the
  `chromium_headless_shell-<rev>/` binary from the EXACT installed
  Playwright version (today: Playwright 1.62.1 → revision 1234).
- Without it every crawl fails with
  `browserType.launch: Executable doesn't exist at
  /opt/render/.cache/ms-playwright/chromium_headless_shell-1234/...`.
- `npm install` also runs the repo `postinstall` script
  (`npx playwright install chromium`), which covers the binary on
  any host — but on Render the `--with-deps` flag in the build
  command is additionally required so the OS shared libraries
  Chromium needs (libnss3, libatk, libdrm, …) are present.
  The browsers persist on the same disk the service boots from,
  so no runtime install or `PLAYWRIGHT_BROWSERS_PATH` override is
  needed (default `~/.cache/ms-playwright` resolves to
  `/opt/render/.cache/ms-playwright`).
- After changing the `playwright` version in
  `backend/package.json`, redeploy so the matching browser
  revision is installed; a version/binary mismatch fails the
  same way.
- Verify in a Render shell AFTER deploy:
  `node scripts/verify-playwright.mjs https://example.com`
  (exit 0, prints executable path + 200 + title). A crawl that
  still fails surfaces an actionable message naming the missing
  binary instead of a generic error.

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
- [ ] At least one of `OPENAI_API_KEY` / `GEMINI_API_KEY` set for the public snapshot (see §14)
- [ ] One controlled production snapshot run against `example.com` verified after deploy

## 14. Public AI Visibility Snapshot (`/snapshot`)

Anonymous marketing endpoint (`POST /snapshot/ai-visibility`, cache read
`GET /snapshot/ai-visibility?domain=`). No auth, no workspace I/O, no
billing, no Prisma writes.

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | (unset) | At least one required; without either the endpoint returns 503 honestly |
| `OPENAI_MODEL` / `GEMINI_MODEL` | `gpt-4o-mini` / `gemini-3.6-flash` | Existing provider defaults |
| `SNAPSHOT_MAX_CALLS_PER_RUN` | `6` | Hard cap, never raised above 6 in code |
| `SNAPSHOT_DOMAIN_CACHE_TTL_HOURS` | `24` | Successful-result cache by normalized domain |
| `SNAPSHOT_MAX_REQUESTS_PER_IP_PER_HOUR` | `5` | Per-instance, proxy-aware (trusts LB peers only) |
| `SNAPSHOT_MAX_REQUESTS_PER_DOMAIN_PER_DAY` | `3` | Per-instance |
| `SNAPSHOT_MONTHLY_CALL_BUDGET` | `500` | Fail-closed monthly provider-call guard, per-instance |

- OpenAI quota/billing must be active for OpenAI testing (a 429 surfaces as an honest per-engine miss, not a snapshot failure). Gemini operates independently.
- Limits are **in-memory, per-instance, reset on process restart**. Do NOT claim globally distributed rate limiting.
- Production instance topology: **UNKNOWN** (not declared in this repo; Render default is a single instance unless autoscaling was enabled in the dashboard). If autoscaling is ever enabled, budget/cache become per-instance and the monthly guard under-counts — revisit with a shared store then.
- Post-deploy smoke test: one `POST /snapshot/ai-visibility {"domain":"example.com"}` (≤6 provider calls), then repeat to confirm `cached:true` with zero new provider spend.

## 15. AI Prompt Monitoring scheduler (Render cron trilogy)

Phase 7/8A monitoring has no in-process loop by design (the web
service gives no process-lifetime guarantee). One external cron
drives three idempotent endpoints in order. Local implementation
is NOT production verification — confirm each step below after
wiring.

### 15.1 Required configuration

1. Render dashboard → backend service → Environment → add
   `AI_MONITOR_SCHEDULER_SECRET` (strong random, minimum 16
   characters). Never commit a value; never put it in a URL.
2. Create a **Render Cron Job** (same region as the API):
   - Schedule: `*/15 * * * *` (every 15 minutes; see §15.3).
   - Command — one job invoking the trilogy sequentially
     (single job preferred over three; every step is
     idempotent and safe to repeat):

```sh
BASE="https://renkoo-backend.onrender.com/api/monitoring/internal"
H="x-scheduler-secret: $AI_MONITOR_SCHEDULER_SECRET"
curl -sS -m 60 -X POST "$BASE/due" -H "$H"
for _ in 1 2 3 4 5; do
  OUT=$(curl -sS -m 590 -X POST "$BASE/execute-next" -H "$H")
  echo "$OUT" | grep -q '"executed":false' && break
done
curl -sS -m 60 -X POST "$BASE/recover" -H "$H"
```

   - Set `AI_MONITOR_SCHEDULER_SECRET` as a **secret env var on
     the cron job itself** (Render encrypts it; it travels only
     as the `x-scheduler-secret` header, never in the URL).
   - Timeout: 10 minutes max per invocation covers the bounded
     per-run execution (`AI_MONITOR_RUN_TIMEOUT_MS=600000`).
     One `execute-next` call runs exactly one queued run; the
     loop above caps at 5 executions per tick.

### 15.2 What each endpoint does

| Endpoint | Effect |
|---|---|
| `POST …/due` | Claims due DAILY/WEEKLY schedules into QUEUED runs (fast, no AI calls). Advances missed windows to the next eligible window — backlog is never replayed. Deactivates schedules whose website/org is gone. |
| `POST …/execute-next` | Atomically claims the oldest QUEUED run and executes it (bounded batches, credit-guarded, failures free). Returns `{executed:false}` when the queue is empty. |
| `POST …/recover` | Fails RUNNING rows silent past `AI_MONITOR_STALE_RUN_MS` (heartbeat-aware). No re-charge; retry via a fresh run. |
| `POST …/prune` | Bounded retention delete; disabled unless `retentionDays > 0`. Latest observation per prompt×surface is always kept. Run manually, not on a schedule, until retention is deliberately enabled. |

### 15.3 Recommended cadence (reasoning)

- Tick every **15 minutes**: DAILY/WEEKLY user schedules only
  need pickup within minutes, and a 15-minute tick bounds
  recovery latency for crashed workers without hammering the
  API (each tick is 2–4 indexed queries when idle).
- Recover rides the same tick (cheap indexed lookup) — no
  separate job needed.
- Prune is **manual-only** by default (retention defaults to
  keep-forever). If retention is ever enabled, run prune at
  most weekly from a separate cron entry.
- User monitoring itself stays DAILY/WEEKLY — infrastructure
  cadence never creates minute-level user monitoring.

### 15.4 Verification

1. `GET /api/health` → `200 ok:true` (DB up; scheduler needs it).
2. Trigger the cron command once manually from a shell with the
   secret: `due` returns `{claimed: N}`, `execute-next` runs one
   queued run, `recover` returns `{recovered: 0}` on a clean
   system.
3. Workspace check (no secret needed, normal login):
   `GET /api/ai-visibility/monitoring/health?websiteId=…` →
   `monitoring:"ACTIVE"`, `nextRunAt` in the future,
   `schedulerActivity.lastTickAt` recent after a tick.
4. Create one schedule in AI Search Visibility → Monitoring,
   wait two ticks, confirm a COMPLETED run and appended
   `AiVisibilityCheck` rows.

### 15.5 Failure recovery

- Provider failure mid-run → run ends PARTIAL; successes persist
  and stay billed once; only FAILED units retry (same
  idempotency keys, no double charge).
- Process crash mid-run → heartbeat stops → next `recover`
  tick marks it FAILED with the reason preserved; a fresh run
  (schedule or Run now) retries only incomplete work.
- Stale false positive → raise `AI_MONITOR_STALE_RUN_MS`
  and/or lower `AI_MONITOR_HEARTBEAT_MS` (heartbeat default
  90s; stale default 30min).

### 15.6 Inspecting health (no secret needed)

`GET /api/ai-visibility/monitoring/health?websiteId=…` (login):
`lastRun`, `lastSuccessfulRun`, `consecutiveFailures`,
`staleRuns`, provider availability, credit blocked + reason,
`schedulerActivity`, and `currentRunning` with heartbeat age.

### 15.7 Safely disabling monitoring

Workspace level: Monitoring UI → deactivate the schedule
(`isActive:false`) or delete it — queued runs drain, no new
claims. Platform level: pause/delete the Render cron job.
Neither deletes historical observations.

### 15.8 Rotating the scheduler secret

1. Generate a new ≥16-char secret.
2. Update it on the **cron job first**, then on the **backend
   service** (order matters: a tick with the old secret 401s
   safely — no partial work, no duplicate runs thanks to
   window-key idempotency).
3. Confirm one tick succeeds; single mechanism only, no
   overlapping secrets.

### 15.9 Logs

Ticks log counts and ids only (`claimed`, `runIds`,
`recovered`). The secret, prompt text, provider payloads and
AI responses never appear in logs. Alert on repeated 401s
(wrong secret) or 503s (secret unconfigured) from
`/monitoring/internal/*`.
