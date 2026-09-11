'use client';

/*
 * RENKOO — Product Tour 1.0 mount point.
 *
 * Loaded via next/dynamic (ssr:false) from the root
 * layout, inside AuthGate. The dynamic import keeps
 * tour code out of the initial login bundle; the
 * provider itself renders nothing until a welcome,
 * resume or active-tour state exists.
 */

import TourProvider from './TourProvider';

export default function TourRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TourProvider>{children}</TourProvider>;
}
