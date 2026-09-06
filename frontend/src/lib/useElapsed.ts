'use client';

/*
 * Elapsed-seconds counter for long synchronous
 * operations (crawl/audit). Honest wall-clock
 * display only — it never implies staged backend
 * progress that does not exist.
 */

import {
  useEffect,
  useState,
} from 'react';

export function useElapsed(
  active: boolean,
) {
  const [seconds, setSeconds] =
    useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }

    const startedAt = Date.now();

    setSeconds(0);

    const timer = setInterval(() => {
      setSeconds(
        Math.floor(
          (Date.now() - startedAt) / 1000,
        ),
      );
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  return seconds;
}
