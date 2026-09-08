import { isIP } from 'node:net';

/*
 * RENKOO public snapshot — pure input guards (no NestJS dependencies).
 *
 * Domain handling:
 * - normalizeDomain() strips protocol/www/path/query/port noise and
 *   lowercases. Returns '' when the input cannot be a public domain.
 * - isBlockedHostname() rejects localhost, reserved TLDs, literal IPs
 *   (v4/v6 incl. private, loopback, link-local, metadata ranges).
 * - SSRF note: literal-IP checks cannot stop DNS rebinding; the fetch
 *   path re-validates the FINAL redirect target and only reads the
 *   homepage with a short timeout + bounded size. Documented limitation.
 */

const LABEL = '(?!-)[a-z0-9-]{1,63}(?<!-)';
const DOMAIN_RE = new RegExp(
  `^${LABEL}(\\.${LABEL})*\\.[a-z]{2,63}$`,
);

const RESERVED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.invalid',
  '.example',
  '.test',
];

export function normalizeDomain(
  input: unknown,
): string {
  if (typeof input !== 'string') return '';

  let value = input.trim().toLowerCase();
  if (!value || value.length > 253) return '';

  // Credentialed input (user:pass@host) is rejected outright.
  if (value.includes('@')) return '';

  value = value.replace(
    /^[a-z][a-z0-9+.-]*:\/\//,
    '',
  );
  const hash = value.indexOf('#');
  if (hash !== -1) value = value.slice(0, hash);
  const query = value.indexOf('?');
  if (query !== -1) value = value.slice(0, query);
  const slash = value.indexOf('/');
  if (slash !== -1) value = value.slice(0, slash);
  const colon = value.lastIndexOf(':');
  if (
    colon !== -1 &&
    /^[0-9]+$/.test(value.slice(colon + 1))
  ) {
    value = value.slice(0, colon);
  }
  if (value.startsWith('www.')) {
    value = value.slice(4);
  }
  value = value.replace(/\.*$/, '');

  if (!value || value.length > 253) return '';
  if (!DOMAIN_RE.test(value)) return '';
  if (isBlockedHostname(value)) return '';

  return value;
}

export function isBlockedHostname(
  hostname: string,
): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/\.*$/, '');

  if (!host) return true;
  if (host === 'localhost') return true;

  for (const suffix of RESERVED_SUFFIXES) {
    if (
      host === suffix.slice(1) ||
      host.endsWith(suffix)
    ) {
      return true;
    }
  }

  if (isIP(host) !== 0) {
    return true;
  }

  return false;
}

/*
 * Resolved-address safety for DNS-rebinding protection.
 * Every address a hostname resolves to must be a public
 * unicast address: blocks private, loopback, link-local,
 * multicast, reserved, CGNAT and metadata-service ranges
 * for both IPv4 and IPv6. Literal-IP hostnames are already
 * rejected upstream; this covers names that RESOLVE badly.
 */
function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

export function isPublicIpAddress(
  ip: unknown,
): boolean {
  if (typeof ip !== 'string' || !ip) {
    return false;
  }
  const clean = ip
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '');
  const family = isIP(clean);

  if (family === 4) {
    const p = ipv4Octets(clean);
    if (!p) return false;
    if (p[0] === 0) return false;
    if (p[0] === 10) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
      return false;
    if (p[0] === 127) return false;
    if (p[0] === 169 && p[1] === 254)
      return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      return false;
    if (p[0] === 192 && p[1] === 168)
      return false;
    if (p[0] >= 224) return false;
    return true;
  }

  if (family === 6) {
    const lower = clean.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower === '::ffff:127.0.0.1'
    ) {
      return false;
    }
    if (lower === '::ffff:0:0' || lower === '::ffff:0.0.0.0') {
      return false;
    }
    // Embedded IPv4 (mapped/compatible): judge the inner address.
    const embedded =
      lower.match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)$/)?.[1] ??
      null;
    if (embedded) {
      return isPublicIpAddress(embedded);
    }
    if (
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    ) {
      return false;
    }
    if (lower.startsWith('fe80:')) {
      return false;
    }
    if (lower.startsWith('ff')) {
      return false;
    }
    if (
      lower.startsWith('2001:db8:') ||
      lower.startsWith('::ffff:')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

export function allResolvedPublic(
  addresses: unknown,
): boolean {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return false;
  }
  return addresses.every((entry) => {
    const ip =
      typeof entry === 'string'
        ? entry
        : (entry as { address?: unknown })?.address;
    return isPublicIpAddress(ip);
  });
}

/*
 * Final redirect-target check for homepage fetches.
 * Rejects non-http(s), blocked hostnames and literal IPs.
 */
export function isSafeFetchTarget(
  urlString: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'https:'
  ) {
    return false;
  }

  if (
    parsed.username ||
    parsed.password
  ) {
    return false;
  }

  return !isBlockedHostname(parsed.hostname);
}

/*
 * Brand display derived from a homepage title or hostname.
 * Sanitized to a safe token set and bounded — fetched page
 * content is UNTRUSTED and never reaches provider prompts raw.
 */
export function sanitizeBrandDisplay(
  input: unknown,
  fallback: string,
): string {
  const raw =
    typeof input === 'string' ? input : '';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 .&'’-]/g, '')
    .trim()
    .slice(0, 60)
    .replace(/^[ .&'’-]+|[ .&'’-]+$/g, '');

  if (cleaned.length >= 2) return cleaned;

  const safeFallback = String(fallback ?? '')
    .replace(/[^a-zA-Z0-9 .&'’-]/g, '')
    .trim()
    .slice(0, 60);

  return safeFallback.length >= 2
    ? safeFallback
    : 'this business';
}

export function secondLevelName(
  normalizedDomain: string,
): string {
  const parts = normalizedDomain.split('.');
  const sld =
    parts.length >= 2
      ? parts[parts.length - 2]
      : parts[0] ?? '';
  const clean = sld.replace(/[^a-z0-9]/gi, '');
  if (!clean) return 'this business';
  return (
    clean.charAt(0).toUpperCase() +
    clean.slice(1)
  );
}

/*
 * Fixed deterministic prompt set (max 3). Brand/domain are
 * sanitized display strings only. Never user free-text prompts.
 */
export function buildSnapshotPrompts(
  brand: string,
  normalizedDomain: string,
): string[] {
  const safeBrand = sanitizeBrandDisplay(
    brand,
    secondLevelName(normalizedDomain),
  ).slice(0, 60);

  return [
    `What is ${safeBrand} (${normalizedDomain}) and what does it offer?`,
    `Recommend the best providers like ${safeBrand} (${normalizedDomain}) and compare them.`,
    `What problems does ${safeBrand} (${normalizedDomain}) solve for its customers?`,
  ].slice(0, 3);
}

export function truncateExcerpt(
  input: unknown,
  maxChars = 300,
): string {
  const text =
    typeof input === 'string' ? input : '';
  const single = text
    .replace(/\s+/g, ' ')
    .trim();
  if (!single) return '';
  if (single.length <= maxChars) return single;
  return `${single.slice(0, maxChars).trimEnd()}…`;
}

export function snapshotEnv(): {
  maxCallsPerRun: number;
  cacheTtlHours: number;
  maxRequestsPerIpPerHour: number;
  maxRequestsPerDomainPerDay: number;
  monthlyCallBudget: number;
} {
  const num = (
    raw: string | undefined,
    fallback: number,
  ): number => {
    const parsed = Number.parseInt(
      String(raw ?? ''),
      10,
    );
    return Number.isFinite(parsed) &&
      parsed > 0
      ? parsed
      : fallback;
  };

  return {
    maxCallsPerRun: Math.min(
      num(
        process.env.SNAPSHOT_MAX_CALLS_PER_RUN,
        6,
      ),
      6,
    ),
    cacheTtlHours: num(
      process.env.SNAPSHOT_DOMAIN_CACHE_TTL_HOURS,
      24,
    ),
    maxRequestsPerIpPerHour: num(
      process.env.SNAPSHOT_MAX_REQUESTS_PER_IP_PER_HOUR,
      5,
    ),
    maxRequestsPerDomainPerDay: num(
      process.env.SNAPSHOT_MAX_REQUESTS_PER_DOMAIN_PER_DAY,
      3,
    ),
    monthlyCallBudget: num(
      process.env.SNAPSHOT_MONTHLY_CALL_BUDGET,
      500,
    ),
  };
}
