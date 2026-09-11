import './globals.css';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import AuthGate from '../components/AuthGate';
import MonitoringInit from '../components/MonitoringInit';

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
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><MonitoringInit /><AuthGate>{children}</AuthGate></body></html>}
