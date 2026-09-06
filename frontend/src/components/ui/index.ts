/*
 * RENKOO V2 — shared UI barrel.
 * Pages import from '@/components/ui' and never duplicate
 * these patterns locally.
 */

export { default as PageHeader } from './PageHeader';
export { default as Panel } from './Panel';
export { default as Metric } from './Metric';
export { default as DataTable } from './DataTable';
export type {
  DataTableColumn,
  DataTableSort,
  DataTableError,
  DataTableNotice,
  DataTableNoticeKind,
} from './DataTable';
export { default as FilterBar } from './FilterBar';
export type {
  FilterOption,
  FilterSelect,
  FilterMultiSelect,
  FilterDateRange,
} from './FilterBar';
export { default as Drawer } from './Drawer';
export {
  DrawerSection,
  DrawerMeta,
  DrawerFooter,
} from './Drawer';
export type { DrawerState } from './Drawer';
export { default as ConfirmDialog } from './ConfirmDialog';
export {
  Button,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  DangerButton,
} from './buttons';
export {
  SeverityChip,
  PriorityChip,
  StatusChip,
  ScoreBadge,
} from './chips';
export {
  Badge,
  StatusBadge,
  DataSourceBadge,
  PersonaBadge,
  WorkflowBadge,
  AiBadge,
  FreshnessBadge,
} from './badge';
export {
  LoadingBlock,
  ErrorState,
  EmptyState,
  UnavailableState,
  InsufficientHistoryState,
  LimitReachedState,
  PartialDataState,
  NotConnectedState,
} from './states';
export type { DataStateTone } from './states';
export {
  InsightBlock,
  ChangeIndicator,
  EvidenceList,
  ConfidenceIndicator,
  RecommendationCallout,
  NextAction,
} from './insights';
