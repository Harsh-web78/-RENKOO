import { Logger } from '@nestjs/common';

/*
 * RENKOO — lightweight backend error monitoring (Sentry-compatible).
 *
 * - No new npm dependency; uses global fetch only.
 * - Graceful no-op when SENTRY_DSN is missing (local dev unaffected).
 * - Never sends: passwords, tokens, API keys, Authorization headers,
 *   request bodies, or raw customer data. Only sanitized method/path/
 *   status/message/requestId are reported.
 * - Environment-aware via SENTRY_ENVIRONMENT / NODE_ENV.
 */

const logger = new Logger('ErrorMonitoring');

function getDsn(): string {
  return (process.env.SENTRY_DSN || '').trim();
}

export function isBackendMonitoringEnabled(): boolean {
  return getDsn().length > 0;
}

function getEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  );
}

function sanitizePath(url: string): string {
  const redacted = url
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9\-_]+(\.[A-Za-z0-9\-_]+){1,2}/g, '[redacted-jwt]');
  const qIndex = redacted.indexOf('?');
  if (qIndex === -1) return redacted.slice(0, 300);
  const path = redacted.slice(0, qIndex).slice(0, 300);
  // Drop query entirely server-side to avoid leaking tokens/ids.
  return `${path}?[query-redacted]`;
}

function sentryStoreUrl(dsn: string): string | null {
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

function sentryAuth(dsn: string): string | null {
  try {
    const parsed = new URL(dsn);
    if (!parsed.username) return null;
    return `Sentry sentry_version=7, sentry_key=${parsed.username}, sentry_client=renkoo-lite-backend/1.0`;
  } catch {
    return null;
  }
}

export function captureBackendError(
  error: unknown,
  context?: { method?: string; url?: string; status?: number; requestId?: string },
): void {
  const dsn = getDsn();
  if (!dsn) return;
  const storeUrl = sentryStoreUrl(dsn);
  const auth = sentryAuth(dsn);
  if (!storeUrl || !auth) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    platform: 'node',
    environment: getEnvironment(),
    level: 'error',
    logger: 'renkoo-backend',
    message: String(err.message || 'Unknown backend error').slice(0, 500),
    request: context
      ? {
          method: (context.method || '').slice(0, 16),
          url: sanitizePath(context.url || ''),
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
          type: String(err.name || 'Error').slice(0, 100),
          value: String(err.message || String(error)).slice(0, 500),
        },
      ],
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    void fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': auth,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timeout));
  } catch {
    // Monitoring must never crash the API.
  }
}

let handlersInstalled = false;

export function installBackendErrorHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('uncaughtException', (error) => {
    try {
      logger.error(
        `Uncaught exception: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      captureBackendError(error, { method: 'process', url: 'uncaughtException' });
    } catch {
      // never throw from handler
    }
  });

  process.on('unhandledRejection', (reason) => {
    try {
      const message =
        reason instanceof Error ? reason.message : String(reason);
      logger.error(
        `Unhandled rejection: ${message}`,
        reason instanceof Error ? reason.stack : undefined,
      );
      captureBackendError(reason, {
        method: 'process',
        url: 'unhandledRejection',
      });
    } catch {
      // never throw from handler
    }
  });
}
