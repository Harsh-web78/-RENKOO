/*
 * RENKOO — Product Tour 1.0 persistence + telemetry.
 *
 * Tour walkthrough progress is UI state only and lives
 * in localStorage, scoped per user id. Real activation
 * truth (website, crawl, GSC/GA4, baseline) stays where
 * it already lives: the backend first-value status and
 * google connection state. This module never competes
 * with those systems.
 *
 * Telemetry is a bounded client-side event log (no PII:
 * step id, route, timestamp only). Genuine activation
 * milestones are already recorded by the first-value
 * page via POST /first-value/:id/events — the tour does
 * not duplicate those calls.
 */

import type { TourId } from './tourSteps';

export type TourStatus =
  | 'idle'
  | 'active'
  | 'completed'
  | 'dismissed';

export interface SingleTourState {
  status: TourStatus;
  /** Index into stepsForTour(tour). */
  stepIndex: number;
}

export interface TourState {
  userId: string;
  core: SingleTourState;
  discovery: SingleTourState;
  /** Discovery group currently browsed (UI only). */
  discoveryGroup: string | null;
}

export type TourEvent =
  | 'TOUR_STARTED'
  | 'TOUR_STEP_VIEWED'
  | 'TOUR_STEP_COMPLETED'
  | 'TOUR_STEP_SKIPPED'
  | 'TOUR_COMPLETED'
  | 'TOUR_DISMISSED';

export const TOUR_EVENTS: TourEvent[] = [
  'TOUR_STARTED',
  'TOUR_STEP_VIEWED',
  'TOUR_STEP_COMPLETED',
  'TOUR_STEP_SKIPPED',
  'TOUR_COMPLETED',
  'TOUR_DISMISSED',
];

export interface TourEventRecord {
  event: TourEvent;
  tour: TourId;
  stepId: string | null;
  route: string;
  ts: number;
}

const STATE_KEY = 'renkoo_tour_state';
const EVENTS_KEY = 'renkoo_tour_events';
const MAX_EVENTS = 200;

function idleTour(): SingleTourState {
  return { status: 'idle', stepIndex: 0 };
}

export function loadTourState(
  userId: string,
): TourState {
  const fallback: TourState = {
    userId,
    core: idleTour(),
    discovery: idleTour(),
    discoveryGroup: null,
  };

  try {
    if (typeof window === 'undefined') {
      return fallback;
    }

    const raw = window.localStorage.getItem(STATE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<TourState>;

    /* Another account on this device must never
     * inherit tour progress. */
    if (!parsed || parsed.userId !== userId) {
      return fallback;
    }

    return {
      userId,
      core: {
        status: parsed.core?.status ?? 'idle',
        stepIndex: Math.max(
          0,
          parsed.core?.stepIndex ?? 0,
        ),
      },
      discovery: {
        status: parsed.discovery?.status ?? 'idle',
        stepIndex: Math.max(
          0,
          parsed.discovery?.stepIndex ?? 0,
        ),
      },
      discoveryGroup:
        typeof parsed.discoveryGroup === 'string'
          ? parsed.discoveryGroup
          : null,
    };
  } catch {
    return fallback;
  }
}

export function saveTourState(state: TourState) {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify(state),
    );
  } catch {
    /* Persistence is best-effort; the tour works
     * for the session without it. */
  }
}

export function recordTourEvent(
  event: TourEvent,
  tour: TourId,
  stepId: string | null,
  route: string,
) {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    const raw =
      window.localStorage.getItem(EVENTS_KEY);
    const list: TourEventRecord[] = raw
      ? (JSON.parse(raw) as TourEventRecord[])
      : [];

    list.push({
      event,
      tour,
      stepId,
      route,
      ts: Date.now(),
    });

    window.localStorage.setItem(
      EVENTS_KEY,
      JSON.stringify(list.slice(-MAX_EVENTS)),
    );
  } catch {
    /* Telemetry must never break the tour. */
  }
}
