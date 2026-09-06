'use client';

import { useEffect, useState } from 'react';
import {
  Brain,
  RefreshCw,
  Sparkles,
  Save,
  AlertTriangle,
  CheckCircle2,
  Play,
  ListTodo,
  Menu,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';
import {
  DataSourceBadge,
  FreshnessBadge,
} from '../../components/ui/badge';
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

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <main className="lg:ml-64">
        <div className="mx-auto max-w-[1440px] p-5 lg:p-8">

          {/* HEADER */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() =>
                  setMobileOpen(true)
                }
                aria-label="Open menu"
                className="mt-1 border border-[#e5e7eb] bg-white p-2 text-[#111827] lg:hidden"
              >
                <Menu size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <Brain
                    size={24}
                    className="text-[#111827]"
                  />

                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                    Business Brain
                  </h1>
                </div>

                <p className="mt-1 text-sm text-[#6b7280]">
                  Your business context powering
                  RENKOO AI.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={websiteId}
                onChange={(e) =>
                  setWebsiteId(
                    e.target.value,
                  )
                }
                disabled={
                  websites.length === 0
                }
                className="rounded-none border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium outline-none focus:border-[#111827]"
              >
                {websites.length === 0 ? (
                  <option value="">
                    No websites
                  </option>
                ) : (
                  websites.map(
                    (website) => (
                      <option
                        key={website.id}
                        value={website.id}
                      >
                        {website.name}
                      </option>
                    ),
                  )
                )}
              </select>

              <button
                type="button"
                onClick={() => {
                  void handleAnalyze();
                }}
                disabled={
                  analyzing ||
                  saving ||
                  !websiteId
                }
                className="flex items-center gap-2 rounded-none bg-[#111827] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? (
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Sparkles size={16} />
                )}

                {analyzing
                  ? 'Analyzing...'
                  : 'Analyze'}
              </button>
            </div>
          </div>

          {websiteId ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <DataSourceBadge
                source="Business Brain"
                connected={hasBrain}
              />
              <FreshnessBadge
                label={
                  brain?.lastAnalyzedAt
                    ? `Analyzed ${new Date(
                        brain.lastAnalyzedAt,
                      ).toLocaleDateString()}`
                    : 'Never analyzed'
                }
              />
            </div>
          ) : null}

          {/* ERROR */}
          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-none border border-red-200 bg-[#fafafa] p-4 text-sm text-[#4b5563]">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />

              <span>{error}</span>
            </div>
          )}

          {/* SUCCESS */}
          {success && (
            <div className="mt-6 flex items-center gap-2 rounded-none border border-emerald-200 bg-[#f3f4f6] p-4 text-sm font-semibold text-[#374151]">
              <CheckCircle2 size={17} />
              <span>{success}</span>
            </div>
          )}

          {/* LOADING */}
          {loading ? (
            <div className="mt-8 rounded-none border border-[#e5e7eb] bg-white p-10">
              <div className="flex items-center gap-3 text-sm text-[#6b7280]">
                <RefreshCw
                  size={20}
                  className="animate-spin text-[#111827]"
                />

                Loading Business Brain...
              </div>
            </div>
          ) : !websiteId ? (
            <div className="mt-8 rounded-none border border-[#e5e7eb] bg-white p-10 text-center">
              <Brain
                size={40}
                className="mx-auto text-[#c4c8ce]"
              />

              <h2 className="mt-4 text-lg font-bold text-[#111827]">
                No website configured
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-[#6b7280]">
                Add a website first to build
                its Business Brain.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-5">

              <UnderstandingPanel
                context={context}
                loading={loadingContext}
              />

              {/* BUSINESS IDENTITY */}
              <section className="rounded-none border border-[#e5e7eb] bg-white p-6 ">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                      Business Identity
                    </h2>

                    <p className="mt-1 text-xs text-[#6b7280]">
                      Core information about the
                      business.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={
                      saving ||
                      analyzing ||
                      !websiteId
                    }
                    className="flex items-center justify-center gap-2 rounded-none border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <RefreshCw
                        size={15}
                        className="animate-spin"
                      />
                    ) : (
                      <Save size={15} />
                    )}

                    {saving
                      ? 'Saving...'
                      : 'Save'}
                  </button>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">

                  <Field
                    label="Business Name"
                    value={
                      form.businessName
                    }
                    onChange={(value) =>
                      updateField(
                        'businessName',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Industry"
                    value={
                      form.industry
                    }
                    onChange={(value) =>
                      updateField(
                        'industry',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Country"
                    value={
                      form.country
                    }
                    onChange={(value) =>
                      updateField(
                        'country',
                        value,
                      )
                    }
                  />

                  <Field
                    label="City"
                    value={form.city}
                    onChange={(value) =>
                      updateField(
                        'city',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Target Audience"
                    value={
                      form.targetAudience
                    }
                    onChange={(value) =>
                      updateField(
                        'targetAudience',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Primary Goal"
                    value={
                      form.primaryGoal
                    }
                    onChange={(value) =>
                      updateField(
                        'primaryGoal',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Brand Tone"
                    value={
                      form.brandTone
                    }
                    onChange={(value) =>
                      updateField(
                        'brandTone',
                        value,
                      )
                    }
                  />

                  <Field
                    label="Unique Selling Point"
                    value={
                      form.uniqueSellingPoint
                    }
                    onChange={(value) =>
                      updateField(
                        'uniqueSellingPoint',
                        value,
                      )
                    }
                  />

                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-[#4b5563]">
                      Business Description
                    </label>

                    <textarea
                      value={
                        form.description
                      }
                      onChange={(e) =>
                        updateField(
                          'description',
                          e.target.value,
                        )
                      }
                      rows={5}
                      className="mt-2 w-full rounded-none border border-[#e5e7eb] px-4 py-3 text-sm outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f3f4f6]"
                      placeholder="Describe what the business does..."
                    />
                  </div>
                </div>
              </section>

              {/* BUSINESS DATA */}
              <section className="grid gap-5 md:grid-cols-2">

                <ArrayCard
                  title="Services"
                  value={
                    form.services
                  }
                  onChange={(value) =>
                    updateArrayField(
                      'services',
                      value,
                    )
                  }
                />

                <ArrayCard
                  title="Products"
                  value={
                    form.products
                  }
                  onChange={(value) =>
                    updateArrayField(
                      'products',
                      value,
                    )
                  }
                />

                <ArrayCard
                  title="Primary Keywords"
                  value={
                    form.primaryKeywords
                  }
                  onChange={(value) =>
                    updateArrayField(
                      'primaryKeywords',
                      value,
                    )
                  }
                />

                <ArrayCard
                  title="Target Locations"
                  value={
                    form.targetLocations
                  }
                  onChange={(value) =>
                    updateArrayField(
                      'targetLocations',
                      value,
                    )
                  }
                />
              </section>

              {/* SCORE */}
              {hasBrain ? (
                <section className="rounded-none border border-[#e5e7eb] bg-white p-6 ">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                        Business Brain Score
                      </h2>

                      <p className="mt-1 text-xs text-[#6b7280]">
                        Profile completeness based on
                        the configured business context.
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-3xl font-bold text-[#111827]">
                        {score}
                        <span className="text-base text-[#9ca3af]">
                          /100
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#111827] transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            score,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </section>
              ) : (
                <section className="rounded-none border border-[#e5e7eb] bg-white p-6 text-center">
                  <Brain
                    size={28}
                    className="mx-auto text-[#c4c8ce]"
                  />
                  <h2 className="mt-2 text-sm font-semibold text-[#111827]">
                    No Business Brain yet
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-xs text-[#6b7280]">
                    Add business details above or run
                    analysis to build the profile.
                    No score is shown until real
                    business context exists.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAnalyze();
                    }}
                    disabled={
                      analyzing ||
                      saving ||
                      !websiteId
                    }
                    className="mx-auto mt-4 flex items-center gap-2 bg-[#111827] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analyzing ? (
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {analyzing
                      ? 'Analyzing...'
                      : 'Analyze Business Brain'}
                  </button>
                </section>
              )}

              {/* RECOMMENDATIONS */}
              <section className="rounded-none border border-[#e5e7eb] bg-white p-6 ">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles
                        size={18}
                        className="text-[#111827]"
                      />

                      <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                        Growth Recommendations
                      </h2>
                    </div>

                    <p className="mt-1 text-xs text-[#6b7280]">
                      AI-generated opportunities from
                      your Business Brain analysis.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void loadRecommendations();
                    }}
                    disabled={
                      loadingRecommendations ||
                      !websiteId
                    }
                    className="flex items-center justify-center gap-2 rounded-none border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f7f8fb] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={
                        loadingRecommendations
                          ? 'animate-spin'
                          : ''
                      }
                    />

                    Refresh
                  </button>
                </div>

                {loadingRecommendations ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-[#6b7280]">
                    <RefreshCw
                      size={16}
                      className="animate-spin text-[#111827]"
                    />

                    Loading recommendations...
                  </div>
                ) : recommendations.length === 0 ? (
                  <div className="mt-6 rounded-none bg-[#f7f8fb] p-6 text-center">
                    <Sparkles
                      size={28}
                      className="mx-auto text-[#c4c8ce]"
                    />

                    <p className="mt-2 text-sm font-medium text-[#4b5563]">
                      No recommendations yet
                    </p>

                    <p className="mt-1 text-xs text-[#9ca3af]">
                      Run Business Brain analysis to
                      generate real recommendations.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {recommendations.map(
                      (recommendation) => {
                        const linkedAction =
                          websiteActions.find(
                            (action) =>
                              action.recommendationId ===
                              recommendation.id,
                          );

                        const priority =
                          String(
                            recommendation.priority ||
                              'MEDIUM',
                          ).toUpperCase();

                        const isCompleted =
                          recommendation.status ===
                          'COMPLETED';

                        const isCreating =
                          actionLoading ===
                          recommendation.id;

                        return (
                          <div
                            key={
                              recommendation.id
                            }
                            className="rounded-none border border-[#e5e7eb] p-4 transition hover:border-[#d1d5db] hover:"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">

                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                      priority ===
                                      'CRITICAL'
                                        ? 'bg-[#f3f4f6] text-[#4b5563]'
                                        : priority ===
                                          'HIGH'
                                        ? 'bg-[#fafafa] text-[#4b5563]'
                                        : priority ===
                                          'MEDIUM'
                                        ? 'bg-[#f3f4f6] text-[#374151]'
                                        : 'bg-slate-100 text-[#4b5563]'
                                    }`}
                                  >
                                    {priority}
                                  </span>

                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
                                    {
                                      recommendation.type
                                    }
                                  </span>

                                  {isCompleted && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                                      <CheckCircle2
                                        size={12}
                                      />
                                      COMPLETED
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-2 text-sm font-bold text-[#111827]">
                                  {
                                    recommendation.title
                                  }
                                </h3>

                                <p className="mt-1 text-xs leading-5 text-[#6b7280]">
                                  {
                                    recommendation.description
                                  }
                                </p>

                                {recommendation.actionText && (
                                  <p className="mt-2 text-xs font-medium text-[#374151]">
                                    ?{' '}
                                    {
                                      recommendation.actionText
                                    }
                                  </p>
                                )}

                                {(recommendation.impact ||
                                  recommendation.effort) && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {recommendation.impact && (
                                      <span className="rounded-none bg-[#f3f4f6] px-2.5 py-1 text-[10px] font-semibold text-[#374151]">
                                        Impact:{' '}
                                        {
                                          recommendation.impact
                                        }
                                      </span>
                                    )}

                                    {recommendation.effort && (
                                      <span className="rounded-none bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-[#4b5563]">
                                        Effort:{' '}
                                        {
                                          recommendation.effort
                                        }
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="shrink-0">

                                {linkedAction ? (
                                  <div className="flex flex-col items-end gap-2">

                                    <span
                                      className={`flex items-center gap-1.5 rounded-none px-3 py-2 text-xs font-bold ${
                                        linkedAction.status ===
                                        'DONE'
                                          ? 'bg-[#f3f4f6] text-[#374151]'
                                          : linkedAction.status ===
                                            'IN_PROGRESS'
                                          ? 'bg-[#f3f4f6] text-[#374151]'
                                          : 'bg-[#fafafa] text-[#374151]'
                                      }`}
                                    >
                                      {linkedAction.status ===
                                      'DONE' ? (
                                        <CheckCircle2
                                          size={14}
                                        />
                                      ) : (
                                        <ListTodo
                                          size={14}
                                        />
                                      )}

                                      {linkedAction.status ===
                                      'DONE'
                                        ? 'Completed'
                                        : linkedAction.status ===
                                          'IN_PROGRESS'
                                        ? 'In Progress'
                                        : 'Action Created'}
                                    </span>

                                    {linkedAction.status ===
                                      'TODO' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleActionStatus(
                                            linkedAction.id,
                                            'IN_PROGRESS',
                                          );
                                        }}
                                        disabled={
                                          actionLoading ===
                                          linkedAction.id
                                        }
                                        className="flex items-center gap-1.5 rounded-none bg-[#f3f4f6]0 px-3 py-2 text-xs font-bold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Play size={13} />
                                        Start
                                      </button>
                                    )}

                                    {linkedAction.status ===
                                      'IN_PROGRESS' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleActionStatus(
                                            linkedAction.id,
                                            'DONE',
                                          );
                                        }}
                                        disabled={
                                          actionLoading ===
                                          linkedAction.id
                                        }
                                        className="flex items-center gap-1.5 rounded-none bg-[#111827] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <CheckCircle2
                                          size={13}
                                        />
                                        Complete
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Create action for ${recommendation.title}`}
                                    onClick={async (event) => {
                                      event.preventDefault();
                                      event.stopPropagation();

                                      if (
                                        isCompleted ||
                                        isCreating
                                      ) {
                                        return;
                                      }

                                      await handleCreateAction(
                                        recommendation.id,
                                      );
                                    }}
                                    disabled={
                                      isCreating ||
                                      isCompleted
                                    }
                                    className="relative z-10 flex min-w-[130px] cursor-pointer items-center justify-center gap-2 rounded-none bg-[#111827] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#374151] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isCreating ? (
                                      <>
                                        <RefreshCw
                                          size={14}
                                          className="animate-spin"
                                        />
                                        Creating...
                                      </>
                                    ) : (
                                      <>
                                        <Play
                                          size={14}
                                        />
                                        Create Action
                                      </>
                                    )}
                                  </button>
                                )}

                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </section>

              {/* ACTIONS */}
              <section className="rounded-none border border-[#e5e7eb] bg-white p-6 ">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ListTodo
                        size={18}
                        className="text-[#111827]"
                      />

                      <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                        Actions
                      </h2>
                    </div>

                    <p className="mt-1 text-xs text-[#6b7280]">
                      Execute recommendations and
                      track their status.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void loadActions();
                    }}
                    disabled={!websiteId}
                    className="flex items-center justify-center gap-2 rounded-none border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f7f8fb] disabled:opacity-50"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

                {websiteActions.length === 0 ? (
                  <div className="mt-5 rounded-none bg-[#f7f8fb] p-6 text-center">
                    <ListTodo
                      size={28}
                      className="mx-auto text-[#c4c8ce]"
                    />

                    <p className="mt-2 text-sm font-medium text-[#4b5563]">
                      No actions created yet
                    </p>

                    <p className="mt-1 text-xs text-[#9ca3af]">
                      Create an action from a
                      recommendation above.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {websiteActions.map(
                      (action) => (
                        <div
                          key={action.id}
                          className="rounded-none border border-[#e5e7eb] p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">

                                <span className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                                  {action.title}
                                </span>

                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                    action.status ===
                                    'DONE'
                                      ? 'bg-[#f3f4f6] text-[#374151]'
                                      : action.status ===
                                        'IN_PROGRESS'
                                      ? 'bg-[#f3f4f6] text-[#374151]'
                                      : action.status ===
                                        'DISMISSED'
                                      ? 'bg-[#fafafa] text-[#4b5563]'
                                      : 'bg-slate-100 text-[#4b5563]'
                                  }`}
                                >
                                  {action.status.replace(
                                    '_',
                                    ' ',
                                  )}
                                </span>

                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-[#6b7280]">
                                  {action.priority}
                                </span>
                              </div>

                              <p className="mt-2 text-xs leading-5 text-[#6b7280]">
                                {action.description}
                              </p>

                              {action.completedAt && (
                                <p className="mt-2 text-[10px] font-medium text-emerald-600">
                                  Completed:{' '}
                                  {new Date(
                                    action.completedAt,
                                  ).toLocaleString()}
                                </p>
                              )}
                            </div>

                            <div className="flex shrink-0 gap-2">

                              {action.status ===
                                'TODO' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleActionStatus(
                                      action.id,
                                      'IN_PROGRESS',
                                    );
                                  }}
                                  disabled={
                                    actionLoading ===
                                    action.id
                                  }
                                  className="flex items-center gap-1.5 rounded-none bg-[#f3f4f6]0 px-3 py-2 text-xs font-bold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {actionLoading ===
                                  action.id ? (
                                    <RefreshCw
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Play
                                      size={13}
                                    />
                                  )}

                                  Start
                                </button>
                              )}

                              {action.status ===
                                'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleActionStatus(
                                      action.id,
                                      'DONE',
                                    );
                                  }}
                                  disabled={
                                    actionLoading ===
                                    action.id
                                  }
                                  className="flex items-center gap-1.5 rounded-none bg-[#111827] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {actionLoading ===
                                  action.id ? (
                                    <RefreshCw
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <CheckCircle2
                                      size={13}
                                    />
                                  )}

                                  Complete
                                </button>
                              )}

                              {action.status ===
                                'DONE' && (
                                <span className="flex items-center gap-1.5 rounded-none bg-[#f3f4f6] px-3 py-2 text-xs font-bold text-[#374151]">
                                  <CheckCircle2
                                    size={14}
                                  />
                                  Done
                                </span>
                              )}

                              {action.status ===
                                'DISMISSED' && (
                                <span className="rounded-none bg-[#fafafa] px-3 py-2 text-xs font-bold text-[#4b5563]">
                                  Dismissed
                                </span>
                              )}
                            </div>

                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>

              {/* AI CONTEXT */}
              <section className="rounded-none border border-[#e5e7eb] bg-[#fafafa] p-6">
                <div className="flex items-start gap-3">
                  <Sparkles
                    size={20}
                    className="mt-0.5 shrink-0 text-[#111827]"
                  />

                  <div>
                    <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
                      AI Context
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#374151]">
                      This Business Brain becomes
                      the context used by RENKOO's
                      AI-powered SEO, content,
                      visibility and growth workflows.
                    </p>

                    {brain?.aiSummary && (
                      <div className="mt-4 rounded-none border border-[#d1d5db] bg-white/70 p-4 text-sm leading-6 text-[#111827]">
                        {brain.aiSummary}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* WEBSITE INFO */}
              {selectedWebsite && (
                <section className="rounded-none border border-[#e5e7eb] bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
                    Connected Website
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#111827]">
                    {selectedWebsite.name}
                  </p>

                  <p className="mt-1 text-xs text-[#6b7280]">
                    {selectedWebsite.url}
                  </p>
                </section>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
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
      <label className="text-xs font-semibold text-[#4b5563]">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-2 w-full rounded-none border border-[#e5e7eb] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f3f4f6]"
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
    <section className="rounded-none border border-[#e5e7eb] bg-white p-5 ">
      <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
        {title}
      </h2>

      <p className="mt-1 text-xs text-[#6b7280]">
        Separate multiple items with commas.
      </p>

      <input
        value={inputValue}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-4 w-full rounded-none border border-[#e5e7eb] px-4 py-3 text-sm outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f3f4f6]"
        placeholder={`Add ${title.toLowerCase()}...`}
      />

      {safeValue.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {safeValue.map(
            (item, index) => (
              <span
                key={`${item}-${index}`}
                className="rounded-none bg-slate-100 px-3 py-1.5 text-xs font-medium text-[#374151]"
              >
                {item}
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#9ca3af]">
          No data available yet.
        </p>
      )}
    </section>
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
      <section className="rounded-none border border-[#e5e7eb] bg-white p-6">
        <p className="text-sm text-[#6b7280]">
          Loading business understanding...
        </p>
      </section>
    );
  }

  if (!context) {
    return (
      <section className="rounded-none border border-[#e5e7eb] bg-white p-6">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
          RENKOO Understanding
        </h2>
        <p className="mt-2 text-sm text-[#6b7280]">
          Business context is unavailable right now. Configure
          the profile below and run an analysis.
        </p>
      </section>
    );
  }

  const connected = DATA_SOURCE_LABELS.filter(
    (source) => context.dataAvailability[source.key],
  );
  const unavailable = DATA_SOURCE_LABELS.filter(
    (source) => !context.dataAvailability[source.key],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-none border border-[#111827] bg-[#111827] p-6 text-white">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
          RENKOO Understanding · deterministic, no AI judgment
        </div>
        <ul className="mt-3 space-y-2">
          {buildUnderstanding(context).map((line, index) => (
            <li
              key={index}
              className="text-sm leading-6 text-[#e5e7eb]"
            >
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#374151] pt-4 text-xs text-[#9ca3af]">
          <span>
            Context confidence{' '}
            <span className="font-bold text-white">
              {context.contextConfidence}%
            </span>
          </span>
          <span className="hidden sm:inline">·</span>
          <span>{context.confidenceFormula}</span>
        </div>
      </section>

      <section className="rounded-none border border-[#e5e7eb] bg-white p-6">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
          Data Coverage
        </h2>
        <p className="mt-1 text-xs text-[#6b7280]">
          Only sources with real data are listed as connected.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Connected ({connected.length})
            </div>
            {connected.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {connected.map((source) => (
                  <li
                    key={source.key}
                    className="text-sm text-[#374151]"
                  >
                    ✓ {source.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#6b7280]">
                No data sources connected yet.
              </p>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
              Not connected ({unavailable.length})
            </div>
            {unavailable.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {unavailable.map((source) => (
                  <li
                    key={source.key}
                    className="text-sm text-[#9ca3af]"
                  >
                    — {source.label}: no data available
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#6b7280]">
                Every tracked source is connected.
              </p>
            )}
          </div>
        </div>
        {context.competitors.length > 0 && (
          <div className="mt-4 border-t border-[#f0f1f3] pt-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
              Competitive context ({context.competitors.length})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {context.competitors.map((competitor) => (
                <span
                  key={competitor.id}
                  className="border border-[#e5e7eb] bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-[#374151]"
                >
                  {competitor.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-none border border-[#e5e7eb] bg-white p-6">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#111827]">
          Priority Impact
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#6b7280]">
          {goalHint(context.priorities.primaryGoal)}
        </p>
        <p className="mt-2 text-xs leading-5 text-[#9ca3af]">
          Business relevance adds at most +5 to an opportunity
          score and is always recorded transparently. Evidence
          scoring decides everything else.
        </p>
      </section>

      {context.missing.length > 0 && (
        <section className="rounded-none border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#92400e]">
            Missing Context ({context.missing.length})
          </h2>
          <ul className="mt-2 space-y-1.5">
            {context.missing.map((item, index) => (
              <li
                key={index}
                className="text-sm leading-6 text-[#92400e]"
              >
                · {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}




