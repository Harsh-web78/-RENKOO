/*
 * RENKOO internal test entitlement — pure helpers (no NestJS deps).
 *
 * A single designated test account is recognized ONLY by exact
 * normalized email match against the server-side
 * INTERNAL_TEST_EMAIL variable. No domain/pattern/role
 * matching, no client-controlled activation of any kind.
 */

export function normalizeTestEmail(
  value: unknown,
): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function isInternalTestEmail(
  configured: unknown,
  candidate: unknown,
): boolean {
  const expected =
    normalizeTestEmail(configured);
  if (!expected) return false;
  const actual = normalizeTestEmail(candidate);
  if (!actual) return false;
  return actual === expected;
}

export function internalTestEmailConfigured(): string {
  return normalizeTestEmail(
    process.env.INTERNAL_TEST_EMAIL ?? '',
  );
}
