'use client';

/*
 * RENKOO — Clients & Command Center (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / Metric / FilterBar /
 * DataTable / badges / Drawer / ConfirmDialog / buttons /
 * states. All client CRUD, website assignment, agency Q&A,
 * Command Center data handling, drawers, forms, validation
 * and business logic are unchanged.
 */

import AppShell from '@/components/AppShell';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  ConfirmDialog,
  DataTable,
  Drawer,
  DrawerMeta,
  DrawerSection,
  EmptyState,
  FilterBar,
  LoadingBlock,
  Metric,
  PageHeader,
  Panel,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  type DataTableColumn,
} from '@/components/ui';
import { RefreshCw, Plus, X, AlertTriangle } from 'lucide-react';
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
  const [clientSearch, setClientSearch] = useState('');
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

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      `${client.name || ''} ${client.company || ''} ${client.email || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [clients, clientSearch]);

  const unassignedCount = useMemo(
    () => websites.filter((site) => !site.clientId).length,
    [websites],
  );

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
          <div className="rk-metadata mt-0.5 truncate">
            {client.company || client.email || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'websites',
      label: 'Websites',
      priority: 'high',
      render: (client) => (
        <span className="rk-number text-sm font-bold text-rk-ink">
          {websitesForClient(client).length}
        </span>
      ),
    },
    {
      key: 'attention',
      label: 'Status',
      priority: 'high',
      render: (client) => (
        <StatusBadge status={attentionOf(client)} />
      ),
    },
    {
      key: 'activity',
      label: 'Last activity',
      priority: 'medium',
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
            <div className="rk-metadata mt-0.5 whitespace-nowrap">
              {new Date(
                latest.createdAt,
              ).toLocaleDateString()}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      priority: 'low',
      align: 'right',
      render: (client) => (
        <span className="rk-number text-sm text-rk-secondary">
          <b className="text-rk-ink">
            {signalsForClient(client).actions}
          </b>{' '}
          open
        </span>
      ),
    },
  ];

  function renderClientExpanded(client: AgencyClient) {
    const sites = websitesForClient(client);
    const signals = signalsForClient(client);
    return (
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="rk-field-label">Websites</dt>
          <dd className="mt-0.5 font-medium text-rk-ink">
            {sites.length > 0
              ? sites.map((site) => site.name).join(' · ')
              : 'None assigned'}
          </dd>
        </div>
        <div>
          <dt className="rk-field-label">Signals</dt>
          <dd className="mt-0.5 font-medium text-rk-ink">
            {signals.high} high · {signals.actions} open
            actions · {signals.alerts} alerts
            {signals.missing ? ' · missing crawl data' : ''}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dd className="rk-metadata">
            Open details for the full client workspace.
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Agency OS"
          title="Clients & Command Center"
          description="Which workspaces need attention, and which client owns each website. No cross-client data ever leaves its workspace."
          meta={
            <>
              <span>
                {clients.length} clients · {websites.length}{' '}
                websites
              </span>
              <span aria-hidden>·</span>
              <span>
                {stats.needingAttention} needing attention
              </span>
            </>
          }
          actions={
            <SecondaryButton
              onClick={() => void loadAll()}
              disabled={loading}
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </SecondaryButton>
          }
        />

        {error ? (
          <div className="mt-4">
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-rk-md border border-rk-danger/30 bg-rk-dangerSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-danger"
            >
              <AlertTriangle
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
                className="rk-focusable grid h-7 w-7 shrink-0 place-items-center rounded-rk-sm hover:bg-rk-danger/10"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4">
            <LoadingBlock title="Loading agency data…" lines={5} />
          </div>
        ) : (
          <>
            <section aria-label="Agency metrics" className="mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  What needs attention?
                </h2>
                <p className="rk-metadata hidden sm:block">
                  Across all client workspaces
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="Websites"
                    value={String(stats.totalWebsites)}
                    detail="Active workspaces"
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="Needing attention"
                    value={String(stats.needingAttention)}
                    detail="Open highs, actions, alerts"
                    tone={
                      stats.needingAttention > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="Missing crawl data"
                    value={String(stats.missingData)}
                    detail="No completed crawl"
                  />
                </div>
              </div>
            </section>

            <div className="mt-6">
              <Panel
                eyebrow="Agency intelligence"
                title="Ask across clients"
                description="Deterministic answers from organization records — never invented."
              >
                <div className="flex flex-wrap gap-2">
                  {AGENCY_QUESTIONS.map((question) => (
                    <SecondaryButton
                      key={question}
                      size="sm"
                      disabled={askingAgency}
                      onClick={() =>
                        void handleAgencyQuestion(question)
                      }
                    >
                      {question}
                    </SecondaryButton>
                  ))}
                </div>

                {askingAgency && (
                  <p className="rk-metadata mt-3">
                    Reading organization records…
                  </p>
                )}

                {agencyAnswer && (
                  <div className="mt-4 rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <p className="rk-field-label">
                      {agencyAnswer.confidence} confidence ·
                      deterministic
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-rk-ink">
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
                              className="rk-metadata"
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
              </Panel>
            </div>

            <div className="mt-6">
              <Panel
                eyebrow="Attention queue"
                title="Websites by signal"
                description="Assign every website to the client that owns it."
                footer={
                  unassignedCount > 0 ? (
                    <span>
                      <strong className="text-rk-ink">
                        {unassignedCount} unassigned
                      </strong>{' '}
                      — assign them from the table below.
                    </span>
                  ) : undefined
                }
                padded={false}
              >
                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Attention queue"
                    columns={[
                      {
                        key: 'website',
                        label: 'Website',
                        priority: 'high',
                        render: (entry: CommandCenterEntry) => (
                          <span className="block min-w-0">
                            <span className="block truncate font-bold text-rk-ink">
                              {entry.website.name}
                            </span>
                            <span className="rk-metadata mt-0.5 block truncate">
                              {entry.website.url}
                              {entry.latestReport &&
                                ` · ${entry.latestReport.title}`}
                            </span>
                          </span>
                        ),
                      },
                      {
                        key: 'client',
                        label: 'Client',
                        priority: 'high',
                        render: (entry: CommandCenterEntry) =>
                          entry.client ? (
                            <Badge
                              label={entry.client.name}
                              tone="info"
                            />
                          ) : (
                            <Badge
                              label="Unassigned"
                              tone="neutral"
                            />
                          ),
                      },
                      {
                        key: 'signals',
                        label: 'Signals',
                        priority: 'medium',
                        render: (entry: CommandCenterEntry) => (
                          <span className="rk-number whitespace-nowrap text-[13px] text-rk-secondary">
                            <b className="text-rk-ink">
                              {entry.highOpportunities}
                            </b>{' '}
                            high ·{' '}
                            <b className="text-rk-ink">
                              {entry.openActions}
                            </b>{' '}
                            actions ·{' '}
                            <b className="text-rk-ink">
                              {entry.activeAlerts}
                            </b>{' '}
                            alerts
                            {entry.missingData ? (
                              <>
                                {' '}·{' '}
                                <Badge
                                  label="No crawl data"
                                  tone="warning"
                                />
                              </>
                            ) : null}
                          </span>
                        ),
                      },
                      {
                        key: 'assign',
                        label: 'Assign',
                        priority: 'medium',
                        render: (entry: CommandCenterEntry) => (
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
                            aria-label={`Assign ${entry.website.name} to a client`}
                            className="rk-input w-auto"
                            onClick={(e) =>
                              e.stopPropagation()
                            }
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
                        ),
                      },
                    ]}
                    rows={entries}
                    keyOf={(entry) => entry.website.id}
                    emptyTitle="No websites yet"
                    emptyDescription="Add a website in onboarding to begin."
                    emptyActionLabel="Open onboarding"
                    emptyActionHref="/onboarding"
                    pageSize={8}
                  />
                </div>
              </Panel>
            </div>

            <div className="mt-6">
              <FilterBar
                searchValue={clientSearch}
                searchPlaceholder="Search clients…"
                onSearchChange={setClientSearch}
                meta={
                  filteredClients.length !== clients.length
                    ? `Showing ${filteredClients.length} of ${clients.length} clients`
                    : `${clients.length} clients`
                }
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
              <Panel
                eyebrow="New client"
                title="Add a client"
                description="Notes stay internal — shared reports never include them."
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="rk-field-label">
                      Client name
                    </span>
                    <input
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Client name *"
                      className="rk-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="rk-field-label">
                      Company
                    </span>
                    <input
                      value={form.company}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          company: e.target.value,
                        }))
                      }
                      placeholder="Company (optional)"
                      className="rk-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="rk-field-label">
                      Email
                    </span>
                    <input
                      value={form.email}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      placeholder="Email (optional)"
                      className="rk-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="rk-field-label">
                      Internal notes
                    </span>
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
                      className="rk-input mt-1.5 resize-y"
                    />
                  </label>
                  <PrimaryButton
                    onClick={() => void handleCreate()}
                    disabled={loading}
                    className="w-full"
                  >
                    <Plus size={14} aria-hidden />
                    {loading ? 'Adding…' : 'Add client'}
                  </PrimaryButton>
                </div>
              </Panel>

              <Panel
                eyebrow="Clients"
                title={`All clients (${filteredClients.length})`}
                description="Expand a row for lightweight signals. Open details for the full client workspace."
                padded={false}
              >
                <div className="px-2 py-2 sm:px-3">
                  <DataTable<AgencyClient>
                    caption="Clients"
                    columns={clientColumns}
                    rows={filteredClients}
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
                          void handleToggleStatus(client),
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
              </Panel>
            </div>
          </>
        )}
      </div>

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
              void handleAssign(websiteId, clientId)
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
    </AppShell>
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
          <EmptyState
            title="No websites assigned yet"
            description="Assign a website from the attention queue, or add one in onboarding."
            actionLabel="Open onboarding"
            actionHref="/onboarding"
          />
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => {
              const entry = related.find(
                (item) => item.website.id === site.id,
              );
              return (
                <li
                  key={site.id}
                  className="rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-rk-ink">
                        {site.name}
                      </div>
                      <div className="rk-technical-value mt-0.5 truncate !text-rk-muted">
                        {site.url}
                      </div>
                    </div>
                    <SecondaryButton
                      size="sm"
                      onClick={() => onAssign(site.id, '')}
                    >
                      Unassign
                    </SecondaryButton>
                  </div>
                  {entry ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-rk-secondary">
                      <span>
                        <b className="rk-number text-rk-ink">
                          {entry.highOpportunities}
                        </b>{' '}
                        high
                      </span>
                      <span>
                        <b className="rk-number text-rk-ink">
                          {entry.openActions}
                        </b>{' '}
                        actions
                      </span>
                      <span>
                        <b className="rk-number text-rk-ink">
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
                    <p className="rk-metadata mt-1">
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
              className="rk-input mt-1.5"
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
          <p className="rk-metadata">
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
          <p className="rk-metadata">
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
