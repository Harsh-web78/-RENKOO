import './globals.css';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { SITE_URL } from '@/lib/site';
import AuthGate from '../components/AuthGate';
import MonitoringInit from '../components/MonitoringInit';

/*
 * Product Tour 1.0 loads lazily (never in the
 * login bundle) and mounts inside AuthGate so it
 * only ever runs for authenticated sessions. The
 * authenticated shell renders independently of it.
 */
const TourRoot = dynamic(
  () =>
    import(
      '../components/tour/TourRoot'
    ).then((m) => m.default),
  { ssr: false },
);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RENKOO — AI Growth Operating System',
    template: '%s — RENKOO',
  },
  description:
    'RENKOO is the AI Growth Operating System: connect your website, search and revenue data to find what is hurting growth, understand why, decide what matters, execute improvements, and prove the revenue impact.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'RENKOO',
    title: 'RENKOO — AI Growth Operating System',
    description:
      'Find what is hurting growth, understand why, decide what matters, execute improvements, and prove the revenue impact.',
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: 'RENKOO — AI Growth Operating System',
    description:
      'Find what is hurting growth, understand why, decide what matters, execute improvements, and prove the revenue impact.',
  },
  robots: {
    index: true,
    follow: true,
  },
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><MonitoringInit /><AuthGate><TourRoot>{children}</TourRoot></AuthGate></body></html>}
