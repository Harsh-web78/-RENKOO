/*
 * =========================================================
 * AGENT REGISTRY
 *
 * Static capability declarations. Availability is
 * computed at runtime from real data — never claimed
 * statically. No agent executes external changes;
 * WRITE tools always require explicit approval.
 * =========================================================
 */

export type ToolPermission =
  | 'READ_ONLY'
  | 'PROPOSE'
  | 'WRITE_INTERNAL'
  | 'EXTERNAL_EXECUTION';

export type AgentMode =
  | 'DETERMINISTIC'
  | 'LLM_REQUIRED';

export type AgentRisk =
  | 'LOW'
  | 'MEDIUM';

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capability: string[];
  requiredData: string[];
  allowedTools: string[];
  riskLevel: AgentRisk;
  approvalRequired: boolean;
  mode: AgentMode;
}

export const AGENTS: AgentDefinition[] =
  [
    {
      id: 'technical-seo',
      name: 'Technical SEO Worker',
      description:
        'Reads OPEN technical issues from the latest crawl, ranks them deterministically, and proposes recommendations.',
      capability: [
        'Rank OPEN technical issues',
        'Propose issue recommendations',
      ],
      requiredData: ['crawl'],
      allowedTools: [
        'getBusinessContext',
        'getCrawlSummary',
        'getTechnicalIssues',
        'createAction',
        'updateActionStatus',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'seo-researcher',
      name: 'SEO Researcher',
      description:
        'Reads connected Search Console queries and Business Brain keywords to surface research-backed topics.',
      capability: [
        'Surface top queries',
        'Match queries to business offerings',
      ],
      requiredData: ['gsc'],
      allowedTools: [
        'getBusinessContext',
        'getGSCQueries',
        'createAction',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'content-strategist',
      name: 'Content Strategist',
      description:
        'Finds queries ranking on page 2+ with impressions to propose content improvements.',
      capability: [
        'Find striking-distance queries',
        'Propose content actions',
      ],
      requiredData: ['gsc'],
      allowedTools: [
        'getBusinessContext',
        'getGSCQueries',
        'getOpportunities',
        'getContentWorkspace',
        'getContentBriefs',
        'createAction',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'ai-visibility',
      name: 'AI Visibility Worker',
      description:
        'Reads recorded AI observations to find mention, citation and competitor gaps.',
      capability: [
        'Find mention gaps',
        'Find citation gaps',
        'Compare recorded competitors',
      ],
      requiredData: ['ai_visibility'],
      allowedTools: [
        'getBusinessContext',
        'getAiVisibility',
        'getOpportunities',
        'createAction',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'local-seo',
      name: 'Local SEO Worker',
      description:
        'Reads GEO observations and target locations to propose local relevance work.',
      capability: [
        'Surface GEO mention gaps',
        'Match gaps to target locations',
      ],
      requiredData: ['geo'],
      allowedTools: [
        'getBusinessContext',
        'getAiVisibility',
        'getLocalHealth',
        'getBusinessLocations',
        'createAction',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'competitor-intel',
      name: 'Competitor Intelligence Worker',
      description:
        'Reads tracked competitor crawls and comparisons to identify evidence-backed gaps.',
      capability: [
        'Rank tracked competitors',
        'Surface comparison gaps',
      ],
      requiredData: ['competitors'],
      allowedTools: [
        'getBusinessContext',
        'getCompetitors',
        'getCompetitorComparison',
        'createAction',
      ],
      riskLevel: 'LOW',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'monitoring-analyst',
      name: 'Monitoring Analyst',
      description:
        'Reads meaningful crawl changes and active alerts, and links them to opportunities.',
      capability: [
        'Explain important changes',
        'Link changes to opportunities',
      ],
      requiredData: ['crawl'],
      allowedTools: [
        'getBusinessContext',
        'getMonitoringChanges',
        'getMonitoringAlerts',
        'getOpportunities',
        'acknowledgeAlert',
        'createAction',
      ],
      riskLevel: 'MEDIUM',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'growth-strategist',
      name: 'Growth Strategist',
      description:
        'Combines Business Brain, opportunities and monitoring into top priority recommendations.',
      capability: [
        'Rank unified opportunities',
        'Apply business relevance',
      ],
      requiredData: ['opportunities'],
      allowedTools: [
        'getBusinessContext',
        'getOpportunities',
        'getMonitoringChanges',
        'getLeadsRevenue',
        'getBacklinkOverview',
        'getBacklinkOpportunities',
        'createAction',
      ],
      riskLevel: 'MEDIUM',
      approvalRequired: true,
      mode: 'DETERMINISTIC',
    },
    {
      id: 'report-generator',
      name: 'Report Generator',
      description:
        'Compiles a structured deterministic status report from connected sources and can persist it through the real report engine on approval.',
      capability: [
        'Compile cross-module status',
        'Summarize evidence counts',
        'Persist an Executive Growth Report',
      ],
      requiredData: [],
      allowedTools: [
        'getBusinessContext',
        'getCrawlSummary',
        'getOpportunities',
        'getActions',
        'getMonitoringChanges',
        'getLeadsRevenue',
      ],
      riskLevel: 'LOW',
      approvalRequired: false,
      mode: 'DETERMINISTIC',
    },
  ];

export type AgentAvailability =
  | 'AVAILABLE'
  | 'DETERMINISTIC'
  | 'LLM_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'ERROR';

/*
 * Future external execution tools. Documented only —
 * never executable until a real integration exists and
 * an explicit automation policy allows it.
 */
export const FUTURE_EXTERNAL_TOOLS: Array<{
  name: string;
  description: string;
  available: false;
}> = [
  {
    name: 'updateWordPress',
    description:
      'Requires a connected WordPress integration.',
    available: false,
  },
  {
    name: 'updateWebflow',
    description:
      'Requires a connected Webflow integration.',
    available: false,
  },
  {
    name: 'updateShopify',
    description:
      'Requires a connected Shopify integration.',
    available: false,
  },
  {
    name: 'modifyGBP',
    description:
      'Requires a connected Google Business Profile integration.',
    available: false,
  },
];
