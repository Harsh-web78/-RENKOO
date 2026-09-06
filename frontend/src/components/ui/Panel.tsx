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
    <section className="overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-rk-sm">
      {title || eyebrow || description || actions ? (
        <div className="flex flex-col gap-3 border-b border-rk-border bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="rk-label">{eyebrow}</p>
            ) : null}

            {title ? (
              <h2 className="mt-1 text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                {title}
              </h2>
            ) : null}

            {description ? (
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-rk-secondary">
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
        className={padded ? 'px-5 py-5 sm:px-6' : undefined}
      >
        {children}
      </div>

      {footer ? (
        <div className="border-t border-rk-border bg-rk-soft/60 px-5 py-3 text-xs leading-5 text-rk-muted sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
