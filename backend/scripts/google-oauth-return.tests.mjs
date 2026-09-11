/*
 * RENKOO Google OAuth return-to-setup — tests (Phase 41, Group B).
 *
 * Pure allowlist + redirect paths, plus signed state
 * round-trips through GoogleService (offline: dummy env,
 * no network, no DB). Covers first-value / onboarding /
 * integrations origins, invalid + malicious redirects,
 * missing origin, legacy 3-part states, tamper, expiry,
 * and the OAuth error path helper.
 *
 * Run: npm run test:google-oauth-return (dist built)
 */
import assert from 'node:assert/strict';

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-oauth-secret-0123456789';
process.env.GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  'http://localhost:4000/api/google/callback';

const ret = await import(
  '../dist/google/oauth-return.js'
);
const svcMod = await import(
  '../dist/google/google.service.js'
);

const svc = new svcMod.GoogleService({});

function stateOf(url) {
  return new URL(url).searchParams.get('state');
}

const results = [];
let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

/* ---------- origin allowlist ---------- */

await test('first-value origin preserved', async () => {
  assert.equal(ret.normalizeOAuthOrigin('first-value'), 'first-value');
});

await test('onboarding origin preserved', async () => {
  assert.equal(ret.normalizeOAuthOrigin('onboarding'), 'onboarding');
});

await test('integrations origin preserved', async () => {
  assert.equal(
    ret.normalizeOAuthOrigin('integrations'),
    'integrations',
  );
});

await test('missing origin falls back to integrations', async () => {
  assert.equal(ret.normalizeOAuthOrigin(undefined), 'integrations');
  assert.equal(ret.normalizeOAuthOrigin(null), 'integrations');
  assert.equal(ret.normalizeOAuthOrigin(''), 'integrations');
});

await test('invalid origin falls back to integrations', async () => {
  assert.equal(ret.normalizeOAuthOrigin('dashboard'), 'integrations');
  assert.equal(ret.normalizeOAuthOrigin('admin'), 'integrations');
});

await test('malicious redirect rejected', async () => {
  assert.equal(
    ret.normalizeOAuthOrigin('https://evil.example/phish'),
    'integrations',
  );
  assert.equal(
    ret.normalizeOAuthOrigin('//evil.example/phish'),
    'integrations',
  );
  assert.equal(
    ret.normalizeOAuthOrigin('/first-value?google=connected'),
    'integrations',
  );
  assert.equal(
    ret.normalizeOAuthOrigin('/\\evil.example'),
    'integrations',
  );
});

await test('leading/trailing slashes tolerated for allowlisted paths', async () => {
  assert.equal(ret.normalizeOAuthOrigin('/first-value/'), 'first-value');
  assert.equal(ret.normalizeOAuthOrigin('/onboarding'), 'onboarding');
});

/* ---------- redirect paths (first-party only) ---------- */

await test('success path per origin', async () => {
  assert.equal(
    ret.oauthReturnPath('first-value', 'connected'),
    '/first-value?google=connected',
  );
  assert.equal(
    ret.oauthReturnPath('onboarding', 'connected'),
    '/onboarding?google=connected',
  );
  assert.equal(
    ret.oauthReturnPath('integrations', 'connected'),
    '/integrations?google=connected',
  );
});

await test('error path per origin', async () => {
  assert.equal(
    ret.oauthReturnPath('first-value', 'error'),
    '/first-value?google=error',
  );
  assert.equal(
    ret.oauthReturnPath('onboarding', 'error'),
    '/onboarding?google=error',
  );
});

await test('redirect paths never escape first-party', async () => {
  for (const origin of ['onboarding', 'first-value', 'integrations']) {
    for (const status of ['connected', 'error']) {
      const path = ret.oauthReturnPath(origin, status);
      assert.ok(path.startsWith('/'));
      assert.ok(!path.startsWith('//'));
      assert.ok(!path.includes('://'));
    }
  }
});

/* ---------- signed state round-trips (offline) ---------- */

await test('state round-trip carries first-value origin', async () => {
  const authorizationUrl = svc.getAuthorizationUrl(
    'org_123',
    'first-value',
  );
  const verified = svc.verifyOAuthState(stateOf(authorizationUrl));
  assert.equal(verified.organizationId, 'org_123');
  assert.equal(verified.origin, 'first-value');
});

await test('state round-trip carries onboarding origin', async () => {
  const authorizationUrl = svc.getAuthorizationUrl(
    'org_123',
    'onboarding',
  );
  const verified = svc.verifyOAuthState(stateOf(authorizationUrl));
  assert.equal(verified.origin, 'onboarding');
});

await test('state round-trip defaults missing origin to integrations', async () => {
  const authorizationUrl = svc.getAuthorizationUrl('org_123');
  const verified = svc.verifyOAuthState(stateOf(authorizationUrl));
  assert.equal(verified.origin, 'integrations');
});

await test('connect origin is allowlisted before signing', async () => {
  const authorizationUrl = svc.getAuthorizationUrl(
    'org_123',
    'https://evil.example/phish',
  );
  const verified = svc.verifyOAuthState(stateOf(authorizationUrl));
  assert.equal(verified.origin, 'integrations');
});

await test('tampered state rejected', async () => {
  const authorizationUrl = svc.getAuthorizationUrl(
    'org_123',
    'first-value',
  );
  const raw = Buffer.from(
    stateOf(authorizationUrl),
    'base64url',
  ).toString('utf8');
  const tampered = Buffer.from(
    `${raw}.extra`,
    'utf8',
  ).toString('base64url');
  assert.throws(() => svc.verifyOAuthState(tampered));
});

await test('foreign state rejected', async () => {
  assert.throws(() =>
    svc.verifyOAuthState(
      Buffer.from('org_123.123.deadbeef', 'utf8').toString('base64url'),
    ),
  );
});

await test('peek returns default for error path without state', async () => {
  assert.equal(svc.peekOAuthOrigin(undefined), 'integrations');
  assert.equal(svc.peekOAuthOrigin(''), 'integrations');
  assert.equal(svc.peekOAuthOrigin('garbage'), 'integrations');
});

await test('peek recovers origin for user-denied error path', async () => {
  const authorizationUrl = svc.getAuthorizationUrl(
    'org_123',
    'onboarding',
  );
  assert.equal(
    svc.peekOAuthOrigin(stateOf(authorizationUrl)),
    'onboarding',
  );
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${passCount} passed, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);
