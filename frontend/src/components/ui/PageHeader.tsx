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
    <div className="rk-page flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="rk-label">{eyebrow}</p>

        <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[30px]">
          {title}
        </h1>

        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
            {description}
          </p>
        ) : null}

        {meta ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-rk-muted">
            {meta}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
