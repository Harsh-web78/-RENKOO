'use client';

/*
 * RENKOO V2 — Drawer foundation.
 * Right-side slide-over for inspecting records without
 * leaving context (opportunity → evidence → recommendation
 * → action). Full-screen sheet on mobile, docked panel on
 * desktop. Focus-safe: Escape closes, overlay closes, focus
 * moves into the panel on open and returns on close,
 * labelled as a dialog.
 *
 * Compound parts (DrawerSection / DrawerMeta /
 * DrawerFooter) keep future detail views consistent.
 * Data states render through the shared primitives —
 * the drawer never invents detail content.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import {
  ErrorState,
  LoadingBlock,
  UnavailableState,
} from './states';

export type DrawerState =
  | 'ready'
  | 'loading'
  | 'error'
  | 'unavailable';

export default function Drawer({
  open,
  title,
  eyebrow,
  description,
  onClose,
  children,
  wide = false,
  footer,
  state = 'ready',
  errorTitle = 'Details failed to load',
  errorDescription = 'RENKOO could not load these details. Your data is safe — try again.',
  onRetry,
  unavailableTitle = 'Details unavailable',
  unavailableDescription = 'This data source is not connected.',
  connectHref = '/integrations',
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
  state?: DrawerState;
  errorTitle?: string;
  errorDescription?: string;
  onRetry?: () => void;
  unavailableTitle?: string;
  unavailableDescription?: string;
  connectHref?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener(
      'keydown',
      onKey,
    );

    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );

      document.body.style.overflow = '';
      const restore = restoreRef.current;
      if (
        restore instanceof HTMLElement &&
        document.contains(restore)
      ) {
        restore.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-rk-scrim"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-rk-border bg-rk-surface shadow-rk-md max-sm:border-l-0 sm:border-l ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rk-border px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="rk-label">{eyebrow}</p>
            ) : null}

            <h2 className="mt-1 text-base font-bold tracking-[-0.01em] text-rk-ink">
              {title}
            </h2>

            {description ? (
              <p className="mt-1 text-sm leading-6 text-rk-secondary">
                {description}
              </p>
            ) : null}
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rk-focusable grid h-8 w-8 shrink-0 place-items-center rounded-rk-md border border-rk-border text-rk-secondary hover:text-rk-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' ? (
            <LoadingBlock title="Loading details…" />
          ) : state === 'error' ? (
            <ErrorState
              title={errorTitle}
              description={errorDescription}
              onRetry={onRetry}
            />
          ) : state === 'unavailable' ? (
            <UnavailableState
              title={unavailableTitle}
              description={unavailableDescription}
              connectHref={connectHref}
            />
          ) : (
            children
          )}
        </div>

        {footer ? (
          <div className="border-t border-rk-border bg-rk-surface px-5 py-3">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/** Labeled content section inside a drawer. */
export function DrawerSection({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="rk-panel-title">{title}</h3>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Key/value metadata list (source, freshness, owner…). */
export function DrawerMeta({
  items,
}: {
  items: Array<{
    label: string;
    value: React.ReactNode;
  }>;
}) {
  return (
    <dl className="divide-y divide-rk-border rounded-rk-md border border-rk-border">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between gap-4 px-3 py-2"
        >
          <dt className="rk-field-label shrink-0 pt-0.5">
            {item.label}
          </dt>
          <dd className="min-w-0 text-right text-sm text-rk-ink">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Sticky footer action row for drawers. */
export function DrawerFooter({
  primary,
  secondary,
}: {
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {secondary}
      {primary}
    </div>
  );
}
