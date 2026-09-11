import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
  detectAgentChanges,
  isAiCategory,
  normalizeRequestUrl,
  pageCoverage,
  parseLogCsv,
  requestIdentityKey,
  robotsAccess,
  summarizeVisits,
  type AgentSource,
} from './ai-agent-analytics';

/*
 * =========================================================
 * AI AGENT ANALYTICS 1.0 (Phase 8D).
 *
 * First-party request evidence ONLY (user-imported CSV
 * logs). Append-only AiAgentRequest ledger + bounded
 * import ledger. Privacy-safe: IP hashes only, stripped
 * query params, no cookies/headers/bodies.
 *
 * A visit is NEVER a citation, mention, ranking,
 * traffic or conversion signal — every consumer keeps
 * that separation. Billing: imports and aggregation
 * are free; no AI_SCAN/AI_CREDITS counters touched.
 * =========================================================
 */

const IMPORT_SOURCES: AgentSource[] = [
  'FIRST_PARTY_LOG',
  'CDN_LOG',
  'MANUAL_IMPORT',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function windowStart(
  days: 7 | 30 | 90,
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000,
  );
}

@Injectable()
export class AiAgentAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
      });
    if (!website)
      throw new NotFoundException('Website not found');
    return website;
  }

  /* ============ import (preview + confirm) ============ */

  previewImport(csv: string, source: string) {
    this.assertSource(source);
    this.assertSize(csv);
    const report = parseLogCsv(csv);
    return {
      source,
      received: report.received,
      parsed: report.parsed,
      rejected: report.rejected,
      truncated: report.truncated,
      families: report.families,
      sample: report.rows.slice(0, 10).map((row) => ({
        timestamp: row.timestamp,
        method: row.method,
        normalizedUrl: row.normalizedUrl,
        statusCode: row.statusCode,
        family: row.classification.family,
        category: row.classification.category,
        verificationState:
          row.classification.verificationState,
      })),
      privacy: {
        rawIpStored: false,
        cookiesStored: false,
        note: 'IPs are hashed (SHA-256); tracking/sensitive query parameters are stripped before storage.',
      },
    };
  }

  async confirmImport(
    organizationId: string,
    websiteId: string,
    csv: string,
    source: string,
    fileName?: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    this.assertSource(source);
    this.assertSize(csv);
    const report = parseLogCsv(csv);
    const storable = report.rows.slice(
      0,
      MAX_IMPORT_ROWS,
    );
    const pairs = storable.map((row) => ({
      row,
      key: requestIdentityKey({
        organizationId,
        websiteId,
        timestamp: row.timestamp,
        method: row.method,
        normalizedUrl: row.normalizedUrl as string,
        userAgent: row.userAgent,
      }),
    }));
    const existing =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          identityKey: {
            in: pairs.map((pair) => pair.key),
          },
        },
        select: { identityKey: true },
      });
    const seen = new Set(
      existing.map((row) => row.identityKey),
    );
    const fresh = pairs.filter(
      (pair) => !seen.has(pair.key),
    );
    const importRow =
      await this.prisma.aiAgentImport.create({
        data: {
          organizationId,
          websiteId,
          source,
          fileName:
            clean(fileName).slice(0, 200) || null,
          received: report.received,
          parsed: report.parsed,
          imported: fresh.length,
          rejected:
            report.rejected +
            (report.rows.length - storable.length),
          families: report.families,
        },
      });
    if (fresh.length > 0) {
      await this.prisma.aiAgentRequest.createMany({
        data: fresh.map((pair) => ({
          organizationId,
          websiteId,
          importId: importRow.id,
          source,
          observedAt: pair.row.timestamp
            ? new Date(pair.row.timestamp)
            : null,
          method: pair.row.method,
          requestPath: pair.row.path,
          normalizedUrl:
            pair.row.normalizedUrl as string,
          statusCode: pair.row.statusCode,
          userAgent: pair.row.userAgent,
          agentCategory:
            pair.row.classification.category,
          agentFamily:
            pair.row.classification.family,
          verificationState:
            pair.row.classification
              .verificationState,
          responseBytes: pair.row.bytes,
          referrer: pair.row.referrer,
          country: pair.row.country,
          ipHash: null,
          identityKey: pair.key,
        })),
        skipDuplicates: true,
      });
    }
    const total =
      await this.prisma.aiAgentRequest.count({
        where: { organizationId, websiteId },
      });
    return {
      importId: importRow.id,
      received: report.received,
      parsed: report.parsed,
      imported: fresh.length,
      rejected:
        report.rejected +
        (storable.length - fresh.length),
      truncated:
        report.truncated ||
        report.rows.length > MAX_IMPORT_ROWS,
      families: report.families,
      baseline:
        total === fresh.length && fresh.length > 0
          ? 'Baseline established from first import. Re-import to measure movement — never extrapolated.'
          : null,
      billing: {
        charged: false,
        note: 'Log imports are free; no AI_SCANS or AI_CREDITS consumed.',
      },
    };
  }

  private assertSource(source: string) {
    if (
      !(IMPORT_SOURCES as string[]).includes(source)
    ) {
      throw new BadRequestException(
        `source must be one of ${IMPORT_SOURCES.join(', ')}. Analytics auto-ingestion is not connected; GA4 filters bots by default.`,
      );
    }
  }

  private assertSize(csv: string) {
    if (
      Buffer.byteLength(String(csv ?? ''), 'utf8') >
      MAX_FILE_BYTES
    ) {
      throw new BadRequestException(
        'Log payload exceeds the 10MB import limit. Split the export and import in parts.',
      );
    }
  }

  /* ============ activity ============ */

  async getActivity(
    organizationId: string,
    websiteId: string,
    days: 7 | 30 | 90 = 30,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const since = windowStart(days);
    const rows =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          OR: [
            { observedAt: { gte: since } },
            { observedAt: null },
          ],
        },
        orderBy: { observedAt: 'desc' },
        take: 5000,
      });
    if (rows.length === 0) {
      return {
        connected: false,
        emptyState:
          'Connect access logs to see which AI/search agents are visiting your site.',
        summary: null,
        topAgents: [],
        topPages: [],
        accessIssues: [],
        changes: [],
      };
    }
    const summary = summarizeVisits(
      rows.map((row) => ({
        family: row.agentFamily,
        category: row.agentCategory as never,
        normalizedUrl: row.normalizedUrl,
        statusCode: row.statusCode,
        timestamp: row.observedAt
          ? row.observedAt.toISOString()
          : null,
      })),
    );
    const accessIssues = this.accessIssues(rows);
    const changes = await this.windowChanges(
      organizationId,
      websiteId,
      days,
    );
    return {
      connected: true,
      sourceLabel: 'FIRST-PARTY LOG / MANUAL IMPORT',
      evidenceState: 'OBSERVED',
      verificationNote:
        'Agent identity comes from User-Agent signatures only (spoofable). All rows are OBSERVED_USER_AGENT — never presented as verified official agents.',
      separationNote:
        'Visits are request evidence only: never a citation, mention, ranking, traffic or conversion signal.',
      summary,
      topAgents: summary.byAgent.slice(0, 10),
      topPages: summary.byPage.slice(0, 10),
      accessIssues: accessIssues.slice(0, 10),
      changes,
    };
  }

  private accessIssues(
    rows: Array<{
      normalizedUrl: string;
      statusCode: number | null;
      agentFamily: string;
      agentCategory: string;
    }>,
  ): Array<{
    url: string;
    status: number;
    count: number;
    families: string[];
    aiRelated: boolean;
    evidence: string;
  }> {
    const byKey = new Map<
      string,
      {
        url: string;
        status: number;
        count: number;
        families: Set<string>;
        aiRelated: boolean;
      }
    >();
    for (const row of rows) {
      if (
        row.statusCode === null ||
        row.statusCode < 400
      ) {
        continue;
      }
      const key = `${row.normalizedUrl}|${row.statusCode}`;
      const entry = byKey.get(key) ?? {
        url: row.normalizedUrl,
        status: row.statusCode,
        count: 0,
        families: new Set<string>(),
        aiRelated: false,
      };
      entry.count += 1;
      entry.families.add(row.agentFamily);
      if (isAiCategory(row.agentCategory as never)) {
        entry.aiRelated = true;
      }
      byKey.set(key, entry);
    }
    return [...byKey.values()]
      .map((entry) => ({
        url: entry.url,
        status: entry.status,
        count: entry.count,
        families: [...entry.families].sort(),
        aiRelated: entry.aiRelated,
        evidence: `AI/search-agent requests received repeated ${entry.status} responses on this URL (${entry.count}×). Evidence of access failure only — not proof against citation.`,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private async windowChanges(
    organizationId: string,
    websiteId: string,
    days: 7 | 30 | 90,
  ) {
    const now = Date.now();
    const half = (days * 24 * 60 * 60 * 1000) / 2;
    const mid = new Date(now - half);
    const start = new Date(now - half * 2);
    const rows =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          observedAt: { gte: start },
        },
        select: {
          agentFamily: true,
          normalizedUrl: true,
          statusCode: true,
          observedAt: true,
        },
        take: 5000,
      });
    if (rows.length === 0) return [];
    const split = (list: typeof rows) => ({
      families: Array.from(
        new Set(list.map((row) => row.agentFamily)),
      ),
      pages: Array.from(
        new Set(
          list.map((row) => row.normalizedUrl),
        ),
      ),
      errors: list.filter(
        (row) =>
          row.statusCode !== null &&
          row.statusCode >= 400,
      ).length,
      total: list.length,
    });
    const previous = split(
      rows.filter(
        (row) =>
          row.observedAt && row.observedAt < mid,
      ),
    );
    const current = split(
      rows.filter(
        (row) =>
          !row.observedAt || row.observedAt >= mid,
      ),
    );
    return detectAgentChanges({ previous, current });
  }

  /* ============ agents + detail ============ */

  async getAgentDetail(
    organizationId: string,
    websiteId: string,
    family: string,
    days: 7 | 30 | 90 = 30,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const name = clean(family);
    if (!name)
      throw new BadRequestException(
        'family is required',
      );
    const since = windowStart(days);
    const rows =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          agentFamily: name,
          observedAt: { gte: since },
        },
        orderBy: { observedAt: 'desc' },
        take: 1000,
      });
    if (rows.length === 0) {
      throw new NotFoundException(
        'No observations for this agent in the window.',
      );
    }
    const summary = summarizeVisits(
      rows.map((row) => ({
        family: row.agentFamily,
        category: row.agentCategory as never,
        normalizedUrl: row.normalizedUrl,
        statusCode: row.statusCode,
        timestamp: row.observedAt
          ? row.observedAt.toISOString()
          : null,
      })),
    );
    const byPage = new Map<
      string,
      {
        requests: number;
        lastSeen: string | null;
        statuses: Set<number>;
      }
    >();
    for (const row of rows) {
      const entry = byPage.get(row.normalizedUrl) ?? {
        requests: 0,
        lastSeen: null,
        statuses: new Set<number>(),
      };
      entry.requests += 1;
      const ts = row.observedAt
        ? row.observedAt.toISOString()
        : null;
      if (ts && (!entry.lastSeen || ts > entry.lastSeen)) {
        entry.lastSeen = ts;
      }
      if (row.statusCode !== null)
        entry.statuses.add(row.statusCode);
      byPage.set(row.normalizedUrl, entry);
    }
    return {
      family: name,
      category: rows[0].agentCategory,
      verificationState: 'OBSERVED_USER_AGENT',
      verificationNote:
        'Identity from User-Agent signature (spoofable). No reverse-DNS verification in this phase.',
      firstSeen: summary.firstSeen,
      lastSeen: summary.lastSeen,
      requests: summary.requests,
      pages: summary.pages,
      statusCodes: summary.statusCodes,
      pagesDetail: [...byPage.entries()]
        .map(([url, entry]) => ({
          url,
          requests: entry.requests,
          lastSeen: entry.lastSeen,
          statuses: [...entry.statuses].sort(),
        }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 50),
    };
  }

  /* ============ page coverage ============ */

  async getCoverage(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    void website;
    const [crawl, officialPages, visits] =
      await Promise.all([
        this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
        this.prisma.aiOfficialObservation.findMany({
          where: {
            organizationId,
            websiteId,
            kind: 'ORGANIC_DEMAND',
            pageUrl: { not: null },
          },
          orderBy: { impressions: 'desc' },
          take: 50,
        }),
        this.prisma.aiAgentRequest.findMany({
          where: {
            organizationId,
            websiteId,
            agentCategory: {
              in: [
                'AI_SEARCH_CRAWLER',
                'AI_ASSISTANT',
                'AI_TRAINING',
              ],
            },
          },
          select: { normalizedUrl: true },
          take: 5000,
        }),
      ]);
    const crawlPages = crawl
      ? await this.prisma.crawlPage.findMany({
          where: { crawlId: crawl.id },
          select: {
            url: true,
            robotsIndexable: true,
          },
          take: 500,
        })
      : [];
    const visited = new Set(
      visits.map((row) =>
        row.normalizedUrl.toLowerCase(),
      ),
    );
    const hasObservations = visits.length > 0;
    const robotsByUrl = new Map(
      crawlPages.map((page) => [
        normalizeRequestUrl(page.url) ?? page.url,
        page.robotsIndexable,
      ]),
    );
    const priorityUrls = new Map<string, string>();
    for (const page of officialPages) {
      if (!page.pageUrl) continue;
      const normalized = normalizeRequestUrl(
        page.pageUrl,
      );
      if (normalized && !priorityUrls.has(normalized)) {
        priorityUrls.set(normalized, 'GSC demand page');
      }
    }
    for (const page of crawlPages.slice(0, 50)) {
      const normalized = normalizeRequestUrl(page.url);
      if (normalized && !priorityUrls.has(normalized)) {
        priorityUrls.set(normalized, 'Crawled page');
      }
    }
    const pages = [...priorityUrls.entries()]
      .slice(0, 100)
      .map(([url, reason]) => {
        const state = pageCoverage(
          url,
          visited,
          hasObservations,
        );
        const robots = robotsByUrl.get(url) ?? null;
        return {
          url,
          source: reason,
          coverage: state,
          robots: robotsAccess(
            robots,
            state === 'AI_AGENT_VISITED',
            crawlPages.length > 0,
          ),
          agentSentence:
            state === 'AI_AGENT_VISITED'
              ? 'AI-agent requests were observed for this page in the available logs.'
              : state === 'AI_AGENT_NOT_OBSERVED'
                ? 'Your page has not yet shown an observed AI-agent request in the available logs — not proof AI cannot see it.'
                : 'No log observations exist, so coverage is unknown.',
        };
      });
    const visitedCount = pages.filter(
      (page) => page.coverage === 'AI_AGENT_VISITED',
    ).length;
    return {
      hasObservations,
      total: pages.length,
      visited: visitedCount,
      headline:
        hasObservations
          ? `${visitedCount} of ${pages.length} priority pages show observed AI-agent requests.`
          : 'No log observations exist — coverage is unknown, not zero.',
      pages,
    };
  }

  /* ============ opportunity bridge ============ */

  async bridgeOpportunities(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const since = windowStart(30);
    const rows =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          observedAt: { gte: since },
        },
        take: 5000,
      });
    const issues = this.accessIssues(rows).filter(
      (issue) => issue.aiRelated && issue.count >= 3,
    );
    let created = 0;
    let skipped = 0;
    for (const issue of issues.slice(0, 10)) {
      const kind =
        issue.status === 403
          ? 'AI_AGENT_ACCESS_403'
          : issue.status >= 500
            ? 'AI_AGENT_ACCESS_5XX'
            : 'AI_AGENT_ACCESS_ERROR';
      const decided =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'AI_VISIBILITY',
            type: kind,
            status: { in: ['COMPLETED', 'DISMISSED'] },
          },
          select: { id: true },
        });
      if (decided) {
        skipped += 1;
        continue;
      }
      const open =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'AI_VISIBILITY',
            type: kind,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
        });
      if (
        open &&
        String(
          (open.metadata as Record<string, unknown> | null)
            ?.aiTargetPage ?? '',
        ) === issue.url
      ) {
        skipped += 1;
        continue;
      }
      await this.prisma.recommendation.create({
        data: {
          organizationId,
          websiteId,
          source: 'AI_VISIBILITY',
          type: kind,
          title: `AI-agent requests hit ${issue.status} on ${issue.url.slice(0, 80)}`,
          description: `${issue.evidence} Families: ${issue.families.join(', ')}. Re-check access, then re-import logs to confirm recovery.`,
          priority:
            issue.status >= 500 ? 'HIGH' : 'MEDIUM',
          impact: 'MEDIUM',
          effort: 'MEDIUM',
          actionText:
            'Fix access, then re-import logs to confirm.',
          pageUrl: null,
          metadata: {
            aiTargetPage: issue.url,
            aiStatus: issue.status,
            measurement:
              'Re-import access logs after the fix and confirm 2xx responses to AI-agent requests.',
          },
        },
      });
      created += 1;
    }
    return {
      created,
      skipped,
      billing: {
        charged: false,
        note: 'Opportunity bridging is free; actions bill under existing AI_GROWTH_ACTIONS rules when created.',
      },
    };
  }

  /* ============ history trend ============ */

  async getHistory(
    organizationId: string,
    websiteId: string,
    days: 7 | 30 | 90 = 30,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const since = windowStart(days);
    const rows =
      await this.prisma.aiAgentRequest.findMany({
        where: {
          organizationId,
          websiteId,
          observedAt: { gte: since },
        },
        select: {
          observedAt: true,
          agentFamily: true,
          agentCategory: true,
          statusCode: true,
        },
        orderBy: { observedAt: 'asc' },
        take: 5000,
      });
    const byDay = new Map<
      string,
      {
        day: string;
        requests: number;
        families: Set<string>;
        errors: number;
      }
    >();
    for (const row of rows) {
      if (!row.observedAt) continue;
      const day = row.observedAt
        .toISOString()
        .slice(0, 10);
      const bucket = byDay.get(day) ?? {
        day,
        requests: 0,
        families: new Set<string>(),
        errors: 0,
      };
      bucket.requests += 1;
      bucket.families.add(row.agentFamily);
      if (
        row.statusCode !== null &&
        row.statusCode >= 400
      ) {
        bucket.errors += 1;
      }
      byDay.set(day, bucket);
    }
    return {
      days,
      baseline:
        rows.length > 0
          ? 'Baseline established from first import. Missing days remain missing.'
          : null,
      trend: [...byDay.values()]
        .map((bucket) => ({
          day: bucket.day,
          requests: bucket.requests,
          families: bucket.families.size,
          errors: bucket.errors,
        }))
        .sort((a, b) => (a.day < b.day ? -1 : 1)),
      observations: rows.length,
    };
  }
}
