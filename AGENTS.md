# RENKOO — AI Growth Operating System

## AGENTS INSTRUCTIONS

This file governs how the AI agent should operate within the RENKOO codebase. Read it before starting any task.

---

## PRODUCT

**RENKOO** — AI Growth Operating System

**NORTH STAR:**
Help businesses understand what is hurting growth, why it is happening, what matters most, what action to take, execute the action, monitor the result, and connect the result to leads, revenue and ROI.

**CORE LOOP:**
DATA
→ INTELLIGENCE
→ OPPORTUNITY
→ PRIORITY
→ RECOMMENDATION
→ ACTION
→ EXECUTION
→ MONITORING
→ OUTCOME
→ LEARNING

---

## ENGINEERING RULES

- Existing codebase is the source of truth.
- Preserve working functionality.
- Never reset, wipe or casually modify the database.
- Never discard uncommitted user work.
- Never invent backend responses, metrics or integrations.
- No fake AI.
- No fake production data.
- No placeholder buttons presented as working functionality.
- Reuse existing architecture before introducing new architecture.
- Prefer small coherent changes.
- Test every meaningful change.
- Fix failures before continuing.
- Maintain tenant/workspace isolation.
- Never expose secrets.
- Never commit .env, API keys, credentials or database dumps.

---

## AUTONOMY

Automatically inspect → implement → test → fix → verify → continue.
Do not ask for permission for normal engineering work.
Ask only before:
- Destructive database operations
- Irreversible production changes
- Secret/credential changes
- Paid service activation
- Production deployment/push

---

## PRODUCT QUALITY

Build a serious global B2B SaaS.

- Premium enterprise UI.
- High information density without clutter.
- Strong hierarchy.
- Excellent loading/error/empty states.
- Responsive desktop/tablet/mobile.
- Accessible.
- Fast.
- No generic AI-dashboard aesthetic.

**AI:**
- AI must use real RENKOO context and real available data.
- AI should provide evidence, reasoning, recommendations and actions.
- Do not simulate AI capabilities that are not implemented.

**Competitive standard:**
- Take inspiration from the depth of Semrush/Ahrefs and the workflow/execution strengths of modern AI products, but do not clone them.
- RENKOO must have its own Growth Operating System identity.

---

## DEFINITION OF DONE

A feature is not complete because the UI exists. It is complete only when:

- Frontend works
- Backend works
- API contract works
- Persistence works when required
- Authentication/tenant isolation works
- Loading/error/empty states work
- Relevant tests pass
- Build/typecheck passes
- Real data path is verified
- No fake functionality remains

---

## PRIORITIZATION ORDER

When working on RENKOO, continuously prioritize:

1. Broken functionality
2. Missing backend foundations
3. Missing real data flows
4. Missing execution/action flows
5. Missing monitoring/outcomes
6. UX/UI quality
7. Performance/security/production readiness

---

## TECH STACK

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Backend:** NestJS 10 + TypeScript + Prisma 6.16.2 + PostgreSQL
- **Database:** PostgreSQL + Prisma ORM
- **Redis:** For caching/queues
- **Docker:** Docker Compose for local development
- **Services:** Stripe (billing), Resend (email), Google APIs, Playwright (crawling)
- **Auth:** JWT with refresh token rotation

---

## BUILD & DEVELOPMENT

**Local development:**

```bash
# Start infrastructure
cd infrastructure
docker compose up -d

# Backend
cd ../backend
copy .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

**API:**
- Health: http://localhost:4000/api/health
- UI: http://localhost:3000

---

## KEY PATHS

- `backend/src/` — NestJS source (modules, controllers, services, guards)
- `backend/prisma/` — Prisma schema and migrations
- `frontend/src/` — Next.js/React source
- `infrastructure/` — Docker compose and deployment configs
- `.env*` — Environment variables (never commit)