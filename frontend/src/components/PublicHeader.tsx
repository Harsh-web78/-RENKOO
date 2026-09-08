import Link from 'next/link';

/*
 * RENKOO — public site header.
 * Presentation only. Links are real app routes or
 * in-page anchors. No contact details are listed
 * because no support destination is currently
 * configured — do not invent one.
 */

const NAV_LINKS = [
  { label: 'Product', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rk-border bg-rk-surface">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-2 px-4 sm:gap-3 sm:px-5 lg:px-8">
        <Link
          href="/"
          aria-label="RENKOO home"
          className="rk-focusable flex shrink-0 items-center gap-2.5 rounded-rk-md"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-rk-md bg-rk-ink text-sm font-black text-white"
          >
            R
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-rk-ink">
            RENKOO
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="ml-4 hidden items-center gap-1 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rk-focusable rounded-rk-md px-3 py-2 text-[13px] font-semibold text-rk-secondary hover:text-rk-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/login"
            className="rk-focusable inline-flex min-h-[44px] items-center rounded-rk-md px-3 text-[13px] font-bold text-rk-secondary hover:text-rk-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rk-focusable inline-flex min-h-[44px] items-center rounded-rk-md bg-rk-ink px-3 text-[13px] font-bold text-white shadow-rk-sm hover:opacity-90 sm:px-4"
          >
            Get started
          </Link>

          {/*
           * Mobile navigation — native disclosure, zero
           * client JavaScript. Same destinations as the
           * desktop nav above.
           */}
          <details className="relative md:hidden">
            <summary
              aria-label="Open menu"
              className="rk-focusable grid h-11 w-11 cursor-pointer list-none place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink [&::-webkit-details-marker]:hidden"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="2" y1="4.5" x2="16" y2="4.5" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="13.5" x2="16" y2="13.5" />
              </svg>
            </summary>

            <nav
              aria-label="Mobile"
              className="rk-dropdown absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-rk-md border border-rk-border bg-rk-surface py-1.5 shadow-rk-md"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rk-focusable flex min-h-[44px] items-center px-4 text-sm font-semibold text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
