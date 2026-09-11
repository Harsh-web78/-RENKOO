/*
 * RENKOO — Product Tour 1.0 event names.
 *
 * Zero-dependency module so restart entries
 * (Topbar, Settings) can signal the lazily loaded
 * tour engine without pulling it into their bundle.
 */

export const TOUR_RESTART_EVENT =
  'renkoo:tour-restart';
export const TOUR_DISCOVERY_EVENT =
  'renkoo:tour-discovery';
