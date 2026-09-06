'use client';

/*
 * RENKOO — Content Workspace (V2 design-system pass).
 * UI ONLY: shared Panel / Metric / DataTable / Drawer /
 * badges / buttons / states. All API calls, brief/draft
 * generation logic, publishing confirmations, status
 * transitions, filters and business logic are unchanged.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Panel from '../../components/ui/Panel';
import Metric from '../../components/ui/Metric';
import DataTable from '../../components/ui/DataTable';
import Drawer, {
  DrawerSection,
} from '../../components/ui/Drawer';
import {
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/buttons';
import {
  Badge,
  DataSourceBadge,
} from '../../components/ui/badge';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from '../../components/ui/states';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  RefreshCw,
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

function itemStatusTone(
  status: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  const key = String(status || '').toUpperCase();
  if (key === 'PUBLISHED' || key === 'READY') return 'positive';
  if (key === 'REVIEW') return 'warning';
  if (key === 'DRAFT' || key === 'BRIEF') return 'info';
  return 'neutral';
}

function checkTone(
  state: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  const key = String(state || '').toUpperCase();
  if (key === 'GOOD') return 'positive';
  if (key === 'ATTENTION') return 'warning';
  return 'neutral';
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
  const [briefDeleteTarget, setBriefDeleteTarget] =
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

  async function handleBriefDeleteConfirm() {
    const id = briefDeleteTarget;
    if (!id || confirming) return;

    try {
      setConfirming(true);
      setNotice('');
      await deleteContentBrief(id);
      setBriefDeleteTarget(null);
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Failed to delete brief.',
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
      <LoadingBlock title="Loading content workspace…" lines={4} />
    );
  }

  const refreshRows: any[] = Array.isArray(
    (refresh as any)?.refresh,
  )
    ? (refresh as any).refresh
    : [];

  return (
    <div className="space-y-6">
      {error ? (
        <ErrorState
          title="Workspace failed to load"
          description={error}
          onRetry={() => void load()}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          className="rounded-rk-md border border-rk-info/30 bg-rk-infoSoft/50 px-4 py-3 text-sm leading-6 text-rk-ink"
        >
          {notice}
        </div>
      ) : null}

      <Panel
        eyebrow="Publishing"
        title="Publishing status"
        description="No publishing integration is connected. Copy, export, or confirm manually."
      >
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge
            source="Publishing"
            connected={Boolean(
              (publishing as any)?.connected,
            )}
          />
          <Badge
            label={String(
              (publishing as any)?.status ??
                'NOT_CONNECTED',
            )}
            tone={
              (publishing as any)?.connected
                ? 'positive'
                : 'neutral'
            }
          />
          {(publishing as any)?.supported &&
          Array.isArray(
            (publishing as any).supported,
          ) &&
          (publishing as any).supported.length >
            0 ? (
            <span className="rk-metadata">
              {(
                (publishing as any).supported as string[]
              ).join(' · ')}
            </span>
          ) : null}
        </div>

        {(publishing as any)?.limitation ? (
          <p className="rk-metadata mt-2">
            {String(
              (publishing as any).limitation,
            )}
          </p>
        ) : null}
      </Panel>

      <Panel
        eyebrow="Content items"
        title="Ideas to published"
        description="Ideas move IDEA → BRIEF → DRAFT → REVIEW → READY → PUBLISHED by your confirmation only."
        actions={
          <SecondaryButton
            size="sm"
            onClick={() => void load()}
          >
            <RefreshCw size={14} aria-hidden />
            Refresh
          </SecondaryButton>
        }
      >
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="rk-field-label">
              Item title
            </span>
            <input
              value={itemTitle}
              onChange={(e) =>
                setItemTitle(e.target.value)
              }
              placeholder="Item title *"
              className="rk-input mt-1.5"
            />
          </label>

          <label className="block md:col-span-1">
            <span className="rk-field-label">
              Target query
            </span>
            <input
              value={itemQuery}
              onChange={(e) =>
                setItemQuery(e.target.value)
              }
              placeholder="Target query (optional)"
              className="rk-input mt-1.5"
            />
          </label>

          <div className="flex items-end">
            <PrimaryButton
              onClick={handleCreateItem}
              className="w-full md:w-auto"
            >
              Add item
            </PrimaryButton>
          </div>
        </div>

        <div className="mt-4">
          <DataTable
            caption="Content items"
            columns={[
              {
                key: 'item',
                label: 'Item',
                priority: 'high',
                render: (item: any) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-bold text-rk-ink">
                      {String(
                        item.title || 'Untitled',
                      )}
                    </span>
                    {item.targetQuery ? (
                      <span className="rk-metadata mt-0.5 block truncate">
                        {String(item.targetQuery)}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                priority: 'high',
                render: (item: any) => (
                  <Badge
                    label={String(
                      item.status || 'IDEA',
                    )}
                    tone={itemStatusTone(
                      String(item.status || ''),
                    )}
                  />
                ),
              },
              {
                key: 'progress',
                label: 'Progress',
                priority: 'medium',
                render: (item: any) => (
                  <span className="rk-metadata">
                    {(item.briefs ?? []).length}{' '}
                    briefs ·{' '}
                    {(item.drafts ?? []).length}{' '}
                    drafts
                  </span>
                ),
              },
            ]}
            rows={items}
            keyOf={(item: any) => String(item.id)}
            emptyTitle="No content items yet"
            emptyDescription="Add your first item to start the brief → draft → published flow."
            pageSize={8}
            rowActions={(item: any) => {
              const actions: Array<{
                label: string;
                onSelect: () => void;
              }> = [];
              if (
                item.status !== 'READY' &&
                item.status !== 'PUBLISHED'
              ) {
                actions.push({
                  label: 'Mark ready',
                  onSelect: () =>
                    void handleReady(item.id),
                });
              }
              if (item.status !== 'PUBLISHED') {
                actions.push({
                  label: 'Confirm published',
                  onSelect: () =>
                    void handlePublish(item.id),
                });
              }
              actions.push({
                label: 'Delete',
                onSelect: () =>
                  void handleDeleteItem(item.id),
              });
              return actions;
            }}
            renderExpanded={(item: any) => (
              <div className="flex flex-wrap gap-2">
                <SecondaryButton
                  size="sm"
                  onClick={() =>
                    void handleStatus(
                      item.id,
                      'REVIEW',
                    )
                  }
                >
                  Move to review
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  onClick={() =>
                    void handleStatus(
                      item.id,
                      'DRAFT',
                    )
                  }
                >
                  Move to draft
                </SecondaryButton>
              </div>
            )}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Evidence briefs"
        title="Deterministic briefs"
        description="Briefs from Business Brain, GSC, competitors and existing pages. No SERP data is claimed."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={briefQuery}
            onChange={(e) =>
              setBriefQuery(e.target.value)
            }
            placeholder="Target query, e.g. best CRM for agencies"
            className="rk-input flex-1"
            aria-label="Target query for brief"
          />

          <PrimaryButton
            onClick={handleBrief}
            disabled={briefing}
          >
            {briefing
              ? 'Building…'
              : 'Build brief'}
          </PrimaryButton>
        </div>

        {serpNote ? (
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-rk-warning">
            <AlertTriangle
              size={14}
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            <span>{serpNote}</span>
          </p>
        ) : null}

        <div className="mt-4">
          <DataTable
            caption="Evidence briefs"
            columns={[
              {
                key: 'query',
                label: 'Target query',
                priority: 'high',
                render: (brief: any) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-bold text-rk-ink">
                      {String(
                        brief.targetQuery || '—',
                      )}
                    </span>
                    <span className="rk-metadata mt-0.5 block">
                      {String(brief.intent ?? '—')}
                      {brief.createdAt
                        ? ` · ${new Date(
                            brief.createdAt,
                          ).toLocaleDateString()}`
                        : ''}
                    </span>
                  </span>
                ),
              },
              {
                key: 'type',
                label: 'Type',
                priority: 'medium',
                render: () => (
                  <Badge
                    label="BRIEF"
                    tone="info"
                  />
                ),
              },
            ]}
            rows={briefs}
            keyOf={(brief: any) =>
              String(brief.id)
            }
            onRowClick={(brief: any) =>
              setOpenBrief(brief)
            }
            emptyTitle="No briefs yet"
            emptyDescription="Build a brief from a measured target query."
            pageSize={8}
            rowActions={(brief: any) => [
              {
                label: 'Open',
                onSelect: () =>
                  setOpenBrief(brief),
              },
              {
                label: 'Delete',
                onSelect: () =>
                  setBriefDeleteTarget(
                    String(brief.id),
                  ),
              },
            ]}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="AI drafts"
        title="Metered generation"
        description="Every draft is labeled with provider and model."
      >
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block">
            <span className="rk-field-label">
              Linked item
            </span>
            <select
              value={genItemId}
              onChange={(e) =>
                setGenItemId(e.target.value)
              }
              className="rk-input mt-1.5"
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
          </label>

          <label className="block">
            <span className="rk-field-label">
              Linked brief
            </span>
            <select
              value={genBriefId}
              onChange={(e) =>
                setGenBriefId(e.target.value)
              }
              className="rk-input mt-1.5"
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
          </label>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="rk-field-label">
                Mode
              </span>
              <select
                value={genMode}
                onChange={(e) =>
                  setGenMode(
                    e.target.value as (typeof GENERATE_MODES)[number],
                  )
                }
                className="rk-input mt-1.5"
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
            </label>

            <label className="block flex-1">
              <span className="rk-field-label">
                Provider
              </span>
              <select
                value={genProvider}
                onChange={(e) =>
                  setGenProvider(
                    e.target.value as (typeof PROVIDERS)[number],
                  )
                }
                className="rk-input mt-1.5"
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
            </label>
          </div>

          <label className="block md:col-span-2">
            <span className="rk-field-label">
              Topic
            </span>
            <input
              value={genTopic}
              onChange={(e) =>
                setGenTopic(e.target.value)
              }
              placeholder="Topic (outline/section/faq)"
              className="rk-input mt-1.5"
            />
          </label>

          <div className="flex items-end">
            <PrimaryButton
              onClick={handleGenerate}
              disabled={generating}
              className="w-full md:w-auto"
            >
              {generating
                ? 'Generating…'
                : 'Generate'}
            </PrimaryButton>
          </div>

          {(genMode === 'SECTION' ||
            genMode === 'REWRITE') && (
            <label className="block md:col-span-3">
              <span className="rk-field-label">
                {genMode === 'REWRITE'
                  ? 'Text to rewrite'
                  : 'Section context'}
              </span>
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
                className="rk-input mt-1.5 resize-y"
              />
            </label>
          )}
        </div>

        <div className="mt-4">
          <DataTable
            caption="AI drafts"
            columns={[
              {
                key: 'draft',
                label: 'Draft',
                priority: 'high',
                render: (draft: any) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-bold text-rk-ink">
                      {String(
                        draft.title ??
                          draft.mode ??
                          'Draft',
                      )}
                    </span>
                    <span className="rk-metadata mt-0.5 block">
                      {String(draft.mode ?? '—')} ·{' '}
                      {draft.humanCreated
                        ? 'human'
                        : `${draft.provider ?? 'AI'}${draft.model ? ` ${draft.model}` : ''}`}{' '}
                      · v{String(draft.version ?? '—')}
                    </span>
                  </span>
                ),
              },
              {
                key: 'origin',
                label: 'Origin',
                priority: 'medium',
                render: (draft: any) => (
                  <Badge
                    label={
                      draft.humanCreated
                        ? 'HUMAN'
                        : 'LIVE_PROVIDER_RESULT'
                    }
                    tone={
                      draft.humanCreated
                        ? 'neutral'
                        : 'positive'
                    }
                  />
                ),
              },
            ]}
            rows={drafts}
            keyOf={(draft: any) =>
              String(draft.id)
            }
            onRowClick={(draft: any) =>
              setOpenDraft(draft)
            }
            emptyTitle="No drafts yet"
            emptyDescription="Generate a draft from a brief or item."
            pageSize={8}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Optimize"
        title="Optimize a page"
        description="Deterministic checks over the latest crawl with disclosed thresholds. No invented SEO score."
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={optUrl}
            onChange={(e) =>
              setOptUrl(e.target.value)
            }
            placeholder="Page URL *"
            className="rk-input flex-1"
            aria-label="Page URL to analyze"
          />

          <input
            value={optQuery}
            onChange={(e) =>
              setOptQuery(e.target.value)
            }
            placeholder="Target query (optional)"
            className="rk-input flex-1"
            aria-label="Target query (optional)"
          />

          <PrimaryButton
            onClick={handleOptimize}
            disabled={optimizing}
          >
            {optimizing
              ? 'Analyzing…'
              : 'Analyze'}
          </PrimaryButton>
        </div>

        {optResult ? (
          <div className="mt-4">
            <p className="text-sm font-bold text-rk-ink">
              {String(
                (optResult as any)?.passing ?? '—',
              )}
              /
              {String(
                (optResult as any)?.total ?? '—',
              )}{' '}
              checks passing
            </p>

            {(optResult as any)?.methodology ? (
              <p className="rk-metadata mt-1">
                {String(
                  (optResult as any).methodology,
                )}
              </p>
            ) : null}

            <div className="mt-3 space-y-2">
              {(
                (optResult as any)?.checks ?? []
              ).map((check: any) => (
                <div
                  key={String(check.key)}
                  className="flex items-start justify-between gap-3 rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rk-ink">
                      {String(check.title)}
                    </p>

                    <p className="rk-metadata mt-1">
                      {String(check.evidence ?? '')}
                    </p>
                  </div>

                  <Badge
                    label={String(check.state)}
                    tone={checkTone(
                      String(check.state ?? ''),
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel
        eyebrow="Refresh queue"
        title="Refresh candidates"
        description="Period-over-period GSC declines only. Age alone never triggers a refresh."
      >
        {refreshRows.length === 0 ? (
          <EmptyState
            title="No refresh candidates"
            description="No period-over-period GSC declines in the latest comparison. Connect GSC to enable refresh intelligence."
          />
        ) : (
          <DataTable
            caption="Refresh candidates"
            columns={[
              {
                key: 'query',
                label: 'Query',
                priority: 'high',
                render: (item: any) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-bold text-rk-ink">
                      {String(item.query || '—')}
                    </span>
                    <span className="rk-metadata mt-0.5 block">
                      {String(
                        item.reason || 'Measured decline',
                      )}
                    </span>
                  </span>
                ),
              },
            ]}
            rows={refreshRows}
            keyOf={(item: any, i: number) =>
              String(item.query || i)
            }
            pageSize={8}
            rowActions={(item: any) => {
              const persisted = (
                (refresh as any)?.persisted ?? []
              ).find(
                (entry: any) =>
                  entry.query === item.query,
              );
              const recId =
                persisted?.recommendationId;
              if (!recId) return [];
              const done = Boolean(
                actionDone[recId],
              );
              return [
                {
                  label: done
                    ? 'Action created'
                    : actionBusy[recId]
                      ? 'Creating…'
                      : 'Create action',
                  onSelect: () =>
                    void handleRefreshAction(
                      String(recId),
                    ),
                },
              ];
            }}
          />
        )}
      </Panel>

      <Panel
        eyebrow="Performance"
        title="Page performance"
        description="Page-level GSC plus attributed leads and revenue. Unrelated site metrics are never mixed in."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={perfUrl}
            onChange={(e) =>
              setPerfUrl(e.target.value)
            }
            placeholder="Page URL *"
            className="rk-input flex-1"
            aria-label="Page URL to measure"
          />

          <PrimaryButton
            onClick={handlePerformance}
            disabled={perfLoading}
          >
            {perfLoading
              ? 'Loading…'
              : 'Measure'}
          </PrimaryButton>
        </div>

        {perf ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
              <Metric
                label="GSC 28d"
                value={
                  (perf as any)?.gsc
                    ? `${(perf as any).gsc.clicks} clicks`
                    : 'No page rows'
                }
                detail={
                  (perf as any)?.gsc
                    ? `${(perf as any).gsc.impressions} impressions`
                    : undefined
                }
              />
            </div>

            <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
              <Metric
                label="Leads"
                value={String(
                  (perf as any)?.leads?.total ?? 0,
                )}
                detail={`${String((perf as any)?.leads?.converted ?? 0)} converted`}
              />
            </div>

            <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
              <Metric
                label="Revenue"
                value={
                  (perf as any)?.revenue?.state ===
                  'LIVE'
                    ? `${String((perf as any).revenue.total)} ${String((perf as any).revenue.currency ?? '')}`.trim()
                    : 'NOT_MEASURABLE'
                }
              />
            </div>

            {((perf as any)?.limitations ?? []).map(
              (limitation: string) => (
                <p
                  key={limitation}
                  className="rk-metadata sm:col-span-3"
                >
                  {limitation}
                </p>
              ),
            )}
          </div>
        ) : (
          <p className="rk-metadata mt-3">
            Enter a page URL to measure real GSC,
            lead and revenue attribution.
          </p>
        )}
      </Panel>

      <Drawer
        open={openBrief !== null}
        onClose={() => setOpenBrief(null)}
        eyebrow="Evidence brief"
        title={String(
          (openBrief as any)?.payload?.targetQuery ??
            (openBrief as any)?.targetQuery ??
            'Evidence Brief',
        )}
        description="Deterministic brief with disclosed evidence and limitations."
        wide
      >
        {openBrief ? (
          <>
            <BriefBody
              payload={
                ((openBrief as any).payload ??
                  openBrief) as Record<
                  string,
                  any
                >
              }
              evidence={
                (openBrief as any).evidence as
                  | Record<string, any>
                  | undefined
              }
              copy={() =>
                copyText(
                  JSON.stringify(
                    (openBrief as any).payload ??
                      openBrief,
                    null,
                    2,
                  ),
                )
              }
              copied={copied}
            />
          </>
        ) : null}
      </Drawer>

      <Drawer
        open={openDraft !== null}
        onClose={() => setOpenDraft(null)}
        eyebrow="AI draft"
        title={String(
          (openDraft as any)?.title ??
            (openDraft as any)?.mode ??
            'Draft',
        )}
        description={
          openDraft
            ? String(
                (openDraft as any).humanCreated
                  ? 'Human-created draft.'
                  : `${String((openDraft as any).provider ?? 'AI')} ${String((openDraft as any).model ?? '')}`.trim(),
              )
            : undefined
        }
        wide
      >
        {openDraft ? (
          <>
            <DrawerSection title="Content">
              <pre className="whitespace-pre-wrap rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3 text-sm leading-6 text-rk-ink">
                {String(
                  (openDraft as any).content ?? '',
                )}
              </pre>
            </DrawerSection>
            <DrawerSection title="Actions">
              <SecondaryButton
                size="sm"
                onClick={() =>
                  void copyText(
                    String(
                      (openDraft as any).content ??
                        '',
                    ),
                  )
                }
              >
                {copied ? (
                  <Check size={14} aria-hidden />
                ) : (
                  <Clipboard
                    size={14}
                    aria-hidden
                  />
                )}
                {copied ? 'Copied' : 'Copy'}
              </SecondaryButton>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={publishTarget !== null}
        title="Confirm published?"
        description="Confirm this content is published at its live URL? This is your explicit confirmation."
        confirmLabel="Confirm published"
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

      <ConfirmDialog
        open={briefDeleteTarget !== null}
        title="Delete brief?"
        description="Delete this evidence brief? Linked drafts are kept. This cannot be undone."
        confirmLabel="Delete brief"
        confirming={confirming}
        onConfirm={() => void handleBriefDeleteConfirm()}
        onCancel={() => {
          if (!confirming) setBriefDeleteTarget(null);
        }}
      />
    </div>
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
      <div className="rounded-rk-md bg-rk-ink px-4 py-3.5 text-white">
        <p className="text-base font-bold">
          {String(
            payload.recommendedTitle ??
              payload.targetQuery ??
              'Brief',
          )}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-2.5 text-sm"
          >
            <span className="font-bold text-rk-ink">
              {label}:{' '}
            </span>
            <span className="text-rk-secondary">
              {String(value ?? '—')}
            </span>
          </div>
        ))}
      </div>

      <DrawerSection title="Outline">
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-rk-secondary">
          {(payload.outline ?? []).map(
            (section: string) => (
              <li key={section}>{section}</li>
            ),
          )}
        </ol>
      </DrawerSection>

      <DrawerSection title="Questions to answer">
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-rk-secondary">
          {(payload.questionsToAnswer ?? []).map(
            (question: string) => (
              <li key={question}>
                {question}
              </li>
            ),
          )}
        </ul>
      </DrawerSection>

      {(payload.internalLinks ?? []).length >
        0 && (
        <DrawerSection title="Internal links (real pages)">
          <ul className="space-y-1 text-sm text-rk-secondary">
            {payload.internalLinks.map(
              (link: any) => (
                <li
                  key={link.url}
                  className="rk-technical-value break-all !text-rk-secondary"
                >
                  {link.title ?? link.url} —{' '}
                  {link.url}
                </li>
              ),
            )}
          </ul>
        </DrawerSection>
      )}

      {(payload.competitorNotes ?? [])
        .length > 0 && (
        <DrawerSection title="Competitors (manual review)">
          <ul className="space-y-1 text-sm text-rk-secondary">
            {payload.competitorNotes.map(
              (note: any) => (
                <li key={note.domain}>
                  {note.name} ({note.domain})
                </li>
              ),
            )}
          </ul>
        </DrawerSection>
      )}

      {(evidence?.sources ?? []).length >
        0 && (
        <DrawerSection title="Evidence sources">
          <ul className="list-disc space-y-1 pl-5 text-sm text-rk-secondary">
            {(evidence?.sources ?? []).map(
              (source: string) => (
                <li key={source}>
                  {source}
                </li>
              ),
            )}
          </ul>
        </DrawerSection>
      )}

      <div className="mt-4">
        <SecondaryButton
          size="sm"
          onClick={copy}
        >
          {copied ? (
            <Check size={14} aria-hidden />
          ) : (
            <Clipboard size={14} aria-hidden />
          )}
          {copied
            ? 'Copied'
            : 'Copy brief JSON'}
        </SecondaryButton>
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-rk-warning">
        <CheckCircle2
          size={14}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>
          No SERP provider is connected.
          Search volume and difficulty are
          unavailable; competitor review is
          manual.
        </span>
      </p>
    </div>
  );
}
