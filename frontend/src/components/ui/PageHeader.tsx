'use client';

/*
 * RENKOO V2 — PageHeader.
 * One header pattern for every page: eyebrow, title,
 * description, optional meta line and action slot.
 * Renders structure only; all data comes from props.
 */

import type { ReactNode } from 'react';

export default function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="rk-label">{eyebrow}</p>

        <h1 className="mt-1 truncate text-2xl font-bold tracking-[-0.03em] text-rk-ink sm:text-3xl">
          {title}
        </h1>

        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
            {description}
          </p>
        ) : null}

        {meta ? (
          <div className="mt-2 text-xs text-rk-muted">
            {meta}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
