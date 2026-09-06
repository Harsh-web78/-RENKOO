'use client';

import Sidebar from '@/components/Sidebar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  executeWorkerRun,
  getWebsites,
  listWorkerAgents,
  listWorkerRuns,
  runWorkerAgent,
  Website,
  WorkerAgent,
  WorkerRun,
  WorkerTool,
} from '@/lib/api';

const QUICK_TASKS: Array<{
  label: string;
  agentId: string;
  input: string;
}> = [
  {
    label: 'Find my highest-impact technical issues',
    agentId: 'technical-seo',
    input: 'Find my highest-impact technical issues.',
  },
  {
    label: 'Find the biggest gaps against competitors',
    agentId: 'competitor-intel',
    input: 'Find the biggest gaps against my competitors.',
  },
  {
    label: 'Explain the most important changes',
    agentId: 'monitoring-analyst',
    input: 'Explain the most important changes.',
  },
  {
    label: 'What should I work on first?',
    agentId: 'growth-strategist',
    input: 'What should I work on first?',
  },
  {
    label: 'Find my biggest AI search gaps',
    agentId: 'ai-visibility',
    input: 'Find my biggest AI search gaps.',
  },
];

export default function WorkersPage() {
  const [open, setOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [agents, setAgents] = useState<WorkerAgent[]>([]);
  const [tools, setTools] = useState<WorkerTool[]>([]);
  const [futureTools, setFutureTools] = useState<
    Array<{ name: string; description: string }>
  >([]);
  const [runs, setRuns] = useState<WorkerRun[]>([]);
  const [selected, setSelected] = useState<WorkerRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [executeTarget, setExecuteTarget] =
    useState<WorkerRun | null>(null);
  const [executeCount, setExecuteCount] = useState(0);

  const loadAll = useCallback(
    async (id: string) => {
      if (!id) return;

      try {
        setLoading(true);
        setError('');

        const [registry, history] = await Promise.all([
          listWorkerAgents(id),
          listWorkerRuns(id),
        ]);

        setAgents(registry.agents);
        setTools(registry.tools);
        setFutureTools(
          registry.futureExternalTools ?? [],
        );
        setRuns(history.runs);
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load workers.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    async function init() {
      try {
        const sites = await getWebsites();
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);

        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored && list.some((site) => site.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid || '');

        if (valid) {
          await loadAll(valid);
        } else {
          setLoading(false);
        }
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load websites.',
        );
        setLoading(false);
      }
    }

    void init();
  }, [loadAll]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setSelected(null);
    setChecked({});

    if (typeof window !== 'undefined') {
      localStorage.setItem('renkoo_website_id', id);
    }

    void loadAll(id);
  }

  async function handleRun(
    agentId: string,
    input?: string,
    trigger?: string,
  ) {
    if (!websiteId || runningId) return;

    try {
      setRunningId(agentId);
      setError('');

      const run = await runWorkerAgent(
        agentId,
        websiteId,
        input,
        trigger ?? 'USER_REQUEST',
      );

      setRuns((prev) => [run, ...prev]);
      setSelected(run);
      setChecked({});
    } catch (err: any) {
      setError(
        err?.message || 'Worker run failed.',
      );
    } finally {
      setRunningId(null);
    }
  }

  async function handleExecute(run: WorkerRun) {
    if (executing) return;

    const indexes = run.proposedActions
      .map((_, index) => index)
      .filter((index) => checked[index] !== false);

    if (indexes.length === 0) {
      setError(
        'Select at least one proposed action to execute.',
      );
      return;
    }

    setExecuteTarget(run);
    setExecuteCount(indexes.length);
  }

  async function handleExecuteConfirm() {
    const run = executeTarget;
    if (!run || executing) return;

    const indexes = run.proposedActions
      .map((_, index) => index)
      .filter((index) => checked[index] !== false);

    if (indexes.length === 0) {
      setError(
        'Select at least one proposed action to execute.',
      );
      setExecuteTarget(null);
      return;
    }

    try {
      setExecuting(true);
      setError('');

      const updated = await executeWorkerRun(
        run.runId,
        true,
        indexes,
      );

      setRuns((prev) =>
        prev.map((item) =>
          item.runId === run.runId
            ? { ...item, ...updated }
            : item,
        ),
      );
      setSelected((prev) =>
        prev && prev.runId === run.runId
          ? { ...prev, ...updated }
          : prev,
      );
      setExecuteTarget(null);
    } catch (err: any) {
      setError(
        err?.message || 'Execution failed.',
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar mobileOpen={open} onClose={() => setOpen(false)} />
      <main className="lg:pl-[270px]">
        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                AI Workers
              </div>
              <h1 className="mt-1 text-3xl font-bold">
                Worker Control Center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Tool-oriented workers over your recorded RENKOO
                data. Deterministic runs only — no LLM provider is
                configured, nothing runs autonomously, and every
                write needs your explicit approval.
              </p>
            </div>

            <select
              value={websiteId}
              onChange={(e) =>
                handleWebsiteChange(e.target.value)
              }
              disabled={websites.length === 0}
              className="max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-60"
            >
              {websites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading workers...
            </div>
          ) : (
            <>
              <div className="mt-6">
                <SectionTitle title="Quick tasks" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_TASKS.map((task) => (
                    <button
                      key={task.label}
                      type="button"
                      disabled={
                        !websiteId || runningId !== null
                      }
                      onClick={() =>
                        handleRun(
                          task.agentId,
                          task.input,
                          'QUICK_TASK',
                        )
                      }
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-60"
                    >
                      {runningId
                        ? 'Working...'
                        : task.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
                <div>
                  <SectionTitle
                    title={`Available workers (${agents.length})`}
                  />
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {agents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        running={runningId === agent.id}
                        canRun={
                          !!websiteId &&
                          runningId === null &&
                          (agent.status ===
                            'DETERMINISTIC' ||
                            agent.status ===
                              'AVAILABLE')
                        }
                        onRun={() =>
                          handleRun(agent.id)
                        }
                      />
                    ))}
                  </div>

                  <div className="mt-8">
                    <SectionTitle
                      title={`Run history (${runs.length})`}
                    />
                    {runs.length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                        No worker runs yet. Start a quick task
                        above.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {runs.map((run) => (
                          <button
                            key={run.runId}
                            type="button"
                            onClick={() => {
                              setSelected(run);
                              setChecked({});
                            }}
                            className={`block w-full rounded-xl border px-4 py-3 text-left transition ${
                              selected?.runId ===
                              run.runId
                                ? 'border-slate-900 bg-white shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-400'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold">
                                {run.agent.name}
                              </span>
                              <RunStatusBadge
                                status={run.status}
                              />
                              <span className="text-xs text-slate-400">
                                {formatDateTime(
                                  run.startedAt,
                                )}
                              </span>
                            </div>
                            {run.resultSummary && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {run.resultSummary}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle title="Run detail" />
                  {!selected ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                      Select a run to inspect its evidence,
                      proposals, and execution state.
                    </div>
                  ) : (
                    <RunDetail
                      run={selected}
                      checked={checked}
                      executing={executing}
                      onToggle={(index) =>
                        setChecked((prev) => ({
                          ...prev,
                          [index]: !(prev[index] ?? true),
                        }))
                      }
                      onExecute={() =>
                        handleExecute(selected)
                      }
                    />
                  )}

                  <div className="mt-6">
                    <SectionTitle
                      title={`Tool registry (${tools.length} internal)`}
                    />
                    <div className="mt-2 space-y-1.5">
                      {tools.map((tool) => (
                        <div
                          key={tool.name}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <span className="truncate text-xs font-semibold text-slate-700">
                            {tool.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {tool.permission.replace(
                              '_',
                              ' ',
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    {futureTools.length > 0 && (
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        External tools (
                        {futureTools
                          .map((tool) => tool.name)
                          .join(', ')}
                        ) are documented but unavailable — no
                        integrations exist.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={executeTarget !== null}
        title="Approve action creation?"
        description={
          executeTarget
            ? `Create ${executeCount} RENKOO action${executeCount === 1 ? '' : 's'} from this run? This writes tracked tasks only — it never changes your website.`
            : 'Create tracked RENKOO actions from this run?'
        }
        confirmLabel="Approve & create"
        confirming={executing}
        onConfirm={() => void handleExecuteConfirm()}
        onCancel={() => {
          if (!executing) setExecuteTarget(null);
        }}
      />
    </div>
  );
}

function AgentCard({
  agent,
  running,
  canRun,
  onRun,
}: {
  agent: {
    id: string;
    name: string;
    description: string;
    capability: string[];
    allowedTools: string[];
    riskLevel: string;
    approvalRequired: boolean;
    mode: string;
    status: string;
  };
  running: boolean;
  canRun: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={agent.status} />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {agent.mode === 'DETERMINISTIC'
            ? 'DETERMINISTIC'
            : agent.mode}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {agent.riskLevel} RISK
        </span>
      </div>

      <h3 className="mt-2 text-base font-bold">{agent.name}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {agent.description}
      </p>

      <ul className="mt-2 space-y-1">
        {agent.capability.map((item) => (
          <li
            key={item}
            className="text-xs text-slate-600"
          >
            · {item}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-slate-400">
        {agent.allowedTools.length} tools ·{' '}
        {agent.approvalRequired
          ? 'approval required for writes'
          : 'read-only worker'}
      </p>

      <button
        type="button"
        disabled={!canRun}
        onClick={onRun}
        title={
          canRun
            ? 'Run deterministic workflow'
            : agent.status === 'NOT_AVAILABLE'
              ? 'Required data is missing'
              : 'Select a website first'
        }
        className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Working...' : 'Run worker'}
      </button>
    </div>
  );
}

function RunDetail({
  run,
  checked,
  executing,
  onToggle,
  onExecute,
}: {
  run: import('@/lib/api').WorkerRun;
  checked: Record<number, boolean>;
  executing: boolean;
  onToggle: (index: number) => void;
  onExecute: () => void;
}) {
  const executable =
    run.status === 'COMPLETED' &&
    run.approvalState !== 'EXECUTED' &&
    run.proposedActions.length > 0;

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {run.approvalState.replace('_', ' ')}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold">
        {run.agent.name}
      </p>

      {run.resultSummary && (
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {run.resultSummary}
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Tools: {run.selectedTools.join(', ') || '—'}
      </p>

      {run.evidence.length > 0 && (
        <div className="mt-3">
          <SectionTitle
            title={`Evidence (${run.evidence.length})`}
          />
          <ul className="mt-1.5 space-y-1.5">
            {run.evidence.slice(0, 8).map((item, i) => (
              <li
                key={i}
                className="text-xs leading-5 text-slate-600"
              >
                <span className="font-bold">
                  {item.source}
                </span>{' '}
                · {item.entity || item.metric}
                {item.value != null
                  ? ` — ${item.value}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.proposedActions.length > 0 && (
        <div className="mt-3">
          <SectionTitle
            title={`Proposed actions (${run.proposedActions.length})`}
          />
          <div className="mt-1.5 space-y-2">
            {run.proposedActions.map((proposal, index) => {
              const isChecked = checked[index] ?? true;

              return (
                <label
                  key={index}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={
                      run.approvalState === 'EXECUTED'
                    }
                    onChange={() => onToggle(index)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-xs font-bold">
                      {proposal.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                      {proposal.priority} · {proposal.type}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {run.executedActionIds.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Executed {run.executedActionIds.length} tracked
              action{run.executedActionIds.length === 1 ? '' : 's'}.{' '}
              <Link
                href="/actions"
                className="underline hover:text-emerald-900"
              >
                View in Actions
              </Link>
            </p>
          )}

          {executable && (
            <button
              type="button"
              disabled={executing}
              onClick={onExecute}
              className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {executing
                ? 'Executing...'
                : 'Approve & create actions'}
            </button>
          )}

          <p className="mt-2 text-[11px] leading-4 text-slate-400">
            Approval creates tracked RENKOO tasks only. It never
            changes your website, and completion never proves a
            business result.
          </p>
        </div>
      )}

      {run.error && (
        <p className="mt-3 text-xs font-semibold text-red-600">
          {run.error}
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        Started {formatDateTime(run.startedAt)}
        {run.completedAt
          ? ` · ended ${formatDateTime(run.completedAt)}`
          : ''}
      </p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
      {title}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const value = String(status || '').toUpperCase();
  const styles =
    value === 'DETERMINISTIC' || value === 'AVAILABLE'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'LLM_REQUIRED'
        ? 'bg-amber-50 text-amber-700'
        : value === 'NOT_AVAILABLE'
          ? 'bg-slate-100 text-slate-500'
          : 'bg-red-50 text-red-600';

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles}`}
    >
      {value.replace('_', ' ')}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const value = String(status || '').toUpperCase();
  const styles =
    value === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'RUNNING'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-red-50 text-red-600';

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles}`}
    >
      {value}
    </span>
  );
}

function formatDateTime(value: unknown) {
  if (!value) return '—';

  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}
