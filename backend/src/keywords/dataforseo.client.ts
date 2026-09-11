import { Logger } from '@nestjs/common';

/*
 * =========================================================
 * DATAFORSEO LOW-LEVEL CLIENT (server-only)
 *
 * Credentials come from DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD
 * and never leave the backend: no secret is logged, returned
 * to callers, or included in error payloads. Only provider
 * status codes + safe status messages are surfaced.
 *
 * Resilience contract (Phase 5 / Phase 24):
 *  - per-request timeout via AbortController (default 25s)
 *  - retries with exponential backoff + jitter on 429/5xx
 *    and network failures only (never on 401/402)
 *  - bounded concurrency for batch fan-out (mapLimit)
 *  - per-task status is preserved so callers can merge
 *    partial successes instead of failing whole requests
 * =========================================================
 */

export type DataForSeoErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INVALID_PROVIDER_KEY'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR';

export class DataForSeoError extends Error {
  readonly code: DataForSeoErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    code: DataForSeoErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

export interface DataForSeoTaskEnvelope {
  id: string;
  status_code: number;
  status_message: string;
  result: any[] | null;
  cost?: number;
}

/*
 * Phase 40 — provider-call telemetry sink (metering
 * only, no behavior change). Recorded once per
 * postLive terminal outcome (retries never double
 * count). The sink is registered by the telemetry
 * owner; without registration nothing is recorded
 * and nothing else changes. No credentials, no PII,
 * no request bodies — operation, counts, success,
 * vendor-reported cost only.
 */
export interface ProviderCallRecord {
  provider: 'DATAFORSEO';
  operation: string;
  taskCount: number;
  success: boolean;
  errorCode: string | null;
  vendorCost: number | null;
}

let telemetrySink: ((record: ProviderCallRecord) => void) | null =
  null;

export function setProviderTelemetrySink(
  sink: ((record: ProviderCallRecord) => void) | null,
): void {
  telemetrySink = sink;
}

function emitProviderTelemetry(
  record: ProviderCallRecord,
): void {
  try {
    telemetrySink?.(record);
  } catch {
    /* Telemetry must never break provider calls. */
  }
}

export interface DataForSeoConfig {
  login: string;
  password: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;

export function dataForSeoConfigFromEnv(): DataForSeoConfig | null {
  const login = (
    process.env.DATAFORSEO_LOGIN ?? ''
  ).trim();
  const password = (
    process.env.DATAFORSEO_PASSWORD ?? ''
  ).trim();

  if (!login || !password) return null;

  const sandbox =
    (process.env.DATAFORSEO_SANDBOX ?? '')
      .trim()
      .toLowerCase() === 'true';

  return {
    login,
    password,
    baseUrl: (
      process.env.DATAFORSEO_BASE_URL ??
      (sandbox
        ? 'https://sandbox.dataforseo.com'
        : 'https://api.dataforseo.com')
    ).replace(/\/+$/, ''),
    timeoutMs: Math.max(
      5000,
      Number(
        process.env.DATAFORSEO_TIMEOUT_MS ??
          DEFAULT_TIMEOUT_MS,
      ) || DEFAULT_TIMEOUT_MS,
    ),
    maxRetries: MAX_RETRIES,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

function backoffMs(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

function classifyStatus(
  statusCode: number,
  httpStatus?: number,
): DataForSeoErrorCode {
  /* DataForSEO task codes: 401xx auth, 402xx billing,
     429xx rate limit. HTTP 402 = payment, 429 = rate. */
  if (
    (statusCode >= 40100 &&
      statusCode <= 40199) ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return 'INVALID_PROVIDER_KEY';
  }
  if (
    (statusCode >= 40200 &&
      statusCode <= 40299) ||
    httpStatus === 402
  ) {
    return 'QUOTA_EXCEEDED';
  }
  if (
    (statusCode >= 42900 &&
      statusCode <= 42999) ||
    httpStatus === 429
  ) {
    return 'RATE_LIMITED';
  }
  return 'PROVIDER_ERROR';
}

export class DataForSeoClient {
  private readonly logger = new Logger(
    DataForSeoClient.name,
  );

  constructor(
    private readonly config: DataForSeoConfig,
  ) {}

  private authHeader(): string {
    /* Basic auth over HTTPS. The header value is never
       logged anywhere in this file. */
    return `Basic ${Buffer.from(
      `${this.config.login}:${this.config.password}`,
      'utf8',
    ).toString('base64')}`;
  }

  /*
   * POST one live task array. Returns per-task envelopes
   * with their own status codes — callers decide what a
   * partial failure means. Throws only when nothing usable
   * came back (transport failure, auth, billing, timeout).
   */
  async postLive(
    path: string,
    tasks: Record<string, unknown>[],
  ): Promise<{
    tasks: DataForSeoTaskEnvelope[];
    cost: number;
  }> {
    const url = `${this.config.baseUrl}${path}`;
    let lastError: unknown = null;

    for (
      let attempt = 0;
      attempt <= this.config.maxRetries;
      attempt++
    ) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: this.authHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tasks),
          signal: controller.signal as any,
        });

        clearTimeout(timer);

        if (
          res.status === 429 ||
          res.status >= 500
        ) {
          const retryable = true;
          lastError = new DataForSeoError(
            res.status === 429
              ? 'RATE_LIMITED'
              : 'PROVIDER_ERROR',
            `DataForSEO ${path} responded with HTTP ${res.status}`,
            {
              statusCode: res.status,
              retryable,
            },
          );
          if (
            attempt < this.config.maxRetries
          ) {
            await sleep(
              backoffMs(attempt),
            );
            continue;
          }
          throw lastError;
        }

        if (!res.ok) {
          throw new DataForSeoError(
            classifyStatus(0, res.status),
            `DataForSEO ${path} responded with HTTP ${res.status}`,
            {
              statusCode: res.status,
              retryable: false,
            },
          );
        }

        const body: any = await res.json();
        const envelopeTasks: any[] = Array.isArray(
          body?.tasks,
        )
          ? body.tasks
          : [];

        const code = Number(
          body?.status_code ?? 0,
        );
        if (
          code !== 20000 &&
          envelopeTasks.length === 0
        ) {
          throw new DataForSeoError(
            classifyStatus(code, res.status),
            `DataForSEO ${path}: ${String(body?.status_message ?? 'request failed').slice(0, 200)}`,
            {
              statusCode: code,
              retryable:
                code >= 42900 &&
                code <= 42999,
            },
          );
        }

        let cost = 0;
        const parsed: DataForSeoTaskEnvelope[] =
          envelopeTasks.map((t: any) => {
            cost += Number(t?.cost ?? 0);
            return {
              id: String(t?.id ?? ''),
              status_code: Number(
                t?.status_code ?? 0,
              ),
              status_message: String(
                t?.status_message ?? '',
              ).slice(0, 300),
              result: Array.isArray(t?.result)
                ? t.result
                : null,
              cost: Number(t?.cost ?? 0),
            };
          });

        emitProviderTelemetry({
          provider: 'DATAFORSEO',
          operation: path,
          taskCount: tasks.length,
          success: true,
          errorCode: null,
          vendorCost: cost,
        });
        return { tasks: parsed, cost };
      } catch (err: any) {
        clearTimeout(timer);
        if (err instanceof DataForSeoError) {
          if (
            err.retryable &&
            attempt < this.config.maxRetries
          ) {
            lastError = err;
            await sleep(backoffMs(attempt));
            continue;
          }
          emitProviderTelemetry({
            provider: 'DATAFORSEO',
            operation: path,
            taskCount: tasks.length,
            success: false,
            errorCode: err.code,
            vendorCost: null,
          });
          throw err;
        }
        const aborted =
          err?.name === 'AbortError';
        lastError = new DataForSeoError(
          aborted
            ? 'PROVIDER_TIMEOUT'
            : 'PROVIDER_ERROR',
          aborted
            ? `DataForSEO ${path} timed out after ${this.config.timeoutMs}ms`
            : `DataForSEO ${path} request failed: ${String(err?.message ?? err).slice(0, 200)}`,
          { retryable: true },
        );
        /* Network-level failures are always retried. */
        if (attempt < this.config.maxRetries) {
          this.logger.warn(
            `DataForSEO ${path} attempt ${attempt + 1} failed (${aborted ? 'timeout' : 'network'}), retrying`,
          );
          await sleep(backoffMs(attempt));
          continue;
        }
        emitProviderTelemetry({
          provider: 'DATAFORSEO',
          operation: path,
          taskCount: tasks.length,
          success: false,
          errorCode: aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
          vendorCost: null,
        });
        throw lastError;
      }
    }

    throw lastError;
  }
}

/*
 * Bounded-concurrency fan-out. At most `limit` promises
 * run at once; results keep input order; a single rejection
 * is captured per item so one failure never kills the batch.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<
  Array<{ ok: true; value: R } | { ok: false; error: unknown }>
> {
  const out: Array<
    | { ok: true; value: R }
    | { ok: false; error: unknown }
  > = new Array(items.length);

  let cursor = 0;
  const workers = new Array(
    Math.max(1, Math.min(limit, items.length)),
  )
    .fill(0)
    .map(async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          out[index] = {
            ok: true,
            value: await fn(items[index], index),
          };
        } catch (error) {
          out[index] = { ok: false, error };
        }
      }
    });

  await Promise.all(workers);
  return out;
}

export function chunk<T>(
  items: T[],
  size: number,
): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
