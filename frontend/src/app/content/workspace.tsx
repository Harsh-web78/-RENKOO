'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import ConfirmDialog from '../../components/ui/ConfirmDialog';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import {
  analyzeContentPage,
  createContentItem,
  deleteContentItem,
  deleteContentBrief,
  generateContentBrief,
  generateContentDraft,
  getContentPerformance,
  getContentPublishingStatus,
  getContentRefreshQueue,
  listContentBriefs,
  listContentDrafts,
  listContentItems,
  markContentPublished,
  markContentReady,
  updateContentItem,
  createActionFromRecommendation,
  type ContentItem,
} from '../../lib/api';

const GENERATE_MODES = [
  'OUTLINE',
  'DRAFT',
  'SECTION',
  'FAQ',
  'REWRITE',
] as const;

const PROVIDERS = [
  'GEMINI',
  'OPENAI',
] as const;

function Badge({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'slate' | 'red' | 'blue';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    green:
      'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber:
      'border-amber-200 bg-amber-50 text-amber-700',
    slate:
      'border-slate-200 bg-slate-50 text-slate-500',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">
        {title}
      </h2>

      {hint && (
        <p className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      )}

      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ContentWorkspace({
  websiteId,
}: {
  websiteId: string;
}) {
  const [items, setItems] = useState<
    ContentItem[]
  >([]);
  const [publishing, setPublishing] =
    useState<Record<string, any> | null>(
      null,
    );
  const [briefs, setBriefs] = useState<
    Array<Record<string, any>>
  >([]);
  const [serpNote, setSerpNote] = useState('');
  const [drafts, setDrafts] = useState<
    Array<Record<string, any>>
  >([]);
  const [refresh, setRefresh] = useState<
    Record<string, any> | null
  >(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [itemTitle, setItemTitle] =
    useState('');
  const [itemQuery, setItemQuery] =
    useState('');
  const [briefQuery, setBriefQuery] =
    useState('');
  const [genItemId, setGenItemId] =
    useState('');
  const [genBriefId, setGenBriefId] =
    useState('');
  const [genMode, setGenMode] =
    useState<(typeof GENERATE_MODES)[number]>(
      'OUTLINE',
    );
  const [genProvider, setGenProvider] =
    useState<(typeof PROVIDERS)[number]>(
      'GEMINI',
    );
  const [genTopic, setGenTopic] =
    useState('');
  const [genInput, setGenInput] =
    useState('');
  const [generating, setGenerating] =
    useState(false);
  const [briefing, setBriefing] =
    useState(false);
  const [optUrl, setOptUrl] = useState('');
  const [optQuery, setOptQuery] =
    useState('');
  const [optResult, setOptResult] =
    useState<Record<string, any> | null>(
      null,
    );
  const [optimizing, setOptimizing] =
    useState(false);
  const [perfUrl, setPerfUrl] =
    useState('');
  const [perf, setPerf] = useState<Record<
    string,
    any
  > | null>(null);
  const [perfLoading, setPerfLoading] =
    useState(false);
  const [openDraft, setOpenDraft] =
    useState<Record<string, any> | null>(
      null,
    );
  const [openBrief, setOpenBrief] =
    useState<Record<string, any> | null>(
      null,
    );
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] =
    useState<Record<string, boolean>>({});
  const [actionDone, setActionDone] =
    useState<Record<string, boolean>>({});
  const [publishTarget, setPublishTarget] =
    useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<string | null>(null);
  const [confirming, setConfirming] =
    useState(false);

  const load = useCallback(async () => {
    if (!websiteId) return;

    try {
      setLoading(true);
      setError('');

      const [
        itemsData,
        briefsData,
        draftsData,
        refreshData,
      ] = await Promise.all([
        listContentItems(websiteId),
        listContentBriefs(websiteId),
        listContentDrafts(websiteId),
        getContentRefreshQueue(
          websiteId,
        ).catch(() => null),
        getContentPublishingStatus()
          .then(setPublishing)
          .catch(() => null),
      ]);

      setItems(itemsData.items ?? []);
      setBriefs(briefsData.briefs ?? []);
      setSerpNote(
        briefsData.serp?.limitation ?? '',
      );
      setDrafts(draftsData.drafts ?? []);
      setRefresh(refreshData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load workspace.',
      );
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateItem() {
    if (!itemTitle.trim()) {
      setNotice('Item title is required.');
      return;
    }

    try {
      setNotice('');
      await createContentItem({
        websiteId,
        title: itemTitle.trim(),
        targetQuery:
          itemQuery.trim() || undefined,
      });
      setItemTitle('');
      setItemQuery('');
      setNotice('Content item created.');
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to create item.',
      );
    }
  }

  async function handleStatus(
    id: string,
    status: string,
  ) {
    try {
      setNotice('');
      await updateContentItem(id, { status });
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to update status.',
      );
    }
  }

  async function handleReady(id: string) {
    try {
      setNotice('');
      await markContentReady(id);
      setNotice('Marked ready.');
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to mark ready.',
      );
    }
  }

  async function handlePublish(id: string) {
    setPublishTarget(id);
  }

  async function handlePublishConfirm() {
    const id = publishTarget;
    if (!id || confirming) return;

    try {
      setConfirming(true);
      setNotice('');
      await markContentPublished(
        id,
        true,
      );
      setNotice('Marked published.');
      setPublishTarget(null);
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to mark published.',
      );
    } finally {
      setConfirming(false);
    }
  }

  async function handleDeleteItem(id: string) {
    setDeleteTarget(id);
  }

  async function handleDeleteConfirm() {
    const id = deleteTarget;
    if (!id || confirming) return;

    try {
      setConfirming(true);
      setNotice('');
      await deleteContentItem(id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to delete item.',
      );
    } finally {
      setConfirming(false);
    }
  }

  async function handleBrief() {
    if (!briefQuery.trim() || briefing)
      return;

    try {
      setBriefing(true);
      setNotice('');
      const brief =
        await generateContentBrief({
          websiteId,
          query: briefQuery.trim(),
        });
      setOpenBrief(brief);
      setBriefQuery('');
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to generate brief.',
      );
    } finally {
      setBriefing(false);
    }
  }

  async function handleGenerate() {
    if (generating) return;

    try {
      setGenerating(true);
      setNotice('');
      const draft =
        await generateContentDraft({
          websiteId,
          itemId: genItemId || undefined,
          briefId: genBriefId || undefined,
          mode: genMode,
          provider: genProvider,
          input: genInput || undefined,
          topic: genTopic || undefined,
        });
      setOpenDraft(draft);
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Generation failed.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleOptimize() {
    if (!optUrl.trim() || optimizing)
      return;

    try {
      setOptimizing(true);
      setNotice('');
      const result =
        await analyzeContentPage({
          websiteId,
          pageUrl: optUrl.trim(),
          query: optQuery.trim() || undefined,
        });
      setOptResult(result);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Optimization analysis failed.',
      );
    } finally {
      setOptimizing(false);
    }
  }

  async function handlePerformance() {
    if (!perfUrl.trim() || perfLoading)
      return;

    try {
      setPerfLoading(true);
      setNotice('');
      const result =
        await getContentPerformance(
          websiteId,
          perfUrl.trim(),
        );
      setPerf(result);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Performance lookup failed.',
      );
    } finally {
      setPerfLoading(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(
        text,
      );
      setCopied(true);
      window.setTimeout(
        () => setCopied(false),
        1500,
      );
    } catch {
      setNotice('Copy failed.');
    }
  }

  async function handleRefreshAction(
    recommendationId: string,
  ) {
    if (
      actionBusy[recommendationId] ||
      actionDone[recommendationId]
    ) {
      return;
    }

    try {
      setActionBusy((prev) => ({
        ...prev,
        [recommendationId]: true,
      }));
      await createActionFromRecommendation(
        recommendationId,
      );
      setActionDone((prev) => ({
        ...prev,
        [recommendationId]: true,
      }));
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to create action.',
      );
    } finally {
      setActionBusy((prev) => ({
        ...prev,
        [recommendationId]: false,
      }));
    }
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <Loader2
          size={28}
          className="mx-auto animate-spin text-blue-600"
        />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <XCircle size={18} />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <Section
        title="Publishing"
        hint="No publishing integration is connected. Copy, export, or confirm manually."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              publishing?.connected
                ? 'green'
                : 'slate'
            }
          >
            {publishing?.status ??
              'NOT_CONNECTED'}
          </Badge>

          <span className="text-xs text-slate-500">
            {(publishing?.supported ?? []).join(
              ' · ',
            )}
          </span>
        </div>

        {publishing?.limitation && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {publishing.limitation}
          </p>
        )}
      </Section>

      <Section
        title="Content Items"
        hint="Ideas move IDEA → BRIEF → DRAFT → REVIEW → READY → PUBLISHED by your confirmation only."
      >
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={itemTitle}
            onChange={(e) =>
              setItemTitle(e.target.value)
            }
            placeholder="Item title *"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <input
            value={itemQuery}
            onChange={(e) =>
              setItemQuery(e.target.value)
            }
            placeholder="Target query (optional)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={handleCreateItem}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
          >
            Add item
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-slate-500">
              No content items yet.
            </p>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {item.title}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone="blue">
                    {item.status}
                  </Badge>

                  {item.targetQuery && (
                    <span>
                      {item.targetQuery}
                    </span>
                  )}

                  <span>
                    {(item.briefs ?? []).length}{' '}
                    briefs ·{' '}
                    {
                      (item.drafts ?? [])
                        .length
                    }{' '}
                    drafts
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.status !==
                  'READY' &&
                  item.status !==
                    'PUBLISHED' && (
                    <button
                      onClick={() =>
                        handleReady(item.id)
                      }
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold hover:bg-slate-100"
                    >
                      Mark ready
                    </button>
                  )}

                {item.status !==
                  'PUBLISHED' && (
                  <button
                    onClick={() =>
                      handlePublish(item.id)
                    }
                    className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                  >
                    Confirm published
                  </button>
                )}

                <button
                  onClick={() =>
                    handleDeleteItem(item.id)
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Evidence Briefs"
        hint="Deterministic briefs from Business Brain, GSC, competitors and existing pages. No SERP data is claimed."
      >
        <div className="flex gap-2">
          <input
            value={briefQuery}
            onChange={(e) =>
              setBriefQuery(e.target.value)
            }
            placeholder="Target query, e.g. best CRM for agencies"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={handleBrief}
            disabled={briefing}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {briefing
              ? 'Building...'
              : 'Build brief'}
          </button>
        </div>

        {serpNote && (
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-amber-700">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0"
            />
            {serpNote}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {briefs.length === 0 && (
            <p className="text-sm text-slate-500">
              No briefs yet.
            </p>
          )}

          {briefs.map((brief: any) => (
            <button
              key={brief.id}
              onClick={() =>
                setOpenBrief(brief)
              }
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {brief.targetQuery}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {brief.intent ?? '—'} ·{' '}
                  {brief.createdAt
                    ? new Date(
                        brief.createdAt,
                      ).toLocaleDateString()
                    : ''}
                </div>
              </div>

              <Badge tone="blue">BRIEF</Badge>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="AI Drafts"
        hint="Metered generation via the connected provider. Every draft is labeled with provider and model."
      >
        <div className="grid gap-2 md:grid-cols-3">
          <select
            value={genItemId}
            onChange={(e) =>
              setGenItemId(e.target.value)
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">
              No linked item
            </option>

            {items.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.title.slice(0, 60)}
              </option>
            ))}
          </select>

          <select
            value={genBriefId}
            onChange={(e) =>
              setGenBriefId(e.target.value)
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">
              No linked brief
            </option>

            {briefs.map((brief: any) => (
              <option
                key={brief.id}
                value={brief.id}
              >
                {(brief.targetQuery ?? '').slice(
                  0,
                  60,
                )}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={genMode}
              onChange={(e) =>
                setGenMode(
                  e.target.value as (typeof GENERATE_MODES)[number],
                )
              }
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            >
              {GENERATE_MODES.map((mode) => (
                <option
                  key={mode}
                  value={mode}
                >
                  {mode}
                </option>
              ))}
            </select>

            <select
              value={genProvider}
              onChange={(e) =>
                setGenProvider(
                  e.target.value as (typeof PROVIDERS)[number],
                )
              }
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            >
              {PROVIDERS.map((provider) => (
                <option
                  key={provider}
                  value={provider}
                >
                  {provider}
                </option>
              ))}
            </select>
          </div>

          <input
            value={genTopic}
            onChange={(e) =>
              setGenTopic(e.target.value)
            }
            placeholder="Topic (outline/section/faq)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none md:col-span-2"
          />

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {generating
              ? 'Generating...'
              : 'Generate'}
          </button>

          {(genMode === 'SECTION' ||
            genMode === 'REWRITE') && (
            <textarea
              value={genInput}
              onChange={(e) =>
                setGenInput(e.target.value)
              }
              placeholder={
                genMode === 'REWRITE'
                  ? 'Paste text to rewrite (facts are preserved)'
                  : 'Section context (optional)'
              }
              rows={3}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none md:col-span-3"
            />
          )}
        </div>

        <div className="mt-4 space-y-2">
          {drafts.length === 0 && (
            <p className="text-sm text-slate-500">
              No drafts yet.
            </p>
          )}

          {drafts.map((draft: any) => (
            <button
              key={draft.id}
              onClick={() =>
                setOpenDraft(draft)
              }
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {draft.title ??
                    draft.mode ??
                    'Draft'}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  {draft.mode} ·{' '}
                  {draft.humanCreated
                    ? 'human'
                    : `${draft.provider ?? 'AI'}${draft.model ? ` ${draft.model}` : ''}`}{' '}
                  · v{draft.version}
                </div>
              </div>

              <Badge
                tone={
                  draft.humanCreated
                    ? 'slate'
                    : 'green'
                }
              >
                {draft.humanCreated
                  ? 'HUMAN'
                  : 'LIVE_PROVIDER_RESULT'}
              </Badge>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Optimize a Page"
        hint="Deterministic checks over the latest crawl with disclosed thresholds. No invented SEO score."
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={optUrl}
            onChange={(e) =>
              setOptUrl(e.target.value)
            }
            placeholder="Page URL *"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <input
            value={optQuery}
            onChange={(e) =>
              setOptQuery(e.target.value)
            }
            placeholder="Target query (optional)"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={handleOptimize}
            disabled={optimizing}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {optimizing
              ? 'Analyzing...'
              : 'Analyze'}
          </button>
        </div>

        {optResult && (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <div className="text-sm font-bold">
              {optResult.passing}/
              {optResult.total} checks
              passing
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {optResult.methodology}
            </p>

            <div className="mt-3 space-y-2">
              {(optResult.checks ?? []).map(
                (check: any) => (
                  <div
                    key={check.key}
                    className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {check.title}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {check.evidence}
                      </div>
                    </div>

                    <Badge
                      tone={
                        check.state ===
                        'GOOD'
                          ? 'green'
                          : check.state ===
                              'ATTENTION'
                            ? 'amber'
                            : 'slate'
                      }
                    >
                      {check.state}
                    </Badge>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Refresh Queue"
        hint="Period-over-period GSC declines only. Age alone never triggers a refresh."
      >
        {!refresh || refresh.total === 0 ? (
          <p className="text-sm text-slate-500">
            No refresh candidates in the
            latest comparison. Connect
            GSC to enable refresh
            intelligence.
          </p>
        ) : (
          <div className="space-y-2">
            {(refresh.refresh ?? []).map(
              (item: any, index: number) => {
                const persisted = (
                  refresh.persisted ?? []
                ).find(
                  (entry: any) =>
                    entry.query ===
                    item.query,
                );
                const recId =
                  persisted?.recommendationId;
                const done =
                  recId &&
                  actionDone[recId];

                return (
                  <div
                    key={`${item.query}-${index}`}
                    className="rounded-xl border border-slate-100 p-4"
                  >
                    <div className="text-sm font-semibold">
                      {item.query}
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      {item.reason}
                    </p>

                    {recId && (
                      <button
                        onClick={() =>
                          handleRefreshAction(
                            recId,
                          )
                        }
                        disabled={Boolean(done)}
                        className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {done
                          ? 'Action created'
                          : 'Create action'}
                      </button>
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}
      </Section>

      <Section
        title="Page Performance"
        hint="Page-level GSC plus attributed leads and revenue. Unrelated site metrics are never mixed in."
      >
        <div className="flex gap-2">
          <input
            value={perfUrl}
            onChange={(e) =>
              setPerfUrl(e.target.value)
            }
            placeholder="Page URL *"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />

          <button
            onClick={handlePerformance}
            disabled={perfLoading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {perfLoading
              ? 'Loading...'
              : 'Measure'}
          </button>
        </div>

        {perf && (
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                GSC 28d
              </div>

              <div className="mt-1 font-bold">
                {perf.gsc
                  ? `${perf.gsc.clicks} clicks · ${perf.gsc.impressions} impressions`
                  : 'No page rows'}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Leads
              </div>

              <div className="mt-1 font-bold">
                {perf.leads?.total ?? 0}{' '}
                total ·{' '}
                {perf.leads?.converted ??
                  0}{' '}
                converted
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Revenue
              </div>

              <div className="mt-1 font-bold">
                {perf.revenue?.state ===
                'LIVE'
                  ? `${perf.revenue.total} ${perf.revenue.currency ?? ''}`
                  : 'NOT_MEASURABLE'}
              </div>
            </div>

            {(perf.limitations ?? []).map(
              (limitation: string) => (
                <p
                  key={limitation}
                  className="text-xs text-slate-400 md:col-span-3"
                >
                  {limitation}
                </p>
              ),
            )}
          </div>
        )}
      </Section>

      {openBrief && (
        <BriefViewer
          title="Evidence Brief"
          onClose={() =>
            setOpenBrief(null)
          }
        >
          <BriefBody
            payload={
              (openBrief.payload ??
                openBrief) as Record<
                string,
                any
              >
            }
            evidence={
              openBrief.evidence as
                | Record<string, any>
                | undefined
            }
            copy={() =>
              copyText(
                JSON.stringify(
                  openBrief.payload ??
                    openBrief,
                  null,
                  2,
                ),
              )
            }
            copied={copied}
          />
        </BriefViewer>
      )}

      {openDraft && (
        <BriefViewer
          title={`${openDraft.mode ?? 'Draft'} · ${openDraft.humanCreated ? 'human' : `${openDraft.provider ?? ''} ${openDraft.model ?? ''}`.trim()}`}
          onClose={() =>
            setOpenDraft(null)
          }
        >
          <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {openDraft.content}
          </pre>

          <button
            onClick={() =>
              copyText(
                openDraft.content ?? '',
              )
            }
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
          >
            {copied ? (
              <Check size={14} />
            ) : (
              <Clipboard size={14} />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </BriefViewer>
      )}

      <ConfirmDialog
        open={publishTarget !== null}
        title="Confirm published?"
        description="Confirm this content is published at its live URL? This is your explicit confirmation."
        confirmLabel="Confirm published"
        tone="neutral"
        confirming={confirming}
        onConfirm={() => void handlePublishConfirm()}
        onCancel={() => {
          if (!confirming) setPublishTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete content item?"
        description="Delete this content item and unlink its briefs/drafts? This cannot be undone."
        confirmLabel="Delete item"
        confirming={confirming}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!confirming) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function BriefViewer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close viewer"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-[1px]"
      />

      <aside className="fixed right-0 top-0 z-[70] h-screen w-full max-w-[620px] overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </aside>
    </>
  );
}

function BriefBody({
  payload,
  evidence,
  copy,
  copied,
}: {
  payload: Record<string, any>;
  evidence?: Record<string, any>;
  copy: () => void;
  copied: boolean;
}) {
  const rows: Array<[string, any]> = [
    ['Target query', payload.targetQuery],
    ['Intent', payload.intent],
    ['Content type', payload.contentType],
    ['Angle', payload.angle],
    ['Business goal', payload.businessGoal],
    ['Audience', payload.targetAudience],
    ['CTA', payload.cta],
    [
      'Ranking page',
      payload.rankingPage ?? 'None evidenced',
    ],
  ];

  return (
    <div>
      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        <div className="text-xl font-bold">
          {payload.recommendedTitle ??
            payload.targetQuery}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl bg-slate-50 p-3 text-sm"
          >
            <span className="font-bold">
              {label}:{' '}
            </span>
            {String(value ?? '—')}
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-sm font-bold">
        Outline
      </h3>

      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {(payload.outline ?? []).map(
          (section: string) => (
            <li key={section}>{section}</li>
          ),
        )}
      </ol>

      <h3 className="mt-5 text-sm font-bold">
        Questions to answer
      </h3>

      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {(payload.questionsToAnswer ?? []).map(
          (question: string) => (
            <li key={question}>
              {question}
            </li>
          ),
        )}
      </ul>

      {(payload.internalLinks ?? []).length >
        0 && (
        <>
          <h3 className="mt-5 text-sm font-bold">
            Internal links (real pages)
          </h3>

          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {payload.internalLinks.map(
              (link: any) => (
                <li
                  key={link.url}
                  className="break-all"
                >
                  {link.title ?? link.url} —{' '}
                  {link.url}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {(payload.competitorNotes ?? [])
        .length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-bold">
            Competitors (manual review)
          </h3>

          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {payload.competitorNotes.map(
              (note: any) => (
                <li key={note.domain}>
                  {note.name} ({note.domain})
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {(evidence?.sources ?? []).length >
        0 && (
        <>
          <h3 className="mt-5 text-sm font-bold">
            Evidence sources
          </h3>

          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {(evidence?.sources ?? []).map(
              (source: string) => (
                <li key={source}>
                  {source}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      <button
        onClick={copy}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
      >
        {copied ? (
          <Check size={14} />
        ) : (
          <Clipboard size={14} />
        )}
        {copied
          ? 'Copied'
          : 'Copy brief JSON'}
      </button>

      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-700">
        <CheckCircle2
          size={14}
          className="mt-0.5 shrink-0"
        />
        No SERP provider is connected.
        Search volume and difficulty are
        unavailable; competitor review is
        manual.
      </p>
    </div>
  );
}
