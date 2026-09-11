/*
 * Canonical site URL is the production origin. NEXT_PUBLIC_SITE_URL
 * may override per environment; everything else falls back to
 * https://renkoo.online so crawlers never see localhost canonicals.
 *
 * Lives outside app/layout.tsx because Next.js App Router route
 * types only allow known exports from layout files.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://renkoo.online'
).replace(/\/+$/, '');
