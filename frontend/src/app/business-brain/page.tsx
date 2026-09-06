'use client';

/*
 * RENKOO — Business Brain (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / Metric / FilterBar /
 * DataTable / badges / buttons / states. All API calls, brain
 * normalization, analysis/save flows, recommendation → action
 * flows, action status transitions, forms, validation and
 * business logic are unchanged.
 */

import { useEffect, useState } from 'react';
import {
  Brain,
  RefreshCw,
  Sparkles,
  Save,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';

import AppShell from '../../components/AppShell';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import SharedMetric from '../../components/ui/Metric';
import FilterBar from '../../components/ui/FilterBar';
import DataTable, {
  type DataTableColumn,
} from '../../components/ui/DataTable';
import {
  Badge,
  DataSourceBadge,
} from '../../components/ui/badge';
import {
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/buttons';
import {
  EmptyState,
  LoadingBlock,
} from '../../components/ui/states';
import {
  InsightBlock,
  RecommendationCallout,
} from '../../components/ui/insights';
import {
  getWebsites,
  getBusinessBrain,
  getBusinessContext,
  updateBusinessBrain,
  analyzeBusinessBrain,
  getBusinessBrainRecommendations,
  createActionFromRecommendation,
  getActions,
  updateActionStatus,
  Website,
  BusinessBrain,
  BusinessContext,
  BusinessBrainRecommendation,
  RenkooAction,
} from '../../lib/api';

type BrainForm = {
  businessName: string;
  industry: string;
  country: string;
  city: string;
  description: string;
  services: string[];
  products: string[];
  targetAudience: string;
  primaryGoal: string;
  primaryKeywords: string[];
  targetLocations: string[];
  brandTone: string;
  uniqueSellingPoint: string;
};

const EMPTY_FORM: BrainForm = {
  businessName: '',
  industry: '',
  country: '',
  city: '',
  description: '',
  services: [],
  products: [],
  targetAudience: '',
  primaryGoal: '',
  primaryKeywords: [],
  targetLocations: [],
  brandTone: '',
  uniqueSellingPoint: '',
};

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBrain(data: any): BusinessBrain | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (
    data.businessBrain &&
    typeof data.businessBrain === 'object'
  ) {
    return normalizeBrain(data.businessBrain);
  }

  return {
    ...data,

    websiteId: toStringValue(data.websiteId),

    businessName: toStringValue(data.businessName),
    industry: toStringValue(data.industry),
    country: toStringValue(data.country),
    city: toStringValue(data.city),
    description: toStringValue(data.description),

    services: toStringArray(data.services),
    products: toStringArray(data.products),

    targetAudience: toStringValue(data.targetAudience),
    primaryGoal: toStringValue(data.primaryGoal),

    primaryKeywords: toStringArray(
      data.primaryKeywords,
    ),

    targetLocations: toStringArray(
      data.targetLocations,
    ),

    brandTone: toStringValue(data.brandTone),

    uniqueSellingPoint: toStringValue(
      data.uniqueSellingPoint,
    ),

    aiSummary:
      typeof data.aiSummary === 'string'
        ? data.aiSummary
        : null,

    businessScore:
      typeof data.businessScore === 'number'
        ? data.businessScore
        : 0,

    lastAnalyzedAt:
      typeof data.lastAnalyzedAt === 'string'
        ? data.lastAnalyzedAt
        : null,
  };
}

function brainToForm(
  data: BusinessBrain | null,
): BrainForm {
  if (!data) {
    return EMPTY_FORM;
  }

  return {
    businessName: toStringValue(data.businessName),
    industry: toStringValue(data.industry),
    country: toStringValue(data.country),
    city: toStringValue(data.city),
    description: toStringValue(data.description),

    services: toStringArray(data.services),
    products: toStringArray(data.products),

    targetAudience: toStringValue(
      data.targetAudience,
    ),

    primaryGoal: toStringValue(data.primaryGoal),

    primaryKeywords: toStringArray(
      data.primaryKeywords,
    ),

    targetLocations: toStringArray(
      data.targetLocations,
    ),

    brandTone: toStringValue(data.brandTone),

    uniqueSellingPoint: toStringValue(
      data.uniqueSellingPoint,
    ),
  };
}

function priorityTone(
  priority: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  const key = String(priority || '').toUpperCase();
  if (key === 'CRITICAL') return 'danger';
  if (key === 'HIGH') return 'warning';
  if (key === 'MEDIUM') return 'info';
  return 'neutral';
}

function actionStatusTone(
  status: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  const key = String(status || '').toUpperCase();
  if (key === 'DONE' || key === 'COMPLETED') return 'positive';
  if (key === 'IN_PROGRESS') return 'info';
  if (key === 'DISMISSED') return 'neutral';
  return 'neutral';
}

export default function BusinessBrainPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [brain, setBrain] =
    useState<BusinessBrain | null>(null);

  const [context, setContext] =
    useState<BusinessContext | null>(null);

  const [loadingContext, setLoadingContext] =
    useState(false);

  const [form, setForm] =
    useState<BrainForm>(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [loadingRecommendations, setLoadingRecommendations] =
    useState(false);

  const [recommendations, setRecommendations] =
    useState<BusinessBrainRecommendation[]>([]);

  const [actions, setActions] =
    useState<RenkooAction[]>([]);

  const [actionLoading, setActionLoading] =
    useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void loadWebsites();
  }, []);

  useEffect(() => {
    if (!websiteId) {
      setBrain(null);
      setContext(null);
      setForm(EMPTY_FORM);
      setRecommendations([]);
      setActions([]);
      return;
    }

    void Promise.all([
      loadBrain(),
      loadContext(),
      loadRecommendations(),
      loadActions(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  async function loadContext() {
    if (!websiteId) {
      setContext(null);
      return;
    }

    try {
      setLoadingContext(true);

      const data = await getBusinessContext(
        websiteId,
      );

      setContext(data);
    } catch {
      setContext(null);
    } finally {
      setLoadingContext(false);
    }
  }

  async function loadWebsites() {
    try {
      setLoading(true);
      setError('');

      const data = await getWebsites();

      const safeWebsites = Array.isArray(data)
        ? data
        : [];

      setWebsites(safeWebsites);

      if (safeWebsites.length > 0) {
        setWebsiteId(safeWebsites[0].id);
      }
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load websites',
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadBrain() {
    if (!websiteId) return;

    try {
      const data = await getBusinessBrain(
        websiteId,
      );

      const normalized = normalizeBrain(data);

      setBrain(normalized);
      setForm(brainToForm(normalized));
    } catch (err: any) {
      setBrain(null);
      setForm(EMPTY_FORM);

      const message =
        err?.message ||
        'Failed to load Business Brain';

      if (
        !message
          .toLowerCase()
          .includes('not found')
      ) {
        setError(message);
      }
    }
  }

  async function loadRecommendations() {
    if (!websiteId) return;

    try {
      setLoadingRecommendations(true);

      const data =
        await getBusinessBrainRecommendations(
          websiteId,
        );

      setRecommendations(
        Array.isArray(data?.recommendations)
          ? data.recommendations
          : [],
      );
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load recommendations',
      );
    } finally {
      setLoadingRecommendations(false);
    }
  }

  async function loadActions() {
    if (!websiteId) return;

    try {
      const data = await getActions();

      setActions(Array.isArray(data?.actions) ? data.actions : []);
    } catch (err: any) {
      console.error(
        '[RENKOO] LOAD ACTIONS ERROR',
        err,
      );

      setError(
        err?.message ||
          'Failed to load actions',
      );
    }
  }

  async function handleAnalyze() {
    if (!websiteId) return;

    try {
      setAnalyzing(true);
      setError('');
      setSuccess('');

      const data =
        await analyzeBusinessBrain(
          websiteId,
        );

      const normalized =
        normalizeBrain(data);

      if (!normalized) {
        throw new Error(
          'Analysis returned an invalid Business Brain response.',
        );
      }

      setBrain(normalized);
      setForm(brainToForm(normalized));

      await Promise.all([
        loadContext(),
        loadRecommendations(),
        loadActions(),
      ]);

      setSuccess(
        'Business Brain analyzed successfully.',
      );
    } catch (err: any) {
      setError(
        err?.message ||
          'Analysis failed',
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!websiteId) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = {
        businessName:
          form.businessName.trim() || null,

        industry:
          form.industry.trim() || null,

        country:
          form.country.trim() || null,

        city:
          form.city.trim() || null,

        description:
          form.description.trim() || null,

        services:
          toStringArray(form.services),

        products:
          toStringArray(form.products),

        targetAudience:
          form.targetAudience.trim() || null,

        primaryGoal:
          form.primaryGoal.trim() || null,

        primaryKeywords:
          toStringArray(
            form.primaryKeywords,
          ),

        targetLocations:
          toStringArray(
            form.targetLocations,
          ),

        brandTone:
          form.brandTone.trim() || null,

        uniqueSellingPoint:
          form.uniqueSellingPoint.trim() ||
          null,
      };

      const data =
        await updateBusinessBrain(
          websiteId,
          payload,
        );

      const normalized =
        normalizeBrain(data);

      if (!normalized) {
        throw new Error(
          'Save returned an invalid Business Brain response.',
        );
      }

      setBrain(normalized);
      setForm(brainToForm(normalized));

      await loadContext();

      setSuccess(
        'Business Brain saved successfully.',
      );
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to save Business Brain',
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * IMPORTANT:
   * Create Action uses the recommendation ID,
   * then immediately reloads the real Actions DB data.
   */
  async function handleCreateAction(
    recommendationId: string,
  ) {
    const id = String(recommendationId || '').trim();

    if (!id) {
      setError('Invalid recommendation.');
      return;
    }

    if (actionLoading !== null) {
      return;
    }

    console.log('[RENKOO] CREATE ACTION CLICKED', id);

    setActionLoading(id);
    setError('');
    setSuccess('');

    try {
      console.log('[RENKOO] CREATE ACTION API START', id);

      const created =
        await createActionFromRecommendation(id);

      console.log(
        '[RENKOO] CREATE ACTION API SUCCESS',
        created,
      );

      if (!created?.id) {
        throw new Error(
          'Action API returned an invalid response.',
        );
      }

      /*
       * IMPORTANT:
       * The POST already returned the real persisted Action.
       * Add it immediately to local state.
       */
      setActions((current) => {
        const existing = current.filter(
          (action) => action.id !== created.id,
        );

        return [
          created,
          ...existing,
        ];
      });

      /*
       * Refresh recommendation status.
       * This is intentionally separate from the Action state.
       */
      try {
        await loadRecommendations();
      } catch (reloadError) {
        console.error(
          '[RENKOO] RECOMMENDATIONS RELOAD ERROR',
          reloadError,
        );
      }

      /*
       * Reload Actions for consistency.
       * If the GET response is stale/empty, don't allow it
       * to erase the Action we just successfully created.
       */
      try {
        const refreshed = await getActions();

        if (
          Array.isArray(refreshed?.actions) && refreshed.actions.length > 0
        ) {
          setActions((current) => {
            const merged = [
              ...refreshed.actions,
              ...current,
            ];

            const unique = new Map(
              merged.map((action) => [
                action.id,
                action,
              ]),
            );

            return Array.from(unique.values());
          });
        }
      } catch (reloadError) {
        console.error(
          '[RENKOO] ACTIONS RELOAD ERROR',
          reloadError,
        );
      }

      /*
       * FINAL GUARANTEE:
       * Keep the Action returned by POST visible even if
       * another request returned stale data.
       */
      setActions((current) => {
        const withoutCreated = current.filter(
          (action) => action.id !== created.id,
        );

        return [
          created,
          ...withoutCreated,
        ];
      });

      setSuccess(
        'Action created successfully.',
      );

    } catch (err: any) {
      console.error(
        '[RENKOO] CREATE ACTION ERROR',
        err,
      );

      setError(
        err?.message ||
          'Failed to create action',
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleActionStatus(
    actionId: string,
    status: RenkooAction['status'],
  ) {
    if (!actionId) return;

    try {
      setActionLoading(actionId);
      setError('');
      setSuccess('');

      await updateActionStatus(
        actionId,
        status,
      );

      await Promise.all([
        loadActions(),
        loadRecommendations(),
      ]);

      setSuccess(
        `Action moved to ${status.replace(
          '_',
          ' ',
        )}.`,
      );
    } catch (err: any) {
      console.error(
        'UPDATE_ACTION_ERROR:',
        err,
      );

      setError(
        err?.message ||
          'Failed to update action',
      );
    } finally {
      setActionLoading(null);
    }
  }

  function updateField(
    field: keyof BrainForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateArrayField(
    field:
      | 'services'
      | 'products'
      | 'primaryKeywords'
      | 'targetLocations',
    value: string,
  ) {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setForm((current) => ({
      ...current,
      [field]: items,
    }));
  }

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
  }

  const selectedWebsite =
    websites.find(
      (item) => item.id === websiteId,
    );

  const hasBrain = Boolean(
    brain &&
      (brain.businessName ||
        brain.industry ||
        brain.description ||
        brain.targetAudience ||
        brain.primaryGoal ||
        brain.city ||
        brain.country ||
        brain.brandTone ||
        brain.uniqueSellingPoint ||
        (Array.isArray(brain.services) &&
          brain.services.length > 0) ||
        (Array.isArray(brain.products) &&
          brain.products.length > 0) ||
        (Array.isArray(brain.primaryKeywords) &&
          brain.primaryKeywords.length > 0) ||
        (Array.isArray(brain.targetLocations) &&
          brain.targetLocations.length > 0) ||
        brain.aiSummary),
  );

  const score =
    brain &&
    typeof brain.businessScore ===
      'number'
      ? brain.businessScore
      : 0;

  const websiteActions =
    actions.filter(
      (action) =>
        action.websiteId === websiteId,
    );

  const recommendationColumns: DataTableColumn<BusinessBrainRecommendation>[] = [
    {
      key: 'recommendation',
      label: 'Recommendation',
      priority: 'high',
      render: (recommendation) => {
        const linkedAction =
          websiteActions.find(
            (action) =>
              action.recommendationId ===
              recommendation.id,
          );
        return (
          <span className="block min-w-0">
            <span className="block font-bold text-rk-ink">
              {recommendation.title}
            </span>
            <span className="mt-0.5 block text-[13px] leading-5 text-rk-secondary">
              {recommendation.description}
            </span>
            {linkedAction ? (
              <span className="rk-metadata mt-1 block">
                Linked action: {linkedAction.status.replace('_', ' ')}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'priority',
      label: 'Priority',
      priority: 'high',
      render: (recommendation) => (
        <Badge
          label={String(
            recommendation.priority || 'MEDIUM',
          )}
          tone={priorityTone(
            String(
              recommendation.priority || 'MEDIUM',
            ),
          )}
        />
      ),
    },
    {
      key: 'type',
      label: 'Type',
      priority: 'medium',
      render: (recommendation) => (
        <Badge
          label={String(recommendation.type || '—')}
          tone="neutral"
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (recommendation) => (
        <Badge
          label={String(recommendation.status || 'OPEN')}
          tone={actionStatusTone(
            String(recommendation.status || 'OPEN'),
          )}
        />
      ),
    },
  ];

  const actionColumns: DataTableColumn<RenkooAction>[] = [
    {
      key: 'action',
      label: 'Action',
      priority: 'high',
      render: (action) => (
        <span className="block min-w-0">
          <span className="block font-bold text-rk-ink">
            {action.title}
          </span>
          {action.description ? (
            <span className="mt-0.5 block text-[13px] leading-5 text-rk-secondary">
              {action.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'high',
      render: (action) => (
        <Badge
          label={String(action.status || 'TODO')}
          tone={actionStatusTone(String(action.status || ''))}
        />
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      priority: 'medium',
      render: (action) => (
        <Badge
          label={String(action.priority || '—')}
          tone={priorityTone(String(action.priority || ''))}
        />
      ),
    },
  ];

  return (
    <AppShell
      mobileOpen={mobileOpen}
      onClose={() => setMobileOpen(false)}
      onMenu={() => setMobileOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Foundation"
          title="Business Brain"
          description="Your business context powering RENKOO AI."
          meta={
            <>
              {selectedWebsite ? (
                <span className="truncate">{selectedWebsite.name}</span>
              ) : (
                <span>No website selected</span>
              )}
              <span aria-hidden>·</span>
              {brain?.lastAnalyzedAt ? (
                <span>
                  Analyzed{' '}
                  {new Date(
                    brain.lastAnalyzedAt,
                  ).toLocaleDateString()}
                </span>
              ) : (
                <span>Never analyzed</span>
              )}
              <span aria-hidden>·</span>
              <DataSourceBadge
                source="Business Brain"
                connected={hasBrain}
              />
            </>
          }
          actions={
            <>
              <SecondaryButton
                onClick={() => {
                  void handleSave();
                }}
                disabled={
                  saving || analyzing || !websiteId
                }
              >
                <Save size={14} aria-hidden />
                {saving ? 'Saving…' : 'Save'}
              </SecondaryButton>

              <PrimaryButton
                onClick={() => {
                  void handleAnalyze();
                }}
                disabled={
                  analyzing || saving || !websiteId
                }
              >
                <Sparkles size={14} aria-hidden />
                {analyzing ? 'Analyzing…' : 'Analyze'}
              </PrimaryButton>
            </>
          }
        />

        <div className="mt-5">
          <FilterBar
            selects={[
              {
                key: 'website',
                label: 'Website',
                value: websiteId,
                options: websites.map((website) => ({
                  value: website.id,
                  label: website.name,
                })),
                onChange: handleWebsiteChange,
              },
            ]}
            meta={
              selectedWebsite
                ? `Showing business context for ${selectedWebsite.name}`
                : 'Select a website to load its Business Brain'
            }
          />
        </div>

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

        {success ? (
          <div className="mt-4">
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-rk-md border border-rk-success/30 bg-rk-successSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-success"
            >
              <CheckCircle2
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">{success}</span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                aria-label="Dismiss message"
                className="rk-focusable grid h-7 w-7 shrink-0 place-items-center rounded-rk-sm hover:bg-rk-success/10"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4">
            <LoadingBlock title="Loading Business Brain…" lines={5} />
          </div>
        ) : !websiteId ? (
          <div className="mt-4">
            <EmptyState
              title="No website configured"
              description="Add a website first to build its Business Brain."
              icon={<Brain size={18} aria-hidden />}
            />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <UnderstandingPanel
                context={context}
                loading={loadingContext}
              />
            </div>

            <section aria-label="Profile completeness" className="mt-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <SharedMetric
                    label="Brain score"
                    value={hasBrain ? `${score} / 100` : '—'}
                    detail={
                      hasBrain
                        ? 'Profile completeness'
                        : 'No business context yet'
                    }
                    tone={hasBrain && score >= 70 ? 'positive' : 'neutral'}
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <SharedMetric
                    label="Recommendations"
                    value={String(recommendations.length)}
                    detail="AI opportunities from analysis"
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <SharedMetric
                    label="Actions"
                    value={String(websiteActions.length)}
                    detail="Tracked execution"
                  />
                </div>
              </div>
            </section>

            <div className="mt-6">
              <Panel
                eyebrow="Business identity"
                title="Core business information"
                description="This context powers RENKOO AI across SEO, content, visibility and growth workflows."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={
                      saving || analyzing || !websiteId
                    }
                  >
                    <Save size={14} aria-hidden />
                    {saving ? 'Saving…' : 'Save'}
                  </SecondaryButton>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Business Name"
                    value={form.businessName}
                    onChange={(value) =>
                      updateField('businessName', value)
                    }
                  />

                  <Field
                    label="Industry"
                    value={form.industry}
                    onChange={(value) =>
                      updateField('industry', value)
                    }
                  />

                  <Field
                    label="Country"
                    value={form.country}
                    onChange={(value) =>
                      updateField('country', value)
                    }
                  />

                  <Field
                    label="City"
                    value={form.city}
                    onChange={(value) =>
                      updateField('city', value)
                    }
                  />

                  <Field
                    label="Target Audience"
                    value={form.targetAudience}
                    onChange={(value) =>
                      updateField('targetAudience', value)
                    }
                  />

                  <Field
                    label="Primary Goal"
                    value={form.primaryGoal}
                    onChange={(value) =>
                      updateField('primaryGoal', value)
                    }
                  />

                  <Field
                    label="Brand Tone"
                    value={form.brandTone}
                    onChange={(value) =>
                      updateField('brandTone', value)
                    }
                  />

                  <Field
                    label="Unique Selling Point"
                    value={form.uniqueSellingPoint}
                    onChange={(value) =>
                      updateField(
                        'uniqueSellingPoint',
                        value,
                      )
                    }
                  />

                  <div className="md:col-span-2">
                    <label className="rk-field-label">
                      Business Description
                    </label>

                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        updateField(
                          'description',
                          e.target.value,
                        )
                      }
                      rows={5}
                      className="rk-input mt-1.5 resize-y"
                      placeholder="Describe what the business does..."
                    />
                  </div>
                </div>
              </Panel>
            </div>

            <div className="mt-6">
              <Panel
                eyebrow="Business data"
                title="Offerings & targeting"
                description="Separate multiple items with commas."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <ArrayCard
                    title="Services"
                    value={form.services}
                    onChange={(value) =>
                      updateArrayField('services', value)
                    }
                  />

                  <ArrayCard
                    title="Products"
                    value={form.products}
                    onChange={(value) =>
                      updateArrayField('products', value)
                    }
                  />

                  <ArrayCard
                    title="Primary Keywords"
                    value={form.primaryKeywords}
                    onChange={(value) =>
                      updateArrayField(
                        'primaryKeywords',
                        value,
                      )
                    }
                  />

                  <ArrayCard
                    title="Target Locations"
                    value={form.targetLocations}
                    onChange={(value) =>
                      updateArrayField(
                        'targetLocations',
                        value,
                      )
                    }
                  />
                </div>
              </Panel>
            </div>

            {!hasBrain ? (
              <div className="mt-6">
                <EmptyState
                  title="No Business Brain yet"
                  description="Add business details above or run analysis to build the profile. No score is shown until real business context exists."
                  actionLabel={
                    analyzing ? 'Analyzing…' : 'Analyze Business Brain'
                  }
                  onAction={() => {
                    void handleAnalyze();
                  }}
                  icon={<Brain size={18} aria-hidden />}
                />
              </div>
            ) : null}

            <div className="mt-6">
              <Panel
                eyebrow="Growth recommendations"
                title="AI opportunities from analysis"
                description="Real recommendations generated from your Business Brain analysis."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={() => {
                      void loadRecommendations();
                    }}
                    disabled={
                      loadingRecommendations || !websiteId
                    }
                  >
                    <RefreshCw
                      size={14}
                      aria-hidden
                      className={
                        loadingRecommendations
                          ? 'animate-spin'
                          : ''
                      }
                    />
                    Refresh
                  </SecondaryButton>
                }
                padded={false}
              >
                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Growth recommendations"
                    columns={recommendationColumns}
                    rows={recommendations}
                    keyOf={(recommendation) =>
                      recommendation.id
                    }
                    loading={loadingRecommendations}
                    emptyTitle="No recommendations yet"
                    emptyDescription="Run Business Brain analysis to generate real recommendations."
                    pageSize={8}
                    rowActions={(recommendation) => {
                      const linkedAction =
                        websiteActions.find(
                          (action) =>
                            action.recommendationId ===
                            recommendation.id,
                        );
                      const isCompleted =
                        recommendation.status ===
                        'COMPLETED';
                      const isCreating =
                        actionLoading ===
                        recommendation.id;

                      if (linkedAction) {
                        if (
                          linkedAction.status ===
                          'TODO'
                        ) {
                          return [
                            {
                              label:
                                actionLoading ===
                                linkedAction.id
                                  ? 'Starting…'
                                  : 'Start',
                              onSelect: () =>
                                void handleActionStatus(
                                  linkedAction.id,
                                  'IN_PROGRESS',
                                ),
                            },
                          ];
                        }
                        if (
                          linkedAction.status ===
                          'IN_PROGRESS'
                        ) {
                          return [
                            {
                              label:
                                actionLoading ===
                                linkedAction.id
                                  ? 'Completing…'
                                  : 'Complete',
                              onSelect: () =>
                                void handleActionStatus(
                                  linkedAction.id,
                                  'DONE',
                                ),
                            },
                          ];
                        }
                        return [];
                      }

                      return [
                        {
                          label: isCreating
                            ? 'Creating…'
                            : isCompleted
                              ? 'Completed'
                              : 'Create Action',
                          onSelect: () =>
                            void handleCreateAction(
                              recommendation.id,
                            ),
                        },
                      ];
                    }}
                    renderExpanded={(recommendation) => (
                      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                        {recommendation.actionText ? (
                          <div className="sm:col-span-2">
                            <dt className="rk-field-label">
                              Suggested action
                            </dt>
                            <dd className="mt-0.5 font-medium text-rk-ink">
                              {recommendation.actionText}
                            </dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="rk-field-label">Impact</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {recommendation.impact || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Effort</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {recommendation.effort || '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  />
                </div>
              </Panel>
            </div>

            <div className="mt-6">
              <Panel
                eyebrow="Execution"
                title="Actions"
                description="Execute recommendations and track their status."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={() => {
                      void loadActions();
                    }}
                    disabled={!websiteId}
                  >
                    <RefreshCw size={14} aria-hidden />
                    Refresh
                  </SecondaryButton>
                }
                padded={false}
              >
                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Actions from recommendations"
                    columns={actionColumns}
                    rows={websiteActions}
                    keyOf={(action) => action.id}
                    loading={false}
                    emptyTitle="No actions created yet"
                    emptyDescription="Create an action from a recommendation above."
                    pageSize={8}
                    rowActions={(action) => {
                      if (
                        action.status === 'TODO'
                      ) {
                        return [
                          {
                            label:
                              actionLoading ===
                              action.id
                                ? 'Starting…'
                                : 'Start',
                            onSelect: () =>
                              void handleActionStatus(
                                action.id,
                                'IN_PROGRESS',
                              ),
                          },
                        ];
                      }
                      if (
                        action.status ===
                        'IN_PROGRESS'
                      ) {
                        return [
                          {
                            label:
                              actionLoading ===
                              action.id
                                ? 'Completing…'
                                : 'Complete',
                            onSelect: () =>
                              void handleActionStatus(
                                action.id,
                                'DONE',
                              ),
                          },
                        ];
                      }
                      return [];
                    }}
                    renderExpanded={(action) => (
                      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                        <div>
                          <dt className="rk-field-label">Priority</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {String(action.priority || '—')}
                          </dd>
                        </div>
                        {action.completedAt ? (
                          <div>
                            <dt className="rk-field-label">
                              Completed
                            </dt>
                            <dd className="mt-0.5 font-medium text-rk-ink">
                              {new Date(
                                action.completedAt,
                              ).toLocaleString()}
                            </dd>
                          </div>
                        ) : null}
                        {action.description ? (
                          <div className="sm:col-span-2">
                            <dt className="rk-field-label">
                              Description
                            </dt>
                            <dd className="mt-0.5 font-medium text-rk-ink">
                              {action.description}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    )}
                  />
                </div>
              </Panel>
            </div>

            <div className="mt-6">
              <Panel
                eyebrow="AI context"
                title="How RENKOO uses this"
                description="This Business Brain becomes the context used by RENKOO's AI-powered SEO, content, visibility and growth workflows."
              >
                {brain?.aiSummary ? (
                  <InsightBlock
                    eyebrow="RENKOO AI summary"
                    title="Business understanding"
                    cause={brain.aiSummary}
                  />
                ) : (
                  <p className="rk-metadata">
                    No AI summary yet. Run analysis to
                    generate one from real business
                    context.
                  </p>
                )}
              </Panel>
            </div>

            {selectedWebsite ? (
              <div className="mt-6">
                <Panel
                  eyebrow="Connected website"
                  title={selectedWebsite.name}
                  description={selectedWebsite.url}
                >
                  <RecommendationCallout
                    title="Execution, honestly"
                    text="Business context sharpens prioritization across RENKOO. Review growth opportunities to act on it."
                    actionLabel="Review opportunities"
                    actionHref="/opportunities"
                  />
                </Panel>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="rk-field-label">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="rk-input mt-1.5"
      />
    </div>
  );
}

function ArrayCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string[] | null | undefined;
  onChange: (value: string) => void;
}) {
  const safeValue =
    Array.isArray(value)
      ? value
      : [];

  const inputValue =
    safeValue.join(', ');

  return (
    <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
      <p className="rk-field-label">
        {title}
      </p>

      <input
        value={inputValue}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="rk-input mt-1.5"
        placeholder={`Add ${title.toLowerCase()}...`}
        aria-label={title}
      />

      {safeValue.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {safeValue.map(
            (item, index) => (
              <Badge
                key={`${item}-${index}`}
                label={item}
                tone="neutral"
              />
            ),
          )}
        </div>
      ) : (
        <p className="rk-metadata mt-2">
          No data available yet.
        </p>
      )}
    </div>
  );
}

const DATA_SOURCE_LABELS: Array<{
  key: keyof BusinessContext['dataAvailability'];
  label: string;
}> = [
  { key: 'crawl', label: 'Technical crawl' },
  { key: 'competitors', label: 'Competitors' },
  { key: 'aiVisibility', label: 'AI visibility' },
  { key: 'geo', label: 'GEO' },
  { key: 'leads', label: 'Leads' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'recommendations', label: 'Recommendations' },
];

const GOAL_SOURCE_HINTS: Array<{
  keywords: string[];
  hint: string;
}> = [
  {
    keywords: ['lead', 'enquiry', 'demo', 'quote', 'booking'],
    hint: 'Search, content and GEO opportunities receive higher business relevance.',
  },
  {
    keywords: ['local'],
    hint: 'GEO opportunities receive higher business relevance.',
  },
  {
    keywords: ['sale', 'revenue', 'purchase', 'order', 'shop'],
    hint: 'Search, content and backlink opportunities receive higher business relevance.',
  },
  {
    keywords: ['traffic', 'visibility', 'ranking', 'growth'],
    hint: 'Search, technical, competitor, backlink, GEO and AEO opportunities receive higher business relevance.',
  },
  {
    keywords: ['brand', 'awareness', 'authority'],
    hint: 'GEO, AEO and backlink opportunities receive higher business relevance.',
  },
];

function goalHint(goal: string | null): string {
  if (!goal) {
    return 'Set a primary business goal to let RENKOO weigh opportunities by business relevance. Until then, prioritization uses pure evidence scoring.';
  }

  const lower = goal.toLowerCase();
  const match = GOAL_SOURCE_HINTS.find((entry) =>
    entry.keywords.some((keyword) =>
      lower.includes(keyword),
    ),
  );

  if (!match) {
    return `Goal "${goal}" is saved. It does not match a known prioritization pattern yet, so scoring still uses pure evidence.`;
  }

  return `Goal "${goal}": ${match.hint}`;
}

function buildUnderstanding(
  context: BusinessContext,
): string[] {
  const lines: string[] = [];
  const profile = context.profile;
  const name =
    profile?.businessName ||
    context.website.name ||
    'This business';

  const offerings = [
    ...context.offerings.services,
    ...context.offerings.products,
  ].slice(0, 5);

  lines.push(
    offerings.length > 0
      ? `${name} offers ${offerings.join(', ')}${offerings.length === 5 ? ', and more' : ''}.`
      : `RENKOO does not yet know what ${name} sells.`,
  );

  lines.push(
    context.priorities.targetAudience
      ? `It serves ${context.priorities.targetAudience}.`
      : 'Its target audience is not described yet.',
  );

  lines.push(
    context.priorities.targetLocations.length > 0
      ? `It operates in ${context.priorities.targetLocations.slice(0, 5).join(', ')}.`
      : 'Its operating markets are not configured yet.',
  );

  lines.push(
    context.priorities.primaryGoal
      ? `What matters most: ${context.priorities.primaryGoal}.`
      : 'No primary business goal is set yet.',
  );

  return lines;
}

function UnderstandingPanel({
  context,
  loading,
}: {
  context: BusinessContext | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <LoadingBlock title="Loading business understanding…" lines={3} />
    );
  }

  if (!context) {
    return (
      <Panel
        eyebrow="RENKOO understanding"
        title="Business context unavailable"
        description="Configure the profile below and run an analysis."
      >
        <EmptyState
          title="No business understanding yet"
          description="Business context is unavailable right now. Configure the profile below and run an analysis."
        />
      </Panel>
    );
  }

  const connected = DATA_SOURCE_LABELS.filter(
    (source) => context.dataAvailability[source.key],
  );
  const unavailable = DATA_SOURCE_LABELS.filter(
    (source) => !context.dataAvailability[source.key],
  );

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="RENKOO understanding · deterministic, no AI judgment"
        title="What RENKOO knows"
        description={`Context confidence ${context.contextConfidence}% · ${context.confidenceFormula}`}
      >
        <ul className="space-y-2">
          {buildUnderstanding(context).map((line, index) => (
            <li
              key={index}
              className="text-sm leading-6 text-rk-ink"
            >
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <SharedMetric
            label="Context confidence"
            value={`${context.contextConfidence}%`}
            detail={context.confidenceFormula}
          />
        </div>
      </Panel>

      <Panel
        eyebrow="Data coverage"
        title="Connected sources"
        description="Only sources with real data are listed as connected."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="rk-field-label">
              Connected ({connected.length})
            </p>
            {connected.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {connected.map((source) => (
                  <Badge
                    key={source.key}
                    label={source.label}
                    tone="positive"
                  />
                ))}
              </div>
            ) : (
              <p className="rk-metadata mt-2">
                No data sources connected yet.
              </p>
            )}
          </div>
          <div>
            <p className="rk-field-label">
              Not connected ({unavailable.length})
            </p>
            {unavailable.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unavailable.map((source) => (
                  <Badge
                    key={source.key}
                    label={source.label}
                    tone="neutral"
                  />
                ))}
              </div>
            ) : (
              <p className="rk-metadata mt-2">
                Every tracked source is connected.
              </p>
            )}
          </div>
        </div>
        {context.competitors.length > 0 && (
          <div className="mt-4 border-t border-rk-border pt-4">
            <p className="rk-field-label">
              Competitive context ({context.competitors.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {context.competitors.map((competitor) => (
                <Badge
                  key={competitor.id}
                  label={competitor.name}
                  tone="neutral"
                />
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Priority impact"
        title="How goals shape prioritization"
        description="Business relevance adds at most +5 to an opportunity score and is always recorded transparently. Evidence scoring decides everything else."
      >
        <p className="text-sm leading-6 text-rk-secondary">
          {goalHint(context.priorities.primaryGoal)}
        </p>
      </Panel>

      {context.missing.length > 0 && (
        <Panel
          eyebrow={`Missing context (${context.missing.length})`}
          title="Complete the picture"
          description="These gaps reduce context confidence."
        >
          <ul className="space-y-1.5">
            {context.missing.map((item, index) => (
              <li
                key={index}
                className="text-sm leading-6 text-rk-secondary"
              >
                · {item}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
