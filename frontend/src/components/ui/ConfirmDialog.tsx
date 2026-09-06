'use client';

/*
 * RENKOO V2 — ConfirmDialog.
 * Explicit approval gate for destructive or consequential
 * operations (deletes, dismissals, worker runs, revocations).
 * Never auto-confirms; never implies success before the real
 * API confirms it — the confirming/error states exist so
 * pages can wait for the genuine response.
 * Focus-safe: Escape cancels, focus moves to Cancel on open
 * and returns to the trigger on close.
 */

import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirming = false,
  tone = 'danger',
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  tone?: 'danger' | 'neutral';
  /** Real API failure message. Shown only after a failed attempt. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const descriptionId = useId();
  const errorId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !confirming) {
        onCancel();
      }
    }

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      const restore = restoreRef.current;
      if (
        restore instanceof HTMLElement &&
        document.contains(restore)
      ) {
        restore.focus();
      }
    };
  }, [open, confirming, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={confirming}
        className="absolute inset-0 h-full w-full cursor-default bg-rk-scrim"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={
          error
            ? `${descriptionId} ${errorId}`
            : descriptionId
        }
        className="relative w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-rk-md"
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-rk-md ${
              tone === 'danger'
                ? 'bg-rk-dangerSoft text-rk-danger'
                : 'bg-rk-soft text-rk-secondary'
            }`}
          >
            <AlertTriangle
              size={17}
              aria-hidden
            />
          </div>

          <div className="min-w-0">
            <h2 className="text-base font-bold text-rk-ink">
              {title}
            </h2>

            <p
              id={descriptionId}
              className="mt-1 text-sm leading-6 text-rk-secondary"
            >
              {description}
            </p>

            {error ? (
              <p
                id={errorId}
                role="alert"
                className="mt-2 rounded-rk-md border border-rk-danger/30 bg-rk-dangerSoft px-3 py-2 text-sm font-semibold text-rk-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rk-focusable rounded-rk-md border border-rk-strong bg-rk-surface px-4 py-2 text-xs font-bold text-rk-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`rk-focusable rounded-rk-md px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-rk-danger'
                : 'bg-rk-ink'
            }`}
          >
            {confirming ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
