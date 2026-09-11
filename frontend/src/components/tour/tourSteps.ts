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

/*
 * Explicit progression states. Polling only moves
 * waiting → working → done/blocked. Advancing the
 * step index requires the user's own Next/Skip
 * click — the engine never advances alone.
 */
export type StepPhase =
  | 'idle'
  | 'waiting'
  | 'working'
  | 'done'
  | 'blocked';

/*
 * Tour view states. COMPLETION and TARGET
 * VISIBILITY are independent axes that must never
 * be conflated:
 *
 * - WAITING_FOR_ROUTE ... user is elsewhere (pill
 *   or transition card, never the step guide)
 * - WAITING_FOR_TARGET . route OK, anchor still
 *   rendering (patient waiting card, no error)
 * - READY_FOR_USER ... anchor highlighted, guide
 *   shown (waiting / working / blocked copy varies
 *   by phase, [Next] only on manual steps)
 * - COMPLETED_WAIT .... completion truth is true:
 *   completed UI + [Next], anchor optional, NEVER
 *   Retry, NEVER "couldn't find this step"
 * - TARGET_UNAVAIL .... bounded timeout elapsed
 *   AND step genuinely incomplete (Retry allowed)
 * - SKIPPED ........... terminal, no UI
 *
 * Priority: completion beats visibility. A done
 * step renders COMPLETED_WAIT even when its DOM
 * anchor is gone (e.g. creation controls unmount
 * after the thing they create exists).
 */
export type StepView =
  | 'transition'
  | 'complete-final'
  | 'completed-off-route'
  | 'completed'
  | 'waiting-for-route'
  | 'waiting-for-target'
  | 'ready'
  | 'target-unavailable'
  | 'idle';

export interface StepViewInput {
  navigating: boolean;
  isCompleteStep: boolean;
  onStepRoute: boolean;
  phase: StepPhase;
  hasTargetAnchor: boolean;
  targetFound: boolean;
  observing: boolean;
  targetMissing: boolean;
}

export function resolveStepView(
  input: StepViewInput,
): StepView {
  if (input.navigating) {
    return 'transition';
  }

  if (input.isCompleteStep) {
    return 'complete-final';
  }

  if (!input.onStepRoute) {
    /*
     * Off-route arrival via a real CTA click still
     * deserves its explicit [Next] — but ONLY
     * after genuine completion, never auto.
     */
    return input.phase === 'done'
      ? 'completed-off-route'
      : 'waiting-for-route';
  }

  /* On route from here on. Completion truth has
   * absolute priority over anchor visibility. */
  if (input.phase === 'done') {
    return 'completed';
  }

  if (input.targetFound) {
    return 'ready';
  }

  if (input.observing) {
    return 'waiting-for-target';
  }

  if (input.targetMissing) {
    return 'target-unavailable';
  }

  /*
   * Anchorless non-final steps (none exist today):
   * keep polling rather than erroring.
   */
  return input.hasTargetAnchor
    ? 'waiting-for-target'
    : 'waiting-for-target';
}

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
  /**
   * Label for the action button that activates the
   * REAL highlighted control (e.g. “Start Crawl”).
   * The button clicks the actual target element —
   * it never duplicates product functionality.
   * Absent = no action button (user acts directly
   * on the UI, or the step resolves on its own).
   */
  ctaLabel?: string;
  /**
   * Shown while the step is genuinely processing
   * (e.g. crawl running). Falls back to title/body.
   */
  workingTitle?: string;
  workingBody?: string;
  /**
   * Shown after real completion is detected. The
   * tour NEVER auto-advances — the user must click
   * Next. Required on every awaited step.
   */
  completedTitle?: string;
  completedBody?: string;
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
    hint: 'Fill in the highlighted form, then use the highlighted “Create” button (or the button below).',
    ctaLabel: 'Add Website',
    completedTitle: '✓ Website added',
    completedBody:
      'Your website is now the foundation for Search Growth analysis. Continue when you are ready.',
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
    hint: 'Use the highlighted “Run crawl” button. If a crawl fails, “Retry crawl” appears in the same place.',
    ctaLabel: 'Start Crawl',
    workingTitle: 'Crawling your website…',
    workingBody:
      'RENKOO is working on this step. You can continue when it is complete.',
    completedTitle: '✓ Crawl complete',
    completedBody:
      'Your website has been successfully analyzed. Continue when you are ready.',
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
    hint: 'Use the highlighted “Connect Google” button. You return here automatically after Google authorization.',
    ctaLabel: 'Connect Google',
    completedTitle: '✓ Search Console connected',
    completedBody:
      'Your real Google search performance is now flowing into RENKOO. Continue when you are ready.',
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
    ctaLabel: 'Choose Property',
    completedTitle: '✓ Property selected',
    completedBody:
      'RENKOO now reads the property you picked. Continue when you are ready.',
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
    hint: 'Use the highlighted “Connect Google” button, or skip to continue without GA4.',
    ctaLabel: 'Connect Google',
    completedTitle: '✓ Analytics connected',
    completedBody:
      'Your GA4 connection is active. Continue when you are ready.',
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
    ctaLabel: 'Choose Property',
    completedTitle: '✓ Analytics property selected',
    completedBody:
      'RENKOO now reads the GA4 property you picked. Continue when you are ready.',
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
    hint: 'RENKOO is working on this step. You can continue when it is complete.',
    workingTitle: 'Building your baseline…',
    workingBody:
      'RENKOO is working on this step. You can continue when it is complete.',
    completedTitle: '✓ Baseline ready',
    completedBody:
      'Your starting point is established from real data. Continue when you are ready.',
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
    completedTitle: '✓ Action opened',
    completedBody:
      'You opened a recommended action with its reasoning. Continue when you are ready.',
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
    completedTitle: '✓ Work queue opened',
    completedBody:
      'The decision is now in your work queue. Continue when you are ready.',
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
  "Let's get your first Search Growth insight.";
export const COMPLETE_TITLE = 'You are ready 🚀';
