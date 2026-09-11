-- RENKOO Keyword Strategy 5.0: AI strategist brief ledger (additive only).
-- StrategyBrief stores one row per generated strategy brief and doubles
-- as the free-workspace AI spend ledger together with ContentDraft
-- (shared monthly AI allowance). No secrets stored — brief text only.

-- CreateTable
CREATE TABLE "StrategyBrief" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "brief" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyBrief_organizationId_createdAt_idx" ON "StrategyBrief"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyBrief_websiteId_createdAt_idx" ON "StrategyBrief"("websiteId", "createdAt");
