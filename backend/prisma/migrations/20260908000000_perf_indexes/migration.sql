-- RENKOO performance indexes (additive only, no schema changes).
-- Each composite matches a real hot-path filter+order pattern:
-- - Crawl(websiteId, status): latest-COMPLETED-crawl lookups
--   (agents, monitoring, recommendations, comparison, backlinks).
-- - Recommendation(organizationId, websiteId, status): unified
--   opportunities queue (status IN OPEN/IN_PROGRESS per website).
-- - BillingEvent(organizationId, createdAt): billing history
--   (previously zero indexes on organizationId).
-- - Action(organizationId, status, createdAt): actions list
--   ordered by status, then newest first.
-- Applied automatically by `prisma migrate deploy` (Render
-- release step). Safe to re-run: plain CREATE INDEX on a
-- fresh migration is applied exactly once per database.

-- CreateIndex
CREATE INDEX "Crawl_websiteId_status_idx" ON
"public"."Crawl"("websiteId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_websiteId_status_idx" ON
"public"."Recommendation"("organizationId", "websiteId", "status");

-- CreateIndex
CREATE INDEX "BillingEvent_organizationId_createdAt_idx" ON
"public"."BillingEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Action_organizationId_status_createdAt_idx" ON
"public"."Action"("organizationId", "status", "createdAt");
