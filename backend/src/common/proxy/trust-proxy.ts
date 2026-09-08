import { isIP } from 'node:net';

/*
 * Proxy trust for deployments behind a platform load balancer
 * (e.g. Render). Express `req.ip` follows X-Forwarded-For ONLY
 * for direct peers we trust — loopback or private-range
 * addresses (the platform LB / local dev). Direct internet
 * peers are never trusted, so arbitrary clients cannot spoof
 * their IP by sending a forged header.
 */

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return -1;
    return Number(p);
  });
  if (nums.some((n) => n < 0 || n > 255)) {
    return null;
  }
  return nums;
}

function isPrivateV4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  return false;
}

export function isTrustedProxyPeer(
  address: unknown,
): boolean {
  if (typeof address !== 'string' || !address) {
    return false;
  }
  const host = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '');

  if (host === '::1' || host === '::ffff:127.0.0.1') {
    return true;
  }

  const family = isIP(host);
  if (family === 4) return isPrivateV4(host);
  if (family === 6) {
    // Only loopback over IPv6; unique-local/link-local
    // peers are not trusted as load balancers.
    return false;
  }

  // Hostnames / unknown forms are never trusted.
  return false;
}

/*
 * Client IP resolution honoring Express trust settings:
 * with the trust-proxy function installed, req.ip is already
 * the leftmost untrusted hop (spoof-safe). Fall back to the
 * socket address only — never blindly trust the header here
 * (the controller previously did; fixed by routing through
 * this helper).
 */
export function resolveClientIp(
  req: any,
): string {
  const fromExpress =
    typeof req?.ip === 'string' ? req.ip.trim() : '';
  if (fromExpress) {
    return fromExpress.slice(0, 64);
  }

  const remote =
    typeof req?.socket?.remoteAddress === 'string'
      ? req.socket.remoteAddress.trim()
      : '';
  return (remote || 'unknown').slice(0, 64);
}
