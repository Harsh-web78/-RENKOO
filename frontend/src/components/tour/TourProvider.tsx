'use client';

/*
 * RENKOO — Product Tour 1.0 engine.
 *
 * Guides new users through the REAL interface:
 * welcome → website → crawl → GSC → property → GA4 →
 * baseline → Command Center → plan → work → verify →
 * outcomes → done, plus an optional grouped discovery
 * tour. Completion truth always comes from existing
 * product state (websites, first-value status, google
 * health) — the tour never fakes or stores activation
 * state of its own.
 *
 * Performance: this module loads lazily (see
 * TourRoot) after the authenticated shell renders,
 * shares the existing cached session reads (zero
 * extra round trips in the common case), and polls
 * only while an awaited step is active.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  getFirstValueStatus,
  getGoogleConnectionStatus,
  getGoogleHealth,
  getWebsites,
  getCurrentAccount,
  invalidateSessionCache,
  isAuthenticated,
} from '@/lib/api';

import {
  CORE_STEPS,
  stepsForGroup,
  stepsForTour,
  type StepPhase,
  type TourId,
  type TourStep,
} from './tourSteps';

import {
  loadTourState,
  recordTourEvent,
  saveTourState,
  type TourState,
} from './tourStorage';

import TourOverlay from './TourOverlay';

import {
  TOUR_DISCOVERY_EVENT,
  TOUR_RESTART_EVENT,
} from './tourEvents';

interface TourContextValue {
  startTour: (tour: TourId) => void;
  startDiscoveryGroup: (groupId: string) => void;
  openDiscoveryPicker: () => void;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  startDiscoveryGroup: () => {},
  openDiscoveryPicker: () => {},
});

export function useTour() {
  return useContext(TourContext);
}

function storedWebsiteId(): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(
          'renkoo_website_id',
        )
      : null;
  } catch {
    return null;
  }
}

async function resolveWebsiteId(): Promise<string | null> {
  const stored = storedWebsiteId();

  if (stored) {
    return stored;
  }

  try {
    const sites = await getWebsites();
    return Array.isArray(sites) && sites[0]
      ? String((sites[0] as { id: string }).id)
      : null;
  } catch {
    return null;
  }
}

/*
 * Single source for step truth, read from existing
 * product APIs only. The tour NEVER advances on its
 * own: polling only reports {done, working,
 * blocked} and the overlay enables [Next] solely on
 * done. Clicking the button is never completion —
 * only real product state completes a step.
 */
interface StepTruth {
  done: boolean;
  working: boolean;
  blocked: boolean;
}

async function checkStepState(
  step: TourStep,
): Promise<StepTruth> {
  const idle = {
    done: false,
    working: false,
    blocked: false,
  };

  switch (step.await) {
    case 'websites': {
      const sites = await getWebsites();
      return {
        ...idle,
        done:
          Array.isArray(sites) && sites.length > 0,
      };
    }

    case 'crawl': {
      const id = await resolveWebsiteId();
      if (!id) return idle;
      const status = await getFirstValueStatus(
        id,
        true,
      );
      const crawl = status.steps.find(
        (s) => s.step === 'CRAWL',
      );
      return {
        done: crawl?.state === 'COMPLETED',
        working: crawl?.state === 'IN_PROGRESS',
        blocked:
          crawl?.state === 'FAILED' ||
          crawl?.state === 'BLOCKED',
      };
    }

    case 'gsc': {
      /* OAuth returns cross-navigation; force a
       * fresh read so a pre-OAuth cached
       * disconnected state never stalls the tour. */
      invalidateSessionCache('google-status');
      try {
        const health = await getGoogleHealth();
        if (health?.gsc?.connected)
          return { ...idle, done: true };
      } catch {
        /* Fall through to status API. */
      }
      const status =
        await getGoogleConnectionStatus();
      return {
        ...idle,
        done: status?.connected === true,
      };
    }

    case 'gsc-property': {
      invalidateSessionCache('google-status');
      try {
        const health = await getGoogleHealth();
        if (health?.gsc?.property)
          return { ...idle, done: true };
      } catch {
        /* Fall through to status API. */
      }
      const status =
        await getGoogleConnectionStatus();
      return {
        ...idle,
        done: Boolean(status?.selectedProperty),
      };
    }

    case 'ga4': {
      invalidateSessionCache('google-status');
      try {
        const health = await getGoogleHealth();
        if (health?.ga4?.connected)
          return { ...idle, done: true };
      } catch {
        /* Fall through to status API. */
      }
      const status =
        await getGoogleConnectionStatus();
      /* OAuth alone never completes GA4 — only a
       * selected analytics property counts. */
      return {
        ...idle,
        done: Boolean(
          status?.selectedAnalyticsProperty,
        ),
      };
    }

    case 'ga4-property': {
      invalidateSessionCache('google-status');
      try {
        const health = await getGoogleHealth();
        if (health?.ga4?.property)
          return { ...idle, done: true };
      } catch {
        /* Fall through to status API. */
      }
      const status =
        await getGoogleConnectionStatus();
      return {
        ...idle,
        done: Boolean(
          status?.selectedAnalyticsProperty,
        ),
      };
    }

    case 'baseline': {
      const id = await resolveWebsiteId();
      if (!id) return idle;
      const status = await getFirstValueStatus(
        id,
        true,
      );
      const ready =
        status.baseline?.ready === true;
      return {
        done: ready,
        /* Baseline resolves server-side once its
         * inputs exist — genuinely processing. */
        working: !ready,
        blocked: false,
      };
    }

    case 'route': {
      /* Resolved by the pathname effect below
       * (the user arrives via a real CTA click),
       * never by polling. */
      return idle;
    }

    default:
      return idle;
  }
}

function firstVisible(
  root: ParentNode,
  target: string,
): Element | null {
  const nodes = root.querySelectorAll(
    `[data-tour="${target}"]`,
  );

  for (const node of Array.from(nodes)) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const rect = node.getBoundingClientRect();

    if (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(node).visibility !==
        'hidden'
    ) {
      return node;
    }
  }

  return null;
}

const POLL_MS = 4000;
const TARGET_TIMEOUT_MS = 8000;

export default function TourProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [userId, setUserId] = useState<
    string | null
  >(null);
  const [siteCount, setSiteCount] = useState<
    number | null
  >(null);
  const [tourState, setTourState] =
    useState<TourState | null>(null);
  const [showWelcome, setShowWelcome] =
    useState(false);
  const [showPicker, setShowPicker] =
    useState(false);
  const [targetEl, setTargetEl] =
    useState<Element | null>(null);
  const [targetMissing, setTargetMissing] =
    useState(false);
  const [awaitError, setAwaitError] =
    useState(false);
  /*
   * Explicit progression state machine. Polling
   * only moves waiting → working → done/blocked.
   * NOTHING here advances the step index except
   * the user's own Next/Skip click.
   */
  const [phase, setPhase] =
    useState<StepPhase>('idle');

  const navigatedForStep = useRef<string | null>(
    null,
  );
  const viewedStep = useRef<string | null>(null);
  const welcomeShown = useRef(false);

  /* ---------- identity + shared reads ---------- */

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!isAuthenticated()) {
        if (!cancelled) {
          setUserId(null);
          setTourState(null);
          setSiteCount(null);
        }
        return;
      }

      try {
        const account = await getCurrentAccount();
        const sites = await getWebsites();

        if (cancelled) return;

        setUserId(account.user.id);
        setSiteCount(
          Array.isArray(sites) ? sites.length : 0,
        );
        setTourState(
          loadTourState(account.user.id),
        );
      } catch {
        /* AuthGate owns invalid sessions; the
         * tour simply stays out of the way. */
        if (!cancelled) {
          setUserId(null);
          setTourState(null);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /* Keep the website count fresh while idle so the
   * welcome gate uses real state, not a guess. */
  useEffect(() => {
    if (!userId || !tourState) return;
    if (tourState.core.status !== 'idle') return;

    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (!cancelled && Array.isArray(sites)) {
          setSiteCount(sites.length);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId, tourState, pathname]);

  function persist(next: TourState) {
    setTourState(next);
    saveTourState(next);
  }

  /* ---------- actions ---------- */

  const startTour = useCallback(
    (tour: TourId) => {
      setTourState((prev) => {
        if (!prev) return prev;

        const next: TourState = {
          ...prev,
          [tour]: { status: 'active', stepIndex: 0 },
          ...(tour === 'discovery'
            ? { discoveryGroup: null }
            : null),
        };

        saveTourState(next);
        navigatedForStep.current = null;
        viewedStep.current = null;
        recordTourEvent(
          'TOUR_STARTED',
          tour,
          stepsForTour(tour)[0]?.id ?? null,
          window.location.pathname,
        );

        return next;
      });
      setShowWelcome(false);
      setShowPicker(false);
    },
    [],
  );

  const startDiscoveryGroup = useCallback(
    (groupId: string) => {
      setTourState((prev) => {
        if (!prev) return prev;

        const next: TourState = {
          ...prev,
          discovery: {
            status: 'active',
            stepIndex: 0,
          },
          discoveryGroup: groupId,
        };

        saveTourState(next);
        navigatedForStep.current = null;
        viewedStep.current = null;
        recordTourEvent(
          'TOUR_STARTED',
          'discovery',
          stepsForGroup(groupId)[0]?.id ?? null,
          window.location.pathname,
        );

        return next;
      });
      setShowPicker(false);
    },
    [],
  );

  const openDiscoveryPicker = useCallback(() => {
    setShowPicker(true);
  }, []);

  /* External restart entries (Settings panel,
   * account menu) reuse this same engine. */
  useEffect(() => {
    function onRestart() {
      startTour('core');
      router.push('/first-value');
    }

    function onDiscovery() {
      setShowPicker(true);
    }

    window.addEventListener(
      TOUR_RESTART_EVENT,
      onRestart,
    );
    window.addEventListener(
      TOUR_DISCOVERY_EVENT,
      onDiscovery,
    );

    return () => {
      window.removeEventListener(
        TOUR_RESTART_EVENT,
        onRestart,
      );
      window.removeEventListener(
        TOUR_DISCOVERY_EVENT,
        onDiscovery,
      );
    };
  }, [router, startTour]);

  /* ---------- active step resolution ---------- */

  const activeEntry = useMemo(() => {
    if (!tourState) return null;

    if (tourState.core.status === 'active') {
      const steps = stepsForTour('core');
      const step =
        steps[tourState.core.stepIndex] ?? null;
      return step
        ? { tour: 'core' as TourId, step, index: tourState.core.stepIndex, total: steps.length }
        : null;
    }

    if (tourState.discovery.status === 'active') {
      const steps = tourState.discoveryGroup
        ? stepsForGroup(tourState.discoveryGroup)
        : stepsForTour('discovery');
      const step =
        steps[tourState.discovery.stepIndex] ?? null;
      return step
        ? {
            tour: 'discovery' as TourId,
            step,
            index: tourState.discovery.stepIndex,
            total: steps.length,
          }
        : null;
    }

    return null;
  }, [tourState]);

  function advance(tour: TourId, index: number) {
    setTourState((prev) => {
      if (!prev) return prev;

      const steps =
        tour === 'core'
          ? stepsForTour('core')
          : prev.discoveryGroup
            ? stepsForGroup(prev.discoveryGroup)
            : stepsForTour('discovery');

      const nextIndex = index + 1;

      if (nextIndex >= steps.length) {
        const next: TourState = {
          ...prev,
          [tour]: {
            status: 'completed',
            stepIndex: index,
          },
        };
        saveTourState(next);
        recordTourEvent(
          'TOUR_COMPLETED',
          tour,
          steps[index]?.id ?? null,
          window.location.pathname,
        );
        /* A finished discovery group returns to
         * the group picker — more browsing stays
         * one click away, never forced. */
        if (tour === 'discovery') {
          window.setTimeout(
            () => setShowPicker(true),
            0,
          );
        }
        return next;
      }

      const next: TourState = {
        ...prev,
        [tour]: {
          status: 'active',
          stepIndex: nextIndex,
        },
      };
      saveTourState(next);
      navigatedForStep.current = null;
      viewedStep.current = null;

      const upcoming = steps[nextIndex];

      if (
        upcoming &&
        upcoming.route !== window.location.pathname
      ) {
        router.push(upcoming.route);
      }

      return next;
    });
    setTargetEl(null);
    setTargetMissing(false);
    setAwaitError(false);
  }

  function goBack() {
    if (!activeEntry) return;

    const { tour, index } = activeEntry;

    if (index <= 0) return;

    setTourState((prev) => {
      if (!prev) return prev;

      const next: TourState = {
        ...prev,
        [tour]: {
          status: 'active',
          stepIndex: index - 1,
        },
      };
      saveTourState(next);
      navigatedForStep.current = null;
      viewedStep.current = null;

      const steps =
        tour === 'core'
          ? stepsForTour('core')
          : prev.discoveryGroup
            ? stepsForGroup(prev.discoveryGroup)
            : stepsForTour('discovery');
      const previous = steps[index - 1];

      if (
        previous &&
        previous.route !== window.location.pathname
      ) {
        router.push(previous.route);
      }

      return next;
    });
    setTargetEl(null);
    setTargetMissing(false);
    setAwaitError(false);
    setPhase('idle');
  }

  /*
   * The action button activates the REAL
   * highlighted control (targetEl.click()) —
   * the product performs the work, the tour only
   * observes. Clicking is never completion.
   */
  function fireCta() {
    const el = targetEl;

    if (el instanceof HTMLElement) {
      try {
        el.focus();
      } catch {
        /* Focus is best-effort. */
      }
      el.click();
    }
  }

  function skipStep() {
    if (!activeEntry || !tourState) return;

    const { tour, step, index } = activeEntry;

    recordTourEvent(
      'TOUR_STEP_SKIPPED',
      tour,
      step.id,
      pathname,
    );

    if (!step.skippable) {
      dismissTour();
      return;
    }

    advance(tour, index);
  }

  function dismissTour() {
    if (!tourState) return;

    setTourState((prev) => {
      if (!prev) return prev;

      const next: TourState = { ...prev };

      if (prev.core.status === 'active') {
        next.core = {
          status: 'dismissed',
          stepIndex: prev.core.stepIndex,
        };
        recordTourEvent(
          'TOUR_DISMISSED',
          'core',
          CORE_STEPS[prev.core.stepIndex]?.id ??
            null,
          window.location.pathname,
        );
      }

      if (prev.discovery.status === 'active') {
        next.discovery = {
          status: 'dismissed',
          stepIndex: prev.discovery.stepIndex,
        };
        recordTourEvent(
          'TOUR_DISMISSED',
          'discovery',
          null,
          window.location.pathname,
        );
      }

      saveTourState(next);
      return next;
    });

    setShowWelcome(false);
    setShowPicker(false);
    setTargetEl(null);
    setTargetMissing(false);
    setPhase('idle');
  }

  /* ---------- welcome gate (genuinely new users) ---------- */

  useEffect(() => {
    if (
      !userId ||
      !tourState ||
      welcomeShown.current ||
      showWelcome
    ) {
      return;
    }

    /* Brand-new account: no website yet, tour never
     * seen. New users land on /first-value via the
     * existing HomeRedirect — meet them there. */
    if (
      tourState.core.status === 'idle' &&
      siteCount === 0 &&
      pathname === '/first-value'
    ) {
      welcomeShown.current = true;
      setShowWelcome(true);
    }
  }, [
    userId,
    tourState,
    siteCount,
    pathname,
    showWelcome,
  ]);

  /*
   * Route-change detection (e.g. user clicks the
   * real “Evidence” / “Open in work queue” CTA).
   * Marks the step done and waits for the user's
   * explicit Next click — NEVER advances alone.
   */
  useEffect(() => {
    if (
      !activeEntry ||
      activeEntry.step.await !== 'route' ||
      !activeEntry.step.awaitRoute
    ) {
      return;
    }

    if (pathname === activeEntry.step.awaitRoute) {
      setPhase('done');
      setAwaitError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* ---------- target observation ---------- */

  useEffect(() => {
    setTargetEl(null);
    setTargetMissing(false);
    setAwaitError(false);
    viewedStep.current = null;

    if (!activeEntry || !activeEntry.step.target) {
      return;
    }

    if (activeEntry.step.route !== pathname) {
      return;
    }

    const target = activeEntry.step.target;
    let settled = false;
    let raf = 0;

    function check() {
      if (settled) return;
      const el = firstVisible(
        document,
        target,
      );
      if (el) {
        settled = true;
        setTargetEl(el);
        try {
          (el as HTMLElement).scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
        } catch {
          /* Scroll is best-effort. */
        }
      } else {
        raf = window.requestAnimationFrame(check);
      }
    }

    raf = window.requestAnimationFrame(check);

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        window.cancelAnimationFrame(raf);
        /* Never tooltip against a missing
         * element — fall back to a centered card
         * with the same guidance + skip. */
        setTargetMissing(true);
      }
    }, TARGET_TIMEOUT_MS);

    return () => {
      settled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [activeEntry, pathname]);

  /* ---------- step-viewed telemetry ---------- */

  useEffect(() => {
    if (!activeEntry) return;

    const key = `${activeEntry.tour}:${activeEntry.step.id}`;

    if (viewedStep.current !== key) {
      viewedStep.current = key;
      recordTourEvent(
        'TOUR_STEP_VIEWED',
        activeEntry.tour,
        activeEntry.step.id,
        pathname,
      );
    }
  }, [activeEntry, pathname]);

  /* ---------- await polling (active step only) ---------- */

  useEffect(() => {
    if (
      !activeEntry ||
      !activeEntry.step.await ||
      activeEntry.step.route !== pathname
    ) {
      return;
    }

    /* Route awaits resolve via the pathname effect
     * above — no polling needed. */
    if (activeEntry.step.await === 'route') {
      return;
    }

    let cancelled = false;
    const { step } = activeEntry;

    /*
     * Polling reports truth only: waiting →
     * working → done/blocked. Advancing the step
     * index happens exclusively in the Next/Skip
     * click handlers below.
     */
    async function poll() {
      try {
        const truth = await checkStepState(step);

        if (cancelled) return;

        setAwaitError(false);

        if (truth.done) {
          setPhase('done');
        } else if (truth.blocked) {
          setPhase('blocked');
        } else if (truth.working) {
          setPhase('working');
        } else {
          setPhase('waiting');
        }
      } catch {
        /* Honest degraded state: keep waiting,
         * say verification is pending, keep Skip. */
        if (!cancelled) {
          setAwaitError(true);
          setPhase((prev) =>
            prev === 'done' ? prev : 'waiting',
          );
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      /*
       * A completed step holds its [Next] state —
       * no further polling needed. The user
       * decides when to continue.
       */
      if (phase !== 'done') {
        void poll();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntry, pathname, phase]);

  /* ---------- render decisions ---------- */

  const contextValue = useMemo(
    () => ({
      startTour,
      startDiscoveryGroup,
      openDiscoveryPicker,
    }),
    [startTour, startDiscoveryGroup, openDiscoveryPicker],
  );

  const onStepRoute =
    !!activeEntry &&
    activeEntry.step.route === pathname;

  /*
   * The pill waits while the user is elsewhere —
   * except when the step just completed off-route,
   * which gets its own explicit [Next] card.
   */
  const showResumePill =
    !!tourState &&
    !!activeEntry &&
    !onStepRoute &&
    phase !== 'done' &&
    !showWelcome &&
    !showPicker;

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {userId && tourState ? (
        <TourOverlay
          showWelcome={showWelcome}
          showPicker={showPicker}
          activeEntry={activeEntry}
          onStepRoute={onStepRoute}
          showResumePill={showResumePill}
          resumeEntry={activeEntry}
          targetEl={targetEl}
          targetMissing={targetMissing}
          awaitError={awaitError}
          pathname={pathname}
          phase={phase}
          onCta={fireCta}
          onStartCore={() => startTour('core')}
          onSkipWelcome={dismissTour}
          onClosePicker={() =>
            setShowPicker(false)
          }
          onPickGroup={startDiscoveryGroup}
          onNext={() => {
            if (!activeEntry) return;
            recordTourEvent(
              'TOUR_STEP_COMPLETED',
              activeEntry.tour,
              activeEntry.step.id,
              pathname,
            );
            advance(
              activeEntry.tour,
              activeEntry.index,
            );
          }}
          onBack={goBack}
          onSkipStep={skipStep}
          onSkipTour={dismissTour}
          onResume={() => {
            if (!activeEntry) return;
            navigatedForStep.current = `${activeEntry.step.tour}:${activeEntry.step.id}`;
            router.push(activeEntry.step.route);
          }}
          onFinishCore={() => {
            if (!activeEntry) return;
            recordTourEvent(
              'TOUR_COMPLETED',
              'core',
              activeEntry.step.id,
              pathname,
            );
            setTourState((prev) => {
              if (!prev) return prev;
              const next: TourState = {
                ...prev,
                core: {
                  status: 'completed',
                  stepIndex: prev.core.stepIndex,
                },
              };
              saveTourState(next);
              return next;
            });
            router.push('/command-center');
          }}
          onExplore={() => {
            if (!activeEntry) return;
            recordTourEvent(
              'TOUR_COMPLETED',
              'core',
              activeEntry.step.id,
              pathname,
            );
            setTourState((prev) => {
              if (!prev) return prev;
              const next: TourState = {
                ...prev,
                core: {
                  status: 'completed',
                  stepIndex: prev.core.stepIndex,
                },
                discovery: {
                  status: 'active',
                  stepIndex: 0,
                },
                discoveryGroup: null,
              };
              saveTourState(next);
              return next;
            });
            navigatedForStep.current = null;
            viewedStep.current = null;
            setShowPicker(true);
          }}
        />
      ) : null}
    </TourContext.Provider>
  );
}
