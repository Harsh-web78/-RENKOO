/*
 * =========================================================
 * GOOGLE OAUTH RETURN DESTINATIONS (Phase 41, Group B).
 *
 * Pure allowlist: the setup surface that started OAuth is
 * carried through signed state and restored on callback.
 * Arbitrary redirect URLs are never trusted — anything
 * outside the allowlist falls back to /integrations.
 * No imports: safe for unit tests and Nest wiring alike.
 * =========================================================
 */

export const OAUTH_RETURN_ORIGINS = [
  'onboarding',
  'first-value',
  'integrations',
] as const;

export type OAuthReturnOrigin =
  (typeof OAUTH_RETURN_ORIGINS)[number];

export const DEFAULT_OAUTH_RETURN_ORIGIN: OAuthReturnOrigin =
  'integrations';

export function normalizeOAuthOrigin(
  value: unknown,
): OAuthReturnOrigin {
  const cleaned = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  return (
    OAUTH_RETURN_ORIGINS as readonly string[]
  ).includes(cleaned)
    ? (cleaned as OAuthReturnOrigin)
    : DEFAULT_OAUTH_RETURN_ORIGIN;
}

/*
 * First-party callback path only (no host). The
 * controller prefixes FRONTEND_URL; the path itself
 * can never escape to an external destination because
 * `origin` is allowlisted above.
 */
export function oauthReturnPath(
  origin: OAuthReturnOrigin,
  status: 'connected' | 'error',
): string {
  return `/${origin}?google=${status}`;
}
