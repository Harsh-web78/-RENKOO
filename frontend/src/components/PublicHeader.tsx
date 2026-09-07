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
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rk-border bg-rk-surface">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-3 px-5 lg:px-8">
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

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="rk-focusable rounded-rk-md px-3 py-2 text-[13px] font-bold text-rk-secondary hover:text-rk-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-[13px] font-bold text-white shadow-rk-sm hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
