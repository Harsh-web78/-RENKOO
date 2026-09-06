'use client';

/*
 * RENKOO V2 — Panel / Surface.
 * One container pattern for grouped content: optional eyebrow,
 * title, description, action slot and footer. Hierarchy comes
 * from spacing, typography and borders — never shadows or
 * decoration. Renders structure only; data comes from props.
 */

import type { ReactNode } from 'react';

export default function Panel({
  eyebrow,
  title,
  description,
  actions,
  footer,
  children,
  padded = true,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="rounded-rk-lg border border-rk-border bg-rk-surface shadow-rk-sm">
      {title || eyebrow || description || actions ? (
        <div className="flex flex-col gap-2 border-b border-rk-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="rk-label">{eyebrow}</p>
            ) : null}

            {title ? (
              <h2 className="rk-panel-title mt-1">
                {title}
              </h2>
            ) : null}

            {description ? (
              <p className="mt-1 text-sm leading-6 text-rk-secondary">
                {description}
              </p>
            ) : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={padded ? 'px-5 py-4' : undefined}
      >
        {children}
      </div>

      {footer ? (
        <div className="border-t border-rk-border px-5 py-3 text-xs text-rk-muted">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
