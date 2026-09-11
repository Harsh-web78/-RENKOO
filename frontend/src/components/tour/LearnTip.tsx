'use client';

/*
 * RENKOO — contextual "?" helper (Tour 1.0).
 *
 * Reusable WHAT / WHY / NEXT micro-explanation for
 * unfamiliar metrics and features. Existing
 * terminology only; never invents metrics. Small by
 * design: a button + popover, Escape to close.
 */

import { useEffect, useId, useRef, useState } from 'react';

export default function LearnTip({
  what,
  why,
  next,
  label,
}: {
  what: string;
  why: string;
  next: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      const root = document.getElementById(popId);

      if (
        root &&
        target &&
        !root.contains(target) &&
        target !== buttonRef.current &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener(
      'pointerdown',
      onPointer,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
      document.removeEventListener(
        'pointerdown',
        onPointer,
      );
    };
  }, [open, popId]);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Learn: ${label}`}
        title={`Learn: ${label}`}
        className="rk-focusable grid h-5 w-5 place-items-center rounded-full border border-rk-border-strong text-[11px] font-black leading-none text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
      >
        ?
      </button>

      {open ? (
        <span
          id={popId}
          role="note"
          className="absolute left-0 top-6 z-50 w-64 rounded-rk-md border border-rk-border bg-rk-surface p-3 text-left shadow-rk-md"
        >
          <span className="rk-label block">
            {label}
          </span>

          <span className="mt-1.5 block text-[13px] leading-5 text-rk-secondary">
            <span className="font-bold text-rk-ink">
              What:{' '}
            </span>
            {what}
          </span>

          <span className="mt-1 block text-[13px] leading-5 text-rk-secondary">
            <span className="font-bold text-rk-ink">
              Why:{' '}
            </span>
            {why}
          </span>

          <span className="mt-1 block text-[13px] leading-5 text-rk-secondary">
            <span className="font-bold text-rk-ink">
              Next:{' '}
            </span>
            {next}
          </span>
        </span>
      ) : null}
    </span>
  );
}
