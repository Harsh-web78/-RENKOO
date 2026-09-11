import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/*
 * Public marketing pages are crawlable. Authenticated app
 * routes live under the same origin but require a session,
 * so they yield nothing useful to crawlers; disallow the
 * noisiest authenticated surfaces explicitly and keep the
 * sitemap as the discovery source.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/snapshot', '/privacy', '/terms'],
        disallow: [
          '/dashboard',
          '/roadmap',
          '/api/',
          '/share/',
          '/invite/',
          '/login',
          '/signup',
          '/onboarding',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
