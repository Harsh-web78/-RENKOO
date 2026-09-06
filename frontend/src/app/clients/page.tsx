'use client';

import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  ConfirmDialog,
  DataTable,
  Drawer,
  DrawerMeta,
  DrawerSection,
  StatusBadge,
  type DataTableColumn,
} from '@/components/ui';
import {
  assignClientWebsite,
  askAgency,
  createClient,
  deleteClient,
  getCommandCenter,
  getWebsites,
  listClients,
  updateClient,
  AgencyAnswer,
  AgencyClient,
  CommandCenterEntry,
  Website,
} from '@/lib/api';

const AGENCY_QUESTIONS = [
  'Which client needs attention first?',
  'Which client has the biggest opportunity?',
  'What changed across my clients?',
  'Which reports need to be sent?',
];

export default function ClientsPage() {
  const [open, setOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [entries, setEntries] = useState<CommandCenterEntry[]>([]);
  const [stats, setStats] = useState({
    totalWebsites: 0,
    needingAttention: 0,
    missingData: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    notes: '',
  });
  const [assignMap, setAssignMap] = useState<
    Record<string, string>
  >({});
  const [agencyAnswer, setAgencyAnswer] =
    useState<AgencyAnswer | null>(null);
  const [askingAgency, setAskingAgency] =
    useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<AgencyClient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(
    null,
  );
  const [drawerClientId, setDrawerClientId] = useState<
    string | null
  >(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [sites, clientData, center] = await Promise.all([
        getWebsites(),
        listClients().catch(() => ({
          total: 0,
          clients: [],
        })),
        getCommandCenter().catch(() => null),
      ]);

      setWebsites(Array.isArray(sites) ? sites : []);
      setClients(clientData.clients);

      if (center) {
        setEntries(center.entries);
        setStats({
          totalWebsites: center.totalWebsites,
          needingAttention: center.needingAttention,
          missingData: center.missingData,
        });
      }
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load agency data.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleCreate() {
    if (loading) return;
    if (!form.name.trim()) {
      setError('Client name is required.');
      return;
    }

    try {
      setError('');
      const client = await createClient({
        name: form.name.trim(),
        company: form.company.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      setClients((prev) => [client, ...prev]);
      setForm({
        name: '',
        company: '',
        email: '',
        notes: '',
      });
    } catch (err: any) {
      setError(
        err?.message || 'Failed to create client.',
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      await deleteClient(deleteTarget.id);
      const id = deleteTarget.id;
      setClients((prev) =>
        prev.filter((item) => item.id !== id),
      );
      if (drawerClientId === id) {
        setDrawerClientId(null);
      }
      setDeleteTarget(null);
      void loadAll();
    } catch (err: any) {
      setDeleteError(
        err?.message || 'Failed to delete client.',
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleStatus(client: AgencyClient) {
    try {
      const updated = await updateClient(client.id, {
        status:
          client.status === 'ACTIVE'
            ? 'ARCHIVED'
            : 'ACTIVE',
      });

      setClients((prev) =>
        prev.map((item) =>
          item.id === client.id ? updated : item,
        ),
      );
    } catch (err: any) {
      setError(
        err?.message || 'Failed to update client.',
      );
    }
  }

  async function handleAgencyQuestion(
    question: string,
  ) {
    if (askingAgency) return;

    try {
      setAskingAgency(true);
      setError('');

      const answer = await askAgency(question);
      setAgencyAnswer(answer);
    } catch (err: any) {
      setError(
        err?.message || 'Agency question failed.',
      );
    } finally {
      setAskingAgency(false);
    }
  }

  async function handleAssign(
    websiteId: string,
    clientId: string,
  ) {
    try {
      setError('');
      await assignClientWebsite(
        websiteId,
        clientId || null,
      );
      await loadAll();
    } catch (err: any) {
      setError(
        err?.message || 'Failed to assign website.',
      );
    }
  }

  function entriesForClient(
    clientId: string,
  ): CommandCenterEntry[] {
    return entries.filter(
      (entry) => entry.client?.id === clientId,
    );
  }

  function websitesForClient(client: AgencyClient): Array<{
    id: string;
    name: string;
    url: string;
  }> {
    const map = new Map<
      string,
      { id: string; name: string; url: string }
    >();
    for (const site of client.websites ?? []) {
      map.set(site.id, {
        id: site.id,
        name: site.name,
        url: site.url,
      });
    }
    for (const entry of entriesForClient(client.id)) {
      if (!map.has(entry.website.id)) {
        map.set(entry.website.id, { ...entry.website });
      }
    }
    for (const site of websites) {
      if (site.clientId === client.id && !map.has(site.id)) {
        map.set(site.id, {
          id: site.id,
          name: site.name,
          url: site.url,
        });
      }
    }
    return [...map.values()];
  }

  function signalsForClient(client: AgencyClient): {
    high: number;
    actions: number;
    alerts: number;
    missing: boolean;
    latest: CommandCenterEntry['latestReport'];
  } {
    const related = entriesForClient(client.id);
    let latest: CommandCenterEntry['latestReport'] = null;
    let high = 0;
    let actions = 0;
    let alerts = 0;
    let missing = false;
    for (const entry of related) {
      high += entry.highOpportunities;
      actions += entry.openActions;
      alerts += entry.activeAlerts;
      if (entry.missingData) missing = true;
      if (
        entry.latestReport &&
        (!latest ||
          entry.latestReport.createdAt >
            latest.createdAt)
      ) {
        latest = entry.latestReport;
      }
    }
    return { high, actions, alerts, missing, latest };
  }

  function attentionOf(client: AgencyClient): string {
    const sites = websitesForClient(client);
    const signals = signalsForClient(client);
    if (sites.length === 0) return 'NO WEBSITES';
    if (signals.missing) return 'NEEDS DATA';
    if (
      signals.high > 0 ||
      signals.actions > 0 ||
      signals.alerts > 0
    ) {
      return 'NEEDS ATTENTION';
    }
    return 'STABLE';
  }

  const drawerClient = drawerClientId
    ? (clients.find(
        (client) => client.id === drawerClientId,
      ) ?? null)
    : null;

  const clientColumns: DataTableColumn<AgencyClient>[] = [
    {
      key: 'client',
      label: 'Client',
      priority: 'high',
      render: (client) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-rk-ink">
            {client.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-rk-muted">
            {client.company || client.email || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'attention',
      label: 'Attention',
      priority: 'high',
      render: (client) => (
        <StatusBadge status={attentionOf(client)} />
      ),
    },
    {
      key: 'websites',
      label: 'Websites',
      priority: 'medium',
      render: (client) => (
        <span className="text-sm font-bold tabular-nums text-rk-ink">
          {websitesForClient(client).length}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      priority: 'medium',
      render: (client) => (
        <span className="text-sm tabular-nums text-rk-secondary">
          <b className="text-rk-ink">
            {signalsForClient(client).actions}
          </b>{' '}
          open
        </span>
      ),
    },
    {
      key: 'activity',
      label: 'Last activity',
      priority: 'low',
      render: (client) => {
        const latest = signalsForClient(client).latest;
        if (!latest) {
          return (
            <span className="text-xs text-rk-muted">—</span>
          );
        }
        return (
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-rk-ink">
              {latest.title}
            </div>
            <div className="mt-0.5 whitespace-nowrap text-[11px] text-rk-muted">
              {new Date(
                latest.createdAt,
              ).toLocaleDateString()}
            </div>
          </div>
        );
      },
    },
  ];

  function renderClientExpanded(client: AgencyClient) {
    const sites = websitesForClient(client);
    const signals = signalsForClient(client);
    return (
      <div className="space-y-1 text-xs leading-5 text-rk-secondary">
        <p>
          <b className="text-rk-ink">Websites:</b>{' '}
          {sites.length > 0
            ? sites.map((site) => site.name).join(' · ')
            : 'None assigned'}
        </p>
        <p>
          <b className="text-rk-ink">Signals:</b>{' '}
          {signals.high} high · {signals.actions} open
          actions · {signals.alerts} alerts
          {signals.missing ? ' · missing crawl data' : ''}
        </p>
        <p className="text-rk-muted">
          Select the row for the full detail view.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar mobileOpen={open} onClose={() => setOpen(false)} />
      <main className="lg:pl-[270px]">
        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Agency OS
            </div>
            <h1 className="mt-1 text-3xl font-bold">
              Clients & Command Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Which workspaces need attention, and which client
              owns each website. No cross-client data ever
              leaves its workspace.
            </p>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading agency data...
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Websites"
                  value={stats.totalWebsites}
                  hint="Active workspaces"
                />
                <StatCard
                  label="Needing attention"
                  value={stats.needingAttention}
                  hint="Open highs, actions, alerts"
                  alert={stats.needingAttention > 0}
                />
                <StatCard
                  label="Missing crawl data"
                  value={stats.missingData}
                  hint="No completed crawl"
                />
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold">
                  Ask across clients
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AGENCY_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={askingAgency}
                      onClick={() =>
                        handleAgencyQuestion(question)
                      }
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-900 disabled:opacity-60"
                    >
                      {question}
                    </button>
                  ))}
                </div>

                {askingAgency && (
                  <p className="mt-3 text-xs text-slate-400">
                    Reading organization records...
                  </p>
                )}

                {agencyAnswer && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {agencyAnswer.confidence} confidence ·{' '}
                      deterministic
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800">
                      {agencyAnswer.answer}
                    </p>
                    {agencyAnswer.evidence.length >
                      0 && (
                      <ul className="mt-2 space-y-1">
                        {agencyAnswer.evidence
                          .slice(0, 5)
                          .map((item, i) => (
                            <li
                              key={i}
                              className="text-xs text-slate-500"
                            >
                              · {item.entity || item.metric}
                              {item.value != null
                                ? ` — ${item.value}`
                                : ''}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-bold">
                    Attention queue
                  </h2>
                </div>

                {entries.length === 0 ? (
                  <p className="p-6 text-sm text-slate-400">
                    No websites yet.{' '}
                    <Link
                      href="/onboarding"
                      className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    >
                      Add a website in onboarding
                    </Link>{' '}
                    to begin.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <div
                        key={entry.website.id}
                        className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold">
                              {entry.website.name}
                            </span>
                            {entry.client ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                {entry.client.name}
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                                UNASSIGNED
                              </span>
                            )}
                            {entry.missingData && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                NO CRAWL DATA
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">
                            {entry.website.url}
                            {entry.latestReport &&
                              ` · latest report: ${entry.latestReport.title}`}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                          <span>
                            <b className="text-slate-900">
                              {entry.highOpportunities}
                            </b>{' '}
                            high
                          </span>
                          <span>
                            <b className="text-slate-900">
                              {entry.openActions}
                            </b>{' '}
                            actions
                          </span>
                          <span>
                            <b className="text-slate-900">
                              {entry.activeAlerts}
                            </b>{' '}
                            alerts
                          </span>
                          <select
                            value={
                              assignMap[entry.website.id] ??
                              entry.client?.id ??
                              ''
                            }
                            onChange={(e) => {
                              const value =
                                e.target.value;
                              setAssignMap((prev) => ({
                                ...prev,
                                [entry.website.id]:
                                  value,
                              }));
                              void handleAssign(
                                entry.website.id,
                                value,
                              );
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold outline-none"
                          >
                            <option value="">
                              No client
                            </option>
                            {clients
                              .filter(
                                (client) =>
                                  client.status ===
                                  'ACTIVE',
                              )
                              .map((client) => (
                                <option
                                  key={client.id}
                                  value={client.id}
                                >
                                  {client.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-bold">
                    New client
                  </h2>
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-semibold text-slate-600">
                      Client name
                      <input
                        value={form.name}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Client name *"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Company
                      <input
                        value={form.company}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            company: e.target.value,
                          }))
                        }
                        placeholder="Company (optional)"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Email
                      <input
                        value={form.email}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        placeholder="Email (optional)"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      Internal notes
                      <textarea
                        value={form.notes}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        placeholder="Internal notes (never shared with clients)"
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={loading}
                      className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {loading ? 'Adding…' : 'Add client'}
                    </button>
                    <p className="text-[11px] leading-4 text-slate-400">
                      Notes stay internal — shared reports never
                      include them.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="text-sm font-bold">
                      Clients ({clients.length})
                    </h2>
                  </div>

                  <div className="p-4">
                    <DataTable<AgencyClient>
                      caption="Clients"
                      columns={clientColumns}
                      rows={clients}
                      keyOf={(client) => client.id}
                      emptyTitle="No clients yet"
                      emptyDescription="Freelancers can skip clients and work per-website; agencies add one per customer."
                      emptyActionLabel="Open onboarding"
                      emptyActionHref="/onboarding"
                      onRowClick={(client) =>
                        setDrawerClientId(client.id)
                      }
                      renderExpanded={renderClientExpanded}
                      rowActions={(client) => [
                        {
                          label: 'Details',
                          onSelect: () =>
                            setDrawerClientId(client.id),
                        },
                        {
                          label:
                            client.status === 'ACTIVE'
                              ? 'Archive'
                              : 'Restore',
                          onSelect: () =>
                            handleToggleStatus(client),
                        },
                        {
                          label: 'Delete',
                          onSelect: () => {
                            setDeleteError(null);
                            setDeleteTarget(client);
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {websites.filter((site) => !site.clientId)
                .length > 0 && (
                <p className="mt-4 text-xs text-slate-400">
                  {
                    websites.filter(
                      (site) => !site.clientId,
                    ).length
                  }{' '}
                  websites are unassigned — assign them from the
                  attention queue above.
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <Drawer
        open={drawerClient !== null}
        onClose={() => setDrawerClientId(null)}
        eyebrow="Client detail"
        title={drawerClient?.name ?? 'Client'}
        description={
          drawerClient
            ? `${drawerClient.company || 'No company'} · ${drawerClient.status}`
            : undefined
        }
      >
        {drawerClient ? (
          <ClientDetailBody
            client={drawerClient}
            sites={websitesForClient(drawerClient)}
            related={entriesForClient(drawerClient.id)}
            signals={signalsForClient(drawerClient)}
            unassigned={websites.filter(
              (site) => !site.clientId,
            )}
            onAssign={(websiteId, clientId) =>
              handleAssign(websiteId, clientId)
            }
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this client?"
        description={`"${deleteTarget?.name || ''}" will be removed. Websites stay untouched and become unassigned. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        confirming={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      />
    </div>
  );
}

function ClientDetailBody({
  client,
  sites,
  related,
  signals,
  unassigned,
  onAssign,
}: {
  client: AgencyClient;
  sites: Array<{ id: string; name: string; url: string }>;
  related: CommandCenterEntry[];
  signals: {
    high: number;
    actions: number;
    alerts: number;
    missing: boolean;
    latest: CommandCenterEntry['latestReport'];
  };
  unassigned: Website[];
  onAssign: (websiteId: string, clientId: string) => void;
}) {
  const recentReports = related
    .filter((entry) => entry.latestReport)
    .map((entry) => entry.latestReport!)
    .sort((a, b) =>
      String(b.createdAt).localeCompare(
        String(a.createdAt),
      ),
    )
    .slice(0, 5);

  return (
    <div>
      <DrawerSection title="Identity">
        <DrawerMeta
          items={[
            { label: 'Company', value: client.company || '—' },
            { label: 'Email', value: client.email || '—' },
            {
              label: 'Status',
              value: <StatusBadge status={client.status} />,
            },
            {
              label: 'Websites',
              value: String(sites.length),
            },
            {
              label: 'Reports',
              value:
                client.reportCount != null
                  ? String(client.reportCount)
                  : '—',
            },
            {
              label: 'Created',
              value: client.createdAt
                ? new Date(
                    client.createdAt,
                  ).toLocaleDateString()
                : '—',
            },
          ]}
        />
        {client.notes ? (
          <p className="mt-2 text-xs leading-5 text-rk-secondary">
            <b className="text-rk-ink">Internal notes:</b>{' '}
            {client.notes}
          </p>
        ) : null}
      </DrawerSection>

      <DrawerSection title="Assigned websites">
        {sites.length === 0 ? (
          <p className="text-xs text-rk-muted">
            No websites assigned yet.{' '}
            <Link
              href="/onboarding"
              className="font-semibold text-rk-ink underline underline-offset-2"
            >
              Add a website in onboarding
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => {
              const entry = related.find(
                (item) => item.website.id === site.id,
              );
              return (
                <li
                  key={site.id}
                  className="rounded-rk-md border border-rk-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-rk-ink">
                        {site.name}
                      </div>
                      <div className="truncate text-[11px] text-rk-muted">
                        {site.url}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAssign(site.id, '')}
                      className="rk-focusable shrink-0 rounded-rk-sm border border-rk-border px-2 py-1 text-[11px] font-bold text-rk-secondary hover:text-rk-ink"
                    >
                      Unassign
                    </button>
                  </div>
                  {entry ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-rk-secondary">
                      <span>
                        <b className="text-rk-ink">
                          {entry.highOpportunities}
                        </b>{' '}
                        high
                      </span>
                      <span>
                        <b className="text-rk-ink">
                          {entry.openActions}
                        </b>{' '}
                        actions
                      </span>
                      <span>
                        <b className="text-rk-ink">
                          {entry.activeAlerts}
                        </b>{' '}
                        alerts
                      </span>
                      {entry.missingData ? (
                        <Badge
                          label="No crawl data"
                          tone="warning"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-rk-muted">
                      No Command Center signals recorded.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {unassigned.length > 0 ? (
          <label className="mt-3 block">
            <span className="rk-field-label">
              Assign an unassigned website
            </span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onAssign(e.target.value, client.id);
                }
              }}
              className="input mt-1"
            >
              <option value="">Select website…</option>
              {unassigned.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </DrawerSection>

      <DrawerSection title="Growth signals">
        {related.length === 0 ? (
          <p className="text-xs text-rk-muted">
            No Command Center signals for this client yet.
          </p>
        ) : (
          <div className="space-y-1 text-xs leading-5 text-rk-secondary">
            <p>
              <b className="text-rk-ink">
                {signals.high} high opportunities
              </b>{' '}
              · {signals.actions} open actions ·{' '}
              {signals.alerts} active alerts
              {signals.missing
                ? ' · some websites are missing crawl data'
                : ''}
              .
            </p>
            <ul className="mt-1 space-y-1">
              {related.map((entry) => (
                <li key={entry.website.id}>
                  · <b>{entry.website.name}</b> —{' '}
                  {entry.highOpportunities} high,{' '}
                  {entry.openActions} actions,{' '}
                  {entry.activeAlerts} alerts
                  {entry.missingData
                    ? ' (no crawl data)'
                    : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Recent reports">
        {recentReports.length === 0 ? (
          <p className="text-xs text-rk-muted">
            No reports recorded for this client&apos;s
            websites yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentReports.map((report) => (
              <li
                key={report.id}
                className="text-xs leading-5 text-rk-secondary"
              >
                <span className="font-bold text-rk-ink">
                  {report.title}
                </span>{' '}
                · {report.type.replace(/_/g, ' ')} ·{' '}
                {new Date(
                  report.createdAt,
                ).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: number;
  hint: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {alert && (
          <span className="h-2 w-2 rounded-full bg-slate-900" />
        )}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-slate-400">
        {hint}
      </div>
    </div>
  );
}
