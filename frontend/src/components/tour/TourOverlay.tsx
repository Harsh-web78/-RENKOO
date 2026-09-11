'use client';

/*
 * RENKOO — Product Tour 1.0 overlay.
 *
 * Spotlight + anchored tooltip over the REAL UI.
 * The dim layer never intercepts pointer events, so
 * highlighted controls stay clickable at all times.
 * Mobile renders the tooltip as a bottom sheet;
 * desktop anchors it to the target with viewport
 * clamping. Dialog semantics + Escape + focus
 * management included; no focus traps (the page
 * must remain operable behind the tour).
 */

import { useEffect, useRef, useState } from 'react';

import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/buttons';

import {
  COMPLETE_TITLE,
  DISCOVERY_GROUPS,
  WELCOME_SUBTITLE,
  WELCOME_TITLE,
  type TourStep,
} from './tourSteps';

export interface ActiveEntry {
  tour: 'core' | 'discovery';
  step: TourStep;
  index: number;
  total: number;
}

interface TourOverlayProps {
  showWelcome: boolean;
  showPicker: boolean;
  activeEntry: ActiveEntry | null;
  showResumePill: boolean;
  resumeEntry: ActiveEntry | null;
  targetEl: Element | null;
  targetMissing: boolean;
  awaitError: boolean;
  pathname: string;
  onStartCore: () => void;
  onSkipWelcome: () => void;
  onClosePicker: () => void;
  onPickGroup: (groupId: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkipStep: () => void;
  onSkipTour: () => void;
  onResume: () => void;
  onFinishCore: () => void;
  onExplore: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function StepCounter({
  index,
  total,
}: {
  index: number;
  total: number;
}) {
  return (
    <span aria-live="polite">
      Step {index + 1} of {total}
    </span>
  );
}

export default function TourOverlay(
  props: TourOverlayProps,
) {
  const {
    showWelcome,
    showPicker,
    activeEntry,
    showResumePill,
    resumeEntry,
    targetEl,
    targetMissing,
    awaitError,
    onStartCore,
    onSkipWelcome,
    onClosePicker,
    onPickGroup,
    onNext,
    onBack,
    onSkipStep,
    onSkipTour,
    onResume,
    onFinishCore,
    onExplore,
  } = props;

  const [rect, setRect] = useState<Rect | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  /* Track the target through scroll/resize. */
  useEffect(() => {
    if (!targetEl) {
      setRect(null);
      return;
    }

    function update() {
      setRect(readRect(targetEl as Element));
      setIsMobile(window.innerWidth < 640);
    }

    update();

    window.addEventListener(
      'scroll',
      update,
      true,
    );
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener(
        'scroll',
        update,
        true,
      );
      window.removeEventListener(
        'resize',
        update,
      );
    };
  }, [targetEl]);

  /* Focus the step title on change (screen
   * readers announce the new step). */
  useEffect(() => {
    if (activeEntry || showWelcome || showPicker) {
      titleRef.current?.focus();
    }
  }, [
    activeEntry?.step.id,
    showWelcome,
    showPicker,
  ]);

  /* Escape closes one layer: picker → step-skip →
   * tour-skip. Never traps the user. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      if (showPicker) {
        onClosePicker();
      } else if (showWelcome) {
        onSkipWelcome();
      } else if (activeEntry) {
        onSkipStep();
      }
    }

    if (
      showPicker ||
      showWelcome ||
      activeEntry
    ) {
      document.addEventListener('keydown', onKey);
    }

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, [
    showPicker,
    showWelcome,
    activeEntry,
    onClosePicker,
    onSkipWelcome,
    onSkipStep,
  ]);

  const step = activeEntry?.step ?? null;
  const isAwaitStep = Boolean(step?.await);
  const isCompleteStep =
    step?.tour === 'core' && step?.id === 'complete';
  const spotlight = Boolean(
    targetEl && rect && step && !isCompleteStep,
  );

  /* Tooltip placement: below the target when it
   * fits, above otherwise, clamped to viewport. */
  function tooltipStyle(): React.CSSProperties {
    if (!rect || isMobile) {
      return {};
    }

    const width = Math.min(340, window.innerWidth - 24);
    const gap = 12;
    const belowTop = rect.top + rect.height + gap;
    const estHeight = 260;
    const placeBelow =
      belowTop + estHeight <= window.innerHeight;
    const top = placeBelow
      ? belowTop
      : Math.max(
          12,
          rect.top - estHeight - gap,
        );
    const left = Math.max(
      12,
      Math.min(
        rect.left,
        window.innerWidth - width - 12,
      ),
    );

    return {
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 71,
    };
  }

  function renderStepActions() {
    if (!activeEntry || !step) return null;

    return (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {activeEntry.index > 0 && !isAwaitStep ? (
          <SecondaryButton
            type="button"
            onClick={onBack}
          >
            Back
          </SecondaryButton>
        ) : null}

        {!isAwaitStep && !isCompleteStep ? (
          <PrimaryButton
            type="button"
            onClick={onNext}
          >
            {step.nextLabel ?? 'Next'}
          </PrimaryButton>
        ) : null}

        {isAwaitStep ? (
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-rk-secondary">
            <span
              aria-hidden
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rk-border-strong border-t-transparent"
            />
            {awaitError
              ? 'Verification is pending — connection trouble. Still watching.'
              : 'Waiting for this step — continues automatically.'}
          </span>
        ) : null}

        {step.skippable && !isCompleteStep ? (
          <GhostButton type="button" onClick={onSkipStep}>
            {isAwaitStep ? 'Skip step' : 'Skip'}
          </GhostButton>
        ) : null}

        <GhostButton type="button" onClick={onSkipTour}>
          Skip tour
        </GhostButton>
      </div>
    );
  }

  return (
    <>
      {/* Spotlight dim layer — pointer-events-none
       * so the real UI stays fully clickable. */}
      {spotlight && rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[70]"
        >
          <div
            className="absolute inset-x-0 top-0 bg-rk-ink/55"
            style={{ height: Math.max(0, rect.top - 6) }}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-rk-ink/55"
            style={{
              top: rect.top + rect.height + 6,
            }}
          />
          <div
            className="absolute bg-rk-ink/55"
            style={{
              top: Math.max(0, rect.top - 6),
              height: rect.height + 12,
              left: 0,
              width: Math.max(0, rect.left - 6),
            }}
          />
          <div
            className="absolute bg-rk-ink/55"
            style={{
              top: Math.max(0, rect.top - 6),
              height: rect.height + 12,
              left: rect.left + rect.width + 6,
              right: 0,
            }}
          />
          <div
            className="absolute rounded-rk-md shadow-[0_0_0_3px_white,0_0_24px_rgba(0,0,0,0.35)]"
            style={{
              top: Math.max(0, rect.top - 6),
              left: Math.max(0, rect.left - 6),
              width: rect.width + 12,
              height: rect.height + 12,
            }}
          />
        </div>
      ) : null}

      {/* Anchored tooltip / mobile bottom sheet. */}
      {spotlight && step && activeEntry ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="rk-tour-title"
          aria-describedby="rk-tour-body"
          className={
            isMobile
              ? 'fixed inset-x-3 bottom-3 z-[71] max-h-[55vh] overflow-y-auto rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-md'
              : 'rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-md'
          }
          style={tooltipStyle()}
        >
          <p className="rk-label">
            {step.tour === 'core'
              ? 'Guided tour'
              : 'Explore RENKOO'}{' '}
            ·{' '}
            <StepCounter
              index={activeEntry.index}
              total={activeEntry.total}
            />
          </p>

          <h2
            id="rk-tour-title"
            ref={titleRef}
            tabIndex={-1}
            className="rk-focusable mt-1 text-[17px] font-extrabold leading-snug tracking-[-0.01em] text-rk-ink outline-none"
          >
            {step.title}
          </h2>

          <p
            id="rk-tour-body"
            className="mt-1.5 text-sm leading-6 text-rk-secondary"
          >
            {step.body}
          </p>

          {step.hint ? (
            <p className="mt-2 rounded-rk-sm border border-rk-border bg-rk-soft px-2.5 py-1.5 text-[13px] font-medium leading-5 text-rk-ink">
              {step.hint}
            </p>
          ) : null}

          {renderStepActions()}
        </div>
      ) : null}

      {/* Fallback centered card when the anchor is
       * not on screen — same guidance, no fake
       * tooltip against a missing element. */}
      {activeEntry &&
      step &&
      !isCompleteStep &&
      (targetMissing ||
        (!targetEl && step.target)) ? (
        <div className="fixed inset-0 z-[71] grid place-items-center bg-rk-ink/55 px-4">
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="rk-tour-title"
            aria-describedby="rk-tour-body"
            className="w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-5 shadow-rk-md"
          >
            <p className="rk-label">
              {step.tour === 'core'
                ? 'Guided tour'
                : 'Explore RENKOO'}{' '}
              ·{' '}
              <StepCounter
                index={activeEntry.index}
                total={activeEntry.total}
              />
            </p>

            <h2
              id="rk-tour-title"
              ref={titleRef}
              tabIndex={-1}
              className="rk-focusable mt-1 text-[17px] font-extrabold leading-snug text-rk-ink outline-none"
            >
              {step.title}
            </h2>

            <p
              id="rk-tour-body"
              className="mt-1.5 text-sm leading-6 text-rk-secondary"
            >
              {step.body} This highlight is not
              available on the current screen —
              continue below without losing progress.
            </p>

            {renderStepActions()}
          </div>
        </div>
      ) : null}

      {/* Core completion card. */}
      {activeEntry && step && isCompleteStep ? (
        <div className="fixed inset-0 z-[71] grid place-items-center bg-rk-ink/55 px-4">
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="rk-tour-title"
            aria-describedby="rk-tour-body"
            className="w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-5 text-center shadow-rk-md"
          >
            <p className="rk-label">
              Guided tour · Complete
            </p>

            <h2
              id="rk-tour-title"
              ref={titleRef}
              tabIndex={-1}
              className="rk-focusable mt-1 text-xl font-extrabold tracking-[-0.02em] text-rk-ink outline-none"
            >
              {COMPLETE_TITLE}
            </h2>

            <p
              id="rk-tour-body"
              className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rk-secondary"
            >
              {step.body}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <PrimaryButton
                type="button"
                onClick={onFinishCore}
              >
                Go to Command Center
              </PrimaryButton>

              <SecondaryButton
                type="button"
                onClick={onExplore}
              >
                Explore RENKOO
              </SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Welcome card for genuinely new users. */}
      {showWelcome ? (
        <div className="fixed inset-0 z-[71] grid place-items-center bg-rk-ink/55 px-4">
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="rk-tour-welcome-title"
            aria-describedby="rk-tour-welcome-body"
            className="w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-5 text-center shadow-rk-md"
          >
            <p className="rk-label">New here</p>

            <h2
              id="rk-tour-welcome-title"
              ref={titleRef}
              tabIndex={-1}
              className="rk-focusable mt-1 text-xl font-extrabold tracking-[-0.02em] text-rk-ink outline-none"
            >
              {WELCOME_TITLE}
            </h2>

            <p
              id="rk-tour-welcome-body"
              className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rk-secondary"
            >
              {WELCOME_SUBTITLE}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <PrimaryButton
                type="button"
                onClick={onStartCore}
              >
                Start Guided Tour
              </PrimaryButton>

              <SecondaryButton
                type="button"
                onClick={onSkipWelcome}
              >
                Skip for now
              </SecondaryButton>
            </div>

            <p className="mt-3 text-xs text-rk-muted">
              You can restart the tour anytime from
              Settings.
            </p>
          </div>
        </div>
      ) : null}

      {/* Discovery group picker (never forced). */}
      {showPicker ? (
        <div className="fixed inset-0 z-[71] grid place-items-center overflow-y-auto bg-rk-ink/55 px-4 py-6">
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="rk-tour-picker-title"
            className="w-full max-w-lg rounded-rk-lg border border-rk-border bg-rk-surface p-5 shadow-rk-md"
          >
            <p className="rk-label">
              Optional · Explore RENKOO
            </p>

            <h2
              id="rk-tour-picker-title"
              ref={titleRef}
              tabIndex={-1}
              className="rk-focusable mt-1 text-xl font-extrabold tracking-[-0.02em] text-rk-ink outline-none"
            >
              What do you want to explore?
            </h2>

            <p className="mt-1.5 text-sm leading-6 text-rk-secondary">
              Short guided highlights per area — two
              stops each. Pick one, or come back later
              from Settings.
            </p>

            <ul className="mt-3 space-y-2">
              {DISCOVERY_GROUPS.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onPickGroup(group.id)
                    }
                    className="rk-focusable flex w-full items-center gap-3 rounded-rk-md border border-rk-border bg-white px-3.5 py-2.5 text-left transition-colors hover:border-rk-strong hover:bg-rk-soft"
                  >
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-rk-sm bg-rk-ink text-xs font-black text-white"
                    >
                      {group.id}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-rk-ink">
                        {group.label}
                      </span>

                      <span className="block truncate text-xs text-rk-muted">
                        {group.description}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex justify-end">
              <GhostButton
                type="button"
                onClick={onClosePicker}
              >
                Not now
              </GhostButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Resume pill — the tour waits; it never
       * yanks the user across routes. */}
      {showResumePill && resumeEntry ? (
        <div className="fixed bottom-4 left-4 z-[71] flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-rk-md border border-rk-border bg-rk-surface py-2 pl-3.5 pr-2 shadow-rk-md">
          <p className="truncate text-[13px] font-semibold text-rk-ink">
            Guided tour ·{' '}
            <StepCounter
              index={resumeEntry.index}
              total={resumeEntry.total}
            />
          </p>

          <SecondaryButton
            type="button"
            onClick={onResume}
          >
            Resume
          </SecondaryButton>

          <GhostButton
            type="button"
            onClick={onSkipTour}
            aria-label="Dismiss guided tour"
          >
            Dismiss
          </GhostButton>
        </div>
      ) : null}
    </>
  );
}
