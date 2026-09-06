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
  primary: 'bg-rk-ink text-white hover:opacity-90',
  secondary:
    'border border-rk-strong bg-rk-surface text-rk-ink hover:bg-rk-soft',
  ghost: 'text-rk-secondary hover:bg-rk-soft hover:text-rk-ink',
  danger: 'bg-rk-danger text-white hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
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
      className={`rk-focusable inline-flex shrink-0 items-center justify-center gap-1.5 rounded-rk-md font-bold disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
