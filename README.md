# RENKOO v1 — Scratch Foundation

Stack: Next.js 14 + TypeScript + Tailwind; NestJS 10; PostgreSQL + Prisma 6.16.2; Redis; Docker Compose.

Build order:
0 Foundation -> 1 Auth -> 2 Client/Business onboarding -> 3 Website crawler -> 4 GSC/GA4/search data -> 5 AEO/GEO -> 6 RENKOO AI Assistant -> 7 AI workers -> 8 execution -> 9 agency -> 10 billing.

Do not skip verification checkpoints.

Local:
cd infrastructure
docker compose up -d

cd ../backend
copy .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run start:dev

Frontend in another terminal:
cd frontend
npm install
npm run dev

API: http://localhost:4000/api/health
UI: http://localhost:3000
