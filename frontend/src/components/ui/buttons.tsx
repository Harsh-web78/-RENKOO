'use client';

/*
 * RENKOO V2 — button variants.
 * Supplements (never replaces) existing page-level buttons.
 * Restrained: ink primary, bordered secondary, text ghost,
 * semantic danger. All variants are keyboard-focusable and
 * pair disabled state with reduced opacity + not-allowed.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-rk-ink text-white shadow-rk-sm hover:opacity-90 hover:shadow-rk-md active:shadow-rk-sm',
  secondary:
    'border border-rk-border bg-rk-surface text-rk-ink shadow-rk-sm hover:border-rk-strong hover:bg-white hover:shadow-rk-md active:shadow-rk-sm',
  ghost: 'text-rk-secondary hover:bg-rk-soft hover:text-rk-ink',
  danger:
    'bg-rk-danger text-white shadow-rk-sm hover:opacity-90 hover:shadow-rk-md',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-[13px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      type={rest.type ?? 'button'}
      {...rest}
      className={`rk-focusable inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-rk-md font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: Size;
    children: ReactNode;
  },
) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: Size;
    children: ReactNode;
  },
) {
  return <Button {...props} variant="secondary" />;
}

export function GhostButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: Size;
    children: ReactNode;
  },
) {
  return <Button {...props} variant="ghost" />;
}

export function DangerButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: Size;
    children: ReactNode;
  },
) {
  return <Button {...props} variant="danger" />;
}
