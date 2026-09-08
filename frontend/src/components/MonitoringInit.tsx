'use client';

import { useEffect } from 'react';
import { initClientMonitoring } from '../lib/monitoring';

/*
 * Mounts once in the root layout. No-op when
 * NEXT_PUBLIC_SENTRY_DSN is missing, so local dev is unaffected.
 */
export default function MonitoringInit() {
  useEffect(() => {
    initClientMonitoring();
  }, []);

  return null;
}
