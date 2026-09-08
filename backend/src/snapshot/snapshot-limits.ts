/*
 * RENKOO public snapshot — in-memory abuse protection (no NestJS deps).
 *
 * IMPORTANT: in-memory limits reset when the backend restarts or
 * scales horizontally. This is deliberate for this phase (no Redis):
 * it bounds cost per instance but is NOT globally distributed
 * protection. The monthly budget is a fail-closed safety guard,
 * not precise accounting.
 */

export type SnapshotCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class SnapshotCache<T> {
  private readonly entries = new Map<
    string,
    SnapshotCacheEntry<T>
  >();
  private readonly inflight = new Map<
    string,
    Promise<unknown>
  >();

  get(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(
    key: string,
    value: T,
    ttlMs: number,
    now = Date.now(),
  ): void {
    if (ttlMs <= 0) return;
    this.entries.set(key, {
      value,
      expiresAt: now + ttlMs,
    });
    if (this.entries.size > 2000) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
  }

  /*
   * Stampede guard: concurrent callers for the same uncached
   * key share one execution instead of each spending provider
   * calls. Failures are never cached (short negative hold
   * only to avoid hot-loop retries within the same second).
   */
  async dedupe<R>(
    key: string,
    work: () => Promise<R>,
  ): Promise<R> {
    const running = this.inflight.get(key);
    if (running) {
      return running as Promise<R>;
    }

    const task = work();
    this.inflight.set(key, task);

    try {
      return await task;
    } finally {
      if (this.inflight.get(key) === task) {
        this.inflight.delete(key);
      }
    }
  }

  size(): number {
    return this.entries.size;
  }
}

export class WindowCounter {
  private readonly hits = new Map<
    string,
    number[]
  >();

  /*
   * Returns true when the hit is allowed (and records it),
   * false when the key already exhausted maxHits in windowMs.
   */
  allow(
    key: string,
    maxHits: number,
    windowMs: number,
    now = Date.now(),
  ): boolean {
    const cutoff = now - windowMs;
    const kept = (
      this.hits.get(key) ?? []
    ).filter((at) => at > cutoff);

    if (kept.length >= maxHits) {
      this.hits.set(key, kept);
      return false;
    }

    kept.push(now);
    this.hits.set(key, kept);

    if (this.hits.size > 5000) {
      const oldest = this.hits.keys().next();
      if (!oldest.done) {
        this.hits.delete(oldest.value);
      }
    }

    return true;
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/*
 * Snapshot-scoped call budget: races the provider promise
 * against a shorter deadline so anonymous requests can never
 * occupy resources for the full shared provider timeout.
 * The underlying provider call is left to settle on its own;
 * only the snapshot stops waiting. Never throws secrets.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null =
    null;

  const deadline = new Promise<never>(
    (_, reject) => {
      timer = setTimeout(() => {
        reject(
          new TimeoutError(
            `${label} timed out after ${ms}ms`,
          ),
        );
      }, ms);
      if (
        typeof timer === 'object' &&
        timer !== null &&
        'unref' in timer &&
        typeof (timer as any).unref ===
          'function'
      ) {
        (timer as any).unref();
      }
    },
  );

  return Promise.race([work, deadline]).finally(
    () => {
      if (timer) clearTimeout(timer);
    },
  );
}

export class MonthlyBudget {
  private monthKey = '';
  private used = 0;

  use(
    amount: number,
    budget: number,
    now = new Date(),
  ): boolean {
    const key = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;

    if (key !== this.monthKey) {
      this.monthKey = key;
      this.used = 0;
    }

    if (this.used + amount > budget) {
      return false;
    }

    this.used += amount;
    return true;
  }

  remaining(
    budget: number,
    now = new Date(),
  ): number {
    const key = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    if (key !== this.monthKey) return budget;
    return Math.max(0, budget - this.used);
  }
}
