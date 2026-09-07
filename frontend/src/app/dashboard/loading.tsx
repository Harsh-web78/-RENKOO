/*
 * Dashboard route fallback. Shown during
 * dashboard navigation while the client shell
 * mounts and the first data wave resolves —
 * real sections still load their own data and
 * errors below; this never fakes content.
 */
export default function DashboardLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading dashboard"
      className="space-y-6 p-6"
    >
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}
