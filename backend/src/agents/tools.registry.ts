import type { ToolPermission } from './agents.registry';

/*
 * =========================================================
 * TOOL REGISTRY (metadata)
 *
 * Executors live in AgentsService so every call is
 * scoped server-side by organizationId + verified
 * website ownership. WRITE_INTERNAL tools are only
 * reachable through the explicit approval endpoint.
 * =========================================================
 */

export interface ToolDefinition {
  name: string;
  description: string;
  permission: ToolPermission;
  params: string[];
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'getBusinessContext',
    description:
      'Structured business profile, priorities and data availability.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getWebsite',
    description:
      'Verified website identity (name, url, industry, country).',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getCrawlSummary',
    description:
      'Latest completed crawl score, pages and OPEN issue counts.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getTechnicalIssues',
    description:
      'Top OPEN technical issues with code, severity and recommendation.',
    permission: 'READ_ONLY',
    params: ['limit?'],
  },
  {
    name: 'getGSCQueries',
    description:
      'Connected Search Console queries. Fails honestly when unconnected.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getCompetitors',
    description:
      'Tracked competitors with latest crawl scores.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getCompetitorComparison',
    description:
      'Full comparison for one tracked competitor.',
    permission: 'READ_ONLY',
    params: ['competitorId'],
  },
  {
    name: 'getAiVisibility',
    description:
      'Recorded AI observations, citations and gaps.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getMonitoringChanges',
    description:
      'Meaningful crawl-over-crawl changes.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getMonitoringAlerts',
    description:
      'Active monitoring alerts.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getOpportunities',
    description:
      'Top unified opportunities with business relevance.',
    permission: 'READ_ONLY',
    params: ['limit?'],
  },
  {
    name: 'getActions',
    description:
      'Open tracked actions.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getLeadsRevenue',
    description:
      'Recorded lead and revenue totals.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getLocalHealth',
    description:
      'Deterministic local SEO health from configured evidence only. Unavailable sources never lower the rating.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getBusinessLocations',
    description:
      'Manually managed business locations for the website (primary first).',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getContentWorkspace',
    description:
      'Content items by status, brief/draft counts and refresh queue from real records.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getContentBriefs',
    description:
      'Persisted evidence briefs for the website (newest first).',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getBacklinkOverview',
    description:
      'Recorded backlink counts, quality split and snapshot history state. Imported records only.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'getBacklinkOpportunities',
    description:
      'Open evidence-backed backlink opportunities for the website.',
    permission: 'READ_ONLY',
    params: [],
  },
  {
    name: 'proposeAction',
    description:
      'Build an action proposal without writing anything.',
    permission: 'PROPOSE',
    params: [
      'title',
      'description',
      'priority',
      'type?',
    ],
  },
  {
    name: 'createAction',
    description:
      'Persist a RENKOO action. Approval endpoint only.',
    permission: 'WRITE_INTERNAL',
    params: [
      'title',
      'description',
      'priority',
      'type?',
      'recommendationId?',
    ],
  },
  {
    name: 'updateActionStatus',
    description:
      'Move an action between TODO, IN_PROGRESS, DONE, DISMISSED. Approval endpoint only.',
    permission: 'WRITE_INTERNAL',
    params: ['actionId', 'status'],
  },
  {
    name: 'acknowledgeAlert',
    description:
      'Acknowledge a monitoring alert. Approval endpoint only.',
    permission: 'WRITE_INTERNAL',
    params: ['alertId'],
  },
  {
    name: 'resolveAlert',
    description:
      'Resolve a monitoring alert. Approval endpoint only.',
    permission: 'WRITE_INTERNAL',
    params: ['alertId'],
  },
];

export function getTool(
  name: string,
): ToolDefinition | undefined {
  return TOOLS.find(
    (tool) => tool.name === name,
  );
}
