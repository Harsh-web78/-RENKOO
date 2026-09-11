/*
 * RENKOO — Product Tour 1.0 step configuration.
 *
 * Pure data + types only (no React, no network). The
 * engine (TourProvider) interprets this config; the
 * overlay (TourOverlay) renders it. Completion truth
 * always comes from existing product state (websites,
 * first-value status, google health) — never from the
 * tour itself. No business logic is duplicated here.
 */

export type TourId = 'core' | 'discovery';

export type AwaitCondition =
  | 'websites'
  | 'crawl'
  | 'gsc'
  | 'gsc-property'
  | 'ga4'
  | 'ga4-property'
  | 'baseline'
  | 'route';

export interface TourStep {
  /** Stable id, also used in telemetry. */
  id: string;
  tour: TourId;
  /** Discovery group A–F (discovery tour only). */
  group?: string;
  /** Canonical route where the real target lives. */
  route: string;
  /**
   * data-tour anchor value. Undefined renders a
   * centered card (welcome / completion states).
   */
  target?: string;
  title: string;
  /** 1–3 short sentences. No documentation dumps. */
  body: string;
  /**
   * Hint naming the REAL control to click. The
   * tooltip never renders a duplicate of it.
   */
  hint?: string;
  /** Label for the manual advance button (default Next). */
  nextLabel?: string;
  /** Completion condition. Undefined = manual advance. */
  await?: AwaitCondition;
  /** Required with await:'route' — pathname to wait for. */
  awaitRoute?: string;
  /** User may skip this single step. */
  skippable: boolean;
  /** Optional steps (GA4) never block the tour. */
  optional?: boolean;
}

export interface DiscoveryGroup {
  id: string;
  label: string;
  description: string;
}

/* =========================================================
 * CORE FIRST-VALUE TOUR (14 steps)
 * NEW USER → UNDERSTANDS → CONNECTS → FIRST INSIGHT →
 * PRIORITIES → FIRST ACTION. Short enough to finish.
 * ========================================================= */

export const CORE_STEPS: TourStep[] = [
  {
    id: 'website',
    tour: 'core',
    route: '/first-value',
    target: 'add-website',
    title: 'Start with your website',
    body: 'RENKOO uses your website as the foundation for Search Growth analysis. Add it to unlock everything downstream.',
    hint: 'Fill in the highlighted form and click “Create”.',
    await: 'websites',
    skippable: false,
  },
  {
    id: 'crawl',
    tour: 'core',
    route: '/first-value',
    target: 'start-crawl',
    title: 'Scan your website',
    body: 'Your crawl helps RENKOO understand pages, content, technical issues and internal links.',
    hint: 'Click “Run crawl”. If a crawl fails, “Retry crawl” appears in the same place.',
    await: 'crawl',
    skippable: true,
  },
  {
    id: 'connect-gsc',
    tour: 'core',
    route: '/first-value',
    target: 'connect-gsc',
    title: 'Connect Google Search Console',
    body: 'Bring your real Google search performance into RENKOO — queries, clicks, impressions, CTR and position.',
    hint: 'Click “Connect Google”. You return here automatically after Google authorization.',
    await: 'gsc',
    skippable: true,
  },
  {
    id: 'gsc-property',
    tour: 'core',
    route: '/first-value',
    target: 'select-gsc-property',
    title: 'Choose your Search Console property',
    body: 'Select the property that represents the website you are analyzing. RENKOO only reads the property you pick.',
    hint: 'Pick a property from the highlighted selector.',
    await: 'gsc-property',
    skippable: true,
  },
  {
    id: 'connect-ga4',
    tour: 'core',
    route: '/first-value',
    target: 'connect-ga4',
    title: 'Connect Google Analytics',
    body: 'Use GA4 to understand organic traffic, conversions and available revenue signals. This step is optional.',
    hint: 'Click “Connect Google”, or skip to continue without GA4.',
    await: 'ga4',
    skippable: true,
    optional: true,
  },
  {
    id: 'ga4-property',
    tour: 'core',
    route: '/first-value',
    target: 'select-ga4-property',
    title: 'Choose your Analytics property',
    body: 'Select the GA4 property that belongs to this website. GA4 is never marked complete just because Search Console is connected.',
    hint: 'Pick a GA4 property, or skip — it stays optional.',
    await: 'ga4-property',
    skippable: true,
    optional: true,
  },
  {
    id: 'baseline',
    tour: 'core',
    route: '/first-value',
    target: 'baseline',
    title: 'Build your baseline',
    body: 'RENKOO now combines your available website, Google and analytics data to establish your starting point. Nothing is fabricated — this resolves on its own.',
    hint: 'Wait for the ready state. The tour continues automatically.',
    await: 'baseline',
    skippable: true,
  },
  {
    id: 'command-center',
    tour: 'core',
    route: '/command-center',
    target: 'command-center',
    title: 'Your Search Growth Command Center',
    body: 'Instead of making you search through dozens of reports, RENKOO surfaces the most important growth priorities first.',
    nextLabel: 'View priorities',
    skippable: true,
  },
  {
    id: 'top-actions',
    tour: 'core',
    route: '/command-center',
    target: 'top-actions',
    title: 'These are your highest-priority opportunities',
    body: 'Start with the actions RENKOO recommends based on available evidence. Open the first card to see its reasoning.',
    hint: 'Click “Evidence” on the first highlighted card.',
    await: 'route',
    awaitRoute: '/growth-plan',
    skippable: true,
  },
  {
    id: 'growth-plan',
    tour: 'core',
    route: '/growth-plan',
    target: 'growth-work',
    title: 'Turn insights into a plan',
    body: 'Your Growth Plan connects business goals with SEO, search visibility, AI visibility and execution priorities.',
    hint: 'Click “Open in work queue” on a NOW card.',
    await: 'route',
    awaitRoute: '/growth-work',
    skippable: true,
  },
  {
    id: 'growth-work',
    tour: 'core',
    route: '/growth-work',
    target: 'growth-work',
    title: 'Now turn decisions into work',
    body: 'Growth Work shows what needs to be done, what is waiting for approval, what has been executed and what needs verification.',
    nextLabel: 'Show me verification',
    skippable: true,
  },
  {
    id: 'verification',
    tour: 'core',
    route: '/growth-work',
    target: 'verification',
    title: 'Execution is not verification',
    body: 'RENKOO distinguishes between an action being marked done and evidence showing that the change actually happened.',
    nextLabel: 'Show me outcomes',
    skippable: true,
  },
  {
    id: 'outcomes',
    tour: 'core',
    route: '/growth-work',
    target: 'outcomes',
    title: 'Measure what changed',
    body: 'Review the evidence after execution — rankings, search performance, AI visibility and available traffic, lead or revenue signals. SEO, AI and revenue evidence stay separate.',
    nextLabel: 'Finish',
    skippable: true,
  },
  {
    id: 'complete',
    tour: 'core',
    route: '/growth-work',
    title: 'You are ready',
    body: 'RENKOO is now set up to help you move from Search Visibility → Decisions → Action → Verification → Outcomes.',
    skippable: false,
  },
];

/* =========================================================
 * FEATURE DISCOVERY TOUR (optional, grouped, never forced)
 * WHAT it does · WHY it matters · WHAT to do next.
 * Targets are real panels/headers on real routes.
 * ========================================================= */

export const DISCOVERY_GROUPS: DiscoveryGroup[] = [
  {
    id: 'A',
    label: 'Search',
    description: 'Keywords, ranks and change signals.',
  },
  {
    id: 'B',
    label: 'Content',
    description: 'Strategy, topics and internal links.',
  },
  {
    id: 'C',
    label: 'AI Search',
    description: 'Visibility, citations and sources.',
  },
  {
    id: 'D',
    label: 'Competition & Information',
    description: 'Rivals, landscape and change.',
  },
  {
    id: 'E',
    label: 'Execution',
    description: 'Approvals, work and verification.',
  },
  {
    id: 'F',
    label: 'Revenue',
    description: 'Leads, attribution and ROI evidence.',
  },
];

export const DISCOVERY_STEPS: TourStep[] = [
  {
    id: 'discover-keywords',
    tour: 'discovery',
    group: 'A',
    route: '/keywords',
    target: 'discover-keywords',
    title: 'Keyword Research',
    body: 'Finds demand your site could capture — ideas, quick wins and gaps from real provider and Search Console evidence. Prioritize terms where the evidence suggests meaningful upside.',
    hint: 'Next: open a keyword to decide whether to improve, create or consolidate a page.',
    skippable: true,
  },
  {
    id: 'discover-ranks',
    tour: 'discovery',
    group: 'A',
    route: '/rank-tracking',
    target: 'discover-ranks',
    title: 'Rank Intelligence & Alerts',
    body: 'Tracks real position observations, movement and ranking URLs over time, with a digest of what changed. Separate from AI visibility and GSC panels.',
    hint: 'Next: add tracked keywords, then review the changes digest.',
    skippable: true,
  },
  {
    id: 'discover-content',
    tour: 'discovery',
    group: 'B',
    route: '/content',
    target: 'discover-content',
    title: 'Content Strategy',
    body: 'Turns opportunities into content decisions — what to create, improve or refresh — grounded in existing evidence, never invented briefs.',
    hint: 'Next: pick one opportunity and open its recommended action.',
    skippable: true,
  },
  {
    id: 'discover-orphans',
    tour: 'discovery',
    group: 'B',
    route: '/keywords',
    target: 'discover-orphans',
    title: 'Link Graph & Orphan Pages',
    body: 'Surfaces pages with few or no inbound links, so valuable content stops being invisible to crawlers and visitors.',
    hint: 'Next: review candidates and add internal links from relevant pages.',
    skippable: true,
  },
  {
    id: 'discover-ai-visibility',
    tour: 'discovery',
    group: 'C',
    route: '/ai-visibility',
    target: 'discover-ai-visibility',
    title: 'AI Visibility',
    body: 'Shows how your brand appears in AI answers — presence and citations as observed. Presence is never presented as influence.',
    hint: 'Next: check which prompts cite you and which do not.',
    skippable: true,
  },
  {
    id: 'discover-sources',
    tour: 'discovery',
    group: 'C',
    route: '/source-intelligence',
    target: 'discover-sources',
    title: 'Source Intelligence',
    body: 'Reveals which external sources shape answers and where your brand is missing, so you know where earned presence matters.',
    hint: 'Next: open a source gap to see the opportunity behind it.',
    skippable: true,
  },
  {
    id: 'discover-competitors',
    tour: 'discovery',
    group: 'D',
    route: '/competitors',
    target: 'discover-competitors',
    title: 'Competitive Intelligence',
    body: 'Compares your coverage against rivals from observed evidence — where they are ahead and what that implies for your next move.',
    hint: 'Next: open a competitor to see the gap detail.',
    skippable: true,
  },
  {
    id: 'discover-changes',
    tour: 'discovery',
    group: 'D',
    route: '/change-intelligence',
    target: 'discover-changes',
    title: 'Change Intelligence',
    body: 'Orders material evidence changes over time. Observed alongside current evidence — never claimed as caused by any action.',
    hint: 'Next: scan the timeline when metrics move unexpectedly.',
    skippable: true,
  },
  {
    id: 'discover-execution',
    tour: 'discovery',
    group: 'E',
    route: '/execution',
    target: 'discover-execution',
    title: 'Execution',
    body: 'Carries approved work through completion. Planning here never counts as execution — only verified evidence closes the loop.',
    hint: 'Next: open an item to see its status and evidence.',
    skippable: true,
  },
  {
    id: 'discover-approval',
    tour: 'discovery',
    group: 'E',
    route: '/growth-work',
    target: 'approval',
    title: 'Approval & Governance',
    body: 'Work waits for approval before execution, and blocked items name their blocker. Nothing moves silently.',
    hint: 'Next: review what is awaiting approval on your queue.',
    skippable: true,
  },
  {
    id: 'discover-revenue',
    tour: 'discovery',
    group: 'F',
    route: '/search-revenue',
    target: 'discover-revenue',
    title: 'Search-to-Revenue',
    body: 'Links search evidence to available lead and revenue signals. Unavailable stages render as unavailable — never as zero.',
    hint: 'Next: follow one stage from click to revenue.',
    skippable: true,
  },
  {
    id: 'discover-leads',
    tour: 'discovery',
    group: 'F',
    route: '/leads',
    target: 'discover-leads',
    title: 'Leads & Revenue Evidence',
    body: 'Holds available conversion evidence in one place, separate from rankings and AI signals. Temporal association is never claimed as causality.',
    hint: 'Next: connect outcomes back to the work that preceded them.',
    skippable: true,
  },
];

export function stepsForTour(tour: TourId): TourStep[] {
  return tour === 'core' ? CORE_STEPS : DISCOVERY_STEPS;
}

export function stepsForGroup(groupId: string): TourStep[] {
  return DISCOVERY_STEPS.filter((s) => s.group === groupId);
}

/* Welcome / completion copy (single source for tests). */
export const WELCOME_TITLE = 'Welcome to RENKOO 👋';
export const WELCOME_SUBTITLE =
  "Let's get your Search Growth system set up and find your first opportunities.";
export const COMPLETE_TITLE = 'You are ready 🚀';
