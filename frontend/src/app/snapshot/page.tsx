import type { Metadata } from 'next';
import Link from 'next/link';
import PublicFooter from '../../components/PublicFooter';
import PublicHeader from '../../components/PublicHeader';
import SnapshotClient from './snapshot-client';

export const metadata: Metadata = {
  title: 'Free AI Visibility Snapshot — RENKOO',
  description:
    'See how your brand appears in AI answers. A free limited snapshot across the AI engines RENKOO can currently test. No signup required.',
};

export default function SnapshotPage() {
  return (
    <>
      <a
        href="#snapshot-content"
        className="rk-focusable sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-rk-md focus:bg-rk-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <PublicHeader />
      <main id="snapshot-content">
        <SnapshotClient />
      </main>
      <PublicFooter />
      <p className="mx-auto max-w-[1100px] px-5 pb-10 text-center lg:px-8">
        <Link
          href="/"
          className="rk-focusable text-sm font-bold text-rk-secondary underline decoration-rk-border-strong underline-offset-4 hover:text-rk-ink"
        >
          Back to RENKOO home
        </Link>
      </p>
    </>
  );
}
