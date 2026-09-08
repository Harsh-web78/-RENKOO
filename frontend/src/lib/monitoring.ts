/*
 * RENKOO — lightweight production error monitoring (Sentry-compatible).
 *
 * - No new SDK dependency; uses fetch/beacon only.
 * - Graceful no-op when NEXT_PUBLIC_SENTRY_DSN is missing (local dev unaffected).
 * - Never sends: passwords, tokens, API keys, Authorization headers,
 *   request bodies, or raw customer data. Only sanitized path/method/
 *   status/message/stack are reported.
 * - Environment-aware via NODE_ENV + DSN presence.
 */

type ApiErrorContext = {
  url: string;
  method?: string;
  status?: number;
};

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'authorization',
]);

function getDsn(): string {
  return (process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();
}

export function isMonitoringEnabled(): boolean {
  return getDsn().length > 0;
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    // Keep only origin + path + sanitized query; drop hash.
    const query = parsed.search ? parsed.search.slice(0, 200) : '';
    const path = parsed.pathname.slice(0, 300);
    if (rawUrl.startsWith('http')) {
      return `${parsed.origin}${path}${query}`;
    }
    return `${path}${query}`;
  } catch {
    return rawUrl.slice(0, 300);
  }
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9\-_]+(\.[A-Za-z0-9\-_]+){1,2}/g, '[redacted-jwt]')
    .slice(0, 500);
}

function sentryStoreUrl(dsn: string): string | null {
  // DSN: https://<key>@<host>/<projectId>
  try {
    const parsed = new URL(dsn);
    const key = parsed.username;
    const projectId = parsed.pathname.replace(/\/+$/, '').split('/').pop();
    if (!key || !projectId) return null;
    return `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
  } catch {
    return null;
  }
}

function dsnAuthHeader(dsn: string): string | null {
  try {
    const parsed = new URL(dsn);
    const key = parsed.username;
    if (!key) return null;
    const now = Math.floor(Date.now() / 1000);
    return `Sentry sentry_version=7, sentry_key=${key}, sentry_client=renkoo-lite/1.0`;
  } catch {
    return null;
  }
}

export function captureError(
  error: unknown,
  context?: ApiErrorContext & { requestId?: string },
): void {
  const dsn = getDsn();
  if (!dsn) return;
  const storeUrl = sentryStoreUrl(dsn);
  const auth = dsnAuthHeader(dsn);
  if (!storeUrl || !auth) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    platform: 'javascript',
    environment: process.env.NODE_ENV || 'production',
    level: 'error',
    logger: 'renkoo-frontend',
    message: sanitizeMessage(err.message || 'Unknown frontend error'),
    request: context
      ? {
          url: sanitizeUrl(context.url || ''),
          method: (context.method || 'GET').slice(0, 16),
          headers:
            context.status !== undefined
              ? { 'X-Status': String(context.status) }
              : undefined,
        }
      : undefined,
    tags: {
      ...(context?.status !== undefined
        ? { http_status: String(context.status) }
        : {}),
      ...(context?.requestId ? { request_id: context.requestId } : {}),
    },
    exception: {
      values: [
        {
          type: err.name.slice(0, 100),
          value: sanitizeMessage(err.message || String(error)),
          stacktrace:
            typeof err.stack === 'string'
              ? { frames: [] as never[] }
              : undefined,
        },
      ],
    },
  };

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      // sendBeacon cannot set auth headers; include key via URL is avoided
      // to prevent key leakage in logs — fall back to fetch when possible.
      void fetch(storeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': auth,
        },
        body,
        keepalive: true,
      }).catch(() => undefined);
      void blob;
      return;
    }
    void fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': auth,
      },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Monitoring must never break the app.
  }
}

export function captureApiError(context: ApiErrorContext): void {
  try {
    captureError(new Error(`API request failed: ${context.status ?? 'network'}`), context);
  } catch {
    // no-op
  }
}

let initialized = false;

export function initClientMonitoring(): void {
  if (initialized) return;
  initialized = true;
  if (typeof window === 'undefined') return;
  if (!isMonitoringEnabled()) return;

  window.addEventListener('error', (event) => {
    try {
      captureError(event.error || event.message, {
        url: sanitizeUrl(window.location.href),
        method: 'GET',
      });
    } catch {
      // no-op
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      captureError(event.reason, {
        url: sanitizeUrl(window.location.href),
        method: 'GET',
      });
    } catch {
      // no-op
    }
  });
}
