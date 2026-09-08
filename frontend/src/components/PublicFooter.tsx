import Link from 'next/link';

/*
 * RENKOO — reusable public footer.
 * Used by public pages (privacy, terms) and any future
 * public surface. Presentation only; links are real app
 * routes. No contact details are listed because no support
 * destination is currently configured — do not invent one.
 */

const PRODUCT_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Log in', href: '/login' },
  { label: 'Sign up', href: '/signup' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
];

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-rk-border bg-rk-surface">
      <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-10 sm:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-rk-md bg-rk-ink text-sm font-black text-white">
              R
            </div>
            <p className="text-[15px] font-extrabold tracking-[-0.02em] text-rk-ink">
              RENKOO
            </p>
          </div>
          <p className="mt-3 max-w-sm text-[13px] leading-6 text-rk-secondary">
            The AI Growth Operating System — find what is
            hurting growth, understand why, decide what
            matters, execute it, and prove the revenue
            impact.
          </p>
        </div>

        <nav aria-label="Product">
          <p className="rk-field-label">Product</p>
          <ul className="mt-3 space-y-2">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rk-focusable text-[13px] font-semibold text-rk-secondary hover:text-rk-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <p className="rk-field-label">Legal</p>
          <ul className="mt-3 space-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rk-focusable text-[13px] font-semibold text-rk-secondary hover:text-rk-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-rk-border">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-1 px-5 py-4 text-xs text-rk-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {year} RENKOO. All rights reserved.</p>
          <p>
            <Link
              href="/privacy"
              className="rk-focusable font-semibold hover:text-rk-ink"
            >
              Privacy
            </Link>
            <span aria-hidden> · </span>
            <Link
              href="/terms"
              className="rk-focusable font-semibold hover:text-rk-ink"
            >
              Terms
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
