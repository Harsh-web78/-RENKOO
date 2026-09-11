'use client';

/*
 * RENKOO — Leads & Revenue (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / Metric / FilterBar /
 * DataTable / badges / buttons / states. All API calls, lead
 * + revenue data handling, attribution logic, forms, validation,
 * dialogs, filters and business logic are unchanged.
 */

import {
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from 'react';

import {
  RefreshCw,
  Plus,
  AlertTriangle,
  X,
  CheckCircle2,
  IndianRupee,
  ArrowUpRight,
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
} from '../../components/ui/badge';
import {
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/buttons';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from '../../components/ui/states';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Link from 'next/link';

import {
  getWebsites,
  getLeads,
  getLeadsSummary,
  createLead,
  updateLead,
  deleteLead,
  getRevenue,
  getRevenueSummary,
  createRevenue,
  getRoiOutcome,
  createActionFromRecommendation,
  Website,
  Lead,
  LeadsSummary,
  Revenue,
  RevenueSummary,
  OutcomeResponse,
} from '../../lib/api';

const STORAGE_KEY = 'renkoo_website_id';

type DateRangeKey =
  | 'LAST_7'
  | 'LAST_30'
  | 'LAST_90'
  | 'ALL_TIME';

const DATE_RANGES: Array<{
  key: DateRangeKey;
  label: string;
}> = [
  { key: 'LAST_7', label: 'Last 7 days' },
  { key: 'LAST_30', label: 'Last 30 days' },
  { key: 'LAST_90', label: 'Last 90 days' },
  { key: 'ALL_TIME', label: 'All time' },
];

function rangeToDates(
  range: DateRangeKey,
): {
  from?: string;
  to?: string;
} {
  if (range === 'ALL_TIME') {
    return {};
  }

  const days =
    range === 'LAST_7'
      ? 7
      : range === 'LAST_90'
        ? 90
        : 30;
  const to = new Date();
  const from = new Date();

  from.setDate(from.getDate() - days);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/*
 * =========================================================
 * LEAD FORM
 * =========================================================
 */

type LeadForm = {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  sourceDetail: string;
  status: string;
  score: string;
  estimatedValue: string;
  notes: string;
  landingPage: string;
  keyword: string;
};

const emptyLeadForm: LeadForm = {
  name: '',
  email: '',
  phone: '',
  company: '',
  source: 'WEBSITE',
  sourceDetail: '',
  status: 'NEW',
  score: '0',
  estimatedValue: '0',
  notes: '',
  landingPage: '',
  keyword: '',
};

/*
 * =========================================================
 * REVENUE FORM
 * =========================================================
 */

type RevenueForm = {
  leadId: string;
  amount: string;
  currency: string;
  source: string;
  sourceDetail: string;
  status: string;
  description: string;
};

const emptyRevenueForm: RevenueForm = {
  leadId: '',
  amount: '',
  currency: 'INR',
  source: '',
  sourceDetail: '',
  status: 'RECOGNIZED',
  description: '',
};

/*
 * Lead status → shared badge tone. Meaning stays in text;
 * tone only reinforces it.
 */
function leadStatusTone(
  status: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  const normalized = status.toUpperCase();

  if (normalized === 'CONVERTED') return 'positive';
  if (normalized === 'QUALIFIED') return 'info';
  if (normalized === 'CONTACTED') return 'warning';
  if (normalized === 'LOST') return 'danger';

  return 'neutral';
}

function revenueStatusTone(
  status: string,
): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  return status.toUpperCase() === 'RECOGNIZED'
    ? 'positive'
    : 'neutral';
}

/*
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function LeadsPage() {
  /*
   * =========================================================
   * WEBSITE STATE
   * =========================================================
   */

  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [mobileOpen, setMobileOpen] =
    useState(false);

  /*
   * =========================================================
   * LEADS STATE
   * =========================================================
   */

  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] =
    useState<LeadsSummary | null>(null);

  /*
   * =========================================================
   * REVENUE STATE
   * =========================================================
   */

  const [revenues, setRevenues] =
    useState<Revenue[]>([]);

  const [revenueSummary, setRevenueSummary] =
    useState<RevenueSummary | null>(null);

  const [dateRange, setDateRange] =
    useState<DateRangeKey>('LAST_30');

  const [outcome, setOutcome] =
    useState<OutcomeResponse | null>(
      null,
    );

  const [outcomeError, setOutcomeError] =
    useState('');

  const [gapActionMap, setGapActionMap] =
    useState<Record<string, boolean>>(
      {},
    );

  /*
   * =========================================================
   * LOADING STATE
   * =========================================================
   */

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [savingRevenue, setSavingRevenue] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [pendingDeleteLead, setPendingDeleteLead] =
    useState<Lead | null>(null);

  const [error, setError] =
    useState('');

  /*
   * =========================================================
   * LEAD MODAL
   * =========================================================
   */

  const [showLeadModal, setShowLeadModal] =
    useState(false);

  const [editingLead, setEditingLead] =
    useState<Lead | null>(null);

  const [leadForm, setLeadForm] =
    useState<LeadForm>(emptyLeadForm);

  /*
   * =========================================================
   * REVENUE MODAL
   * =========================================================
   */

  const [showRevenueModal, setShowRevenueModal] =
    useState(false);

  const [revenueForm, setRevenueForm] =
    useState<RevenueForm>(emptyRevenueForm);

  /*
   * =========================================================
   * INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {
    loadWebsites();
  }, []);

  useEffect(() => {
    if (websiteId) {
      loadData();
    }
  }, [websiteId, dateRange]);

  /*
   * =========================================================
   * LOAD WEBSITES
   * =========================================================
   */

  async function loadWebsites() {
    try {
      setError('');
      setLoading(true);

      const data = await getWebsites();

      const safeWebsites = Array.isArray(data)
        ? data
        : [];

      setWebsites(safeWebsites);

      if (safeWebsites.length > 0) {
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const valid =
          stored &&
          safeWebsites.some((site) => site.id === stored)
            ? stored
            : safeWebsites[0].id;
        setWebsiteId(valid);
      } else {
        setWebsiteId('');
        setLeads([]);
        setSummary(null);
        setRevenues([]);
        setRevenueSummary(null);
        setOutcome(null);
        setLoading(false);
      }
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to load websites',
      );

      setLoading(false);
    }
  }

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }

  /*
   * =========================================================
   * LOAD ALL DATA
   * =========================================================
   */

  async function loadData() {
    if (!websiteId) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { from, to } =
        rangeToDates(dateRange);

      setOutcomeError('');

      const [
        leadData,
        summaryData,
        revenueData,
        revenueSummaryData,
        outcomeData,
      ] = await Promise.all([
        getLeads(websiteId),
        getLeadsSummary(websiteId),
        getRevenue(websiteId),
        getRevenueSummary(websiteId),
        getRoiOutcome(
          websiteId,
          from,
          to,
        ).catch((outcomeErr: any) => {
          setOutcomeError(
            outcomeErr?.message ||
              'Outcome engine unavailable',
          );

          return null;
        }),
      ]);

      setOutcome(outcomeData);

      /*
       * -------------------------------------------------------
       * NORMALIZE LEADS
       * -------------------------------------------------------
       */

      let safeLeads: Lead[] = [];

      if (Array.isArray(leadData)) {
        safeLeads = leadData;
      } else if (
        leadData &&
        typeof leadData === 'object' &&
        'leads' in leadData &&
        Array.isArray(
          (leadData as any).leads,
        )
      ) {
        safeLeads =
          (leadData as any).leads;
      }

      /*
       * -------------------------------------------------------
       * NORMALIZE REVENUE
       * -------------------------------------------------------
       */

      let safeRevenues: Revenue[] = [];

      if (Array.isArray(revenueData)) {
        safeRevenues = revenueData;
      } else if (
        revenueData &&
        typeof revenueData === 'object' &&
        'revenues' in revenueData &&
        Array.isArray(
          (revenueData as any).revenues,
        )
      ) {
        safeRevenues =
          (revenueData as any).revenues;
      }

      setLeads(safeLeads);
      setSummary(summaryData || null);

      setRevenues(safeRevenues);
      setRevenueSummary(
        revenueSummaryData || null,
      );
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to load leads and revenue',
      );

      setLeads([]);
      setSummary(null);
      setRevenues([]);
      setRevenueSummary(null);
      setOutcome(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleGapAction(
    gapId: string,
  ) {
    if (
      gapActionMap[gapId] ||
      !outcome
    ) {
      return;
    }

    try {
      setGapActionMap((prev) => ({
        ...prev,
        [gapId]: true,
      }));

      await createActionFromRecommendation(
        gapId,
      );
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to create action',
      );

      setGapActionMap((prev) => {
        const next = { ...prev };

        delete next[gapId];

        return next;
      });
    }
  }

  /*
   * =========================================================
   * LEAD MODAL
   * =========================================================
   */

  function openAddLead() {
    if (!websiteId) {
      setError(
        'Please select a website first.',
      );
      return;
    }

    setError('');
    setEditingLead(null);
    setLeadForm({
      ...emptyLeadForm,
    });

    setShowLeadModal(true);
  }

  function openEditLead(lead: Lead) {
    setError('');
    setEditingLead(lead);

    setLeadForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      source:
        lead.source || 'WEBSITE',
      sourceDetail:
        lead.sourceDetail || '',
      status:
        lead.status || 'NEW',
      score: String(
        lead.score ?? 0,
      ),
      estimatedValue: String(
        lead.estimatedValue ?? 0,
      ),
      notes: lead.notes || '',
      landingPage:
        lead.landingPage || '',
      keyword: lead.keyword || '',
    });

    setShowLeadModal(true);
  }

  function closeLeadModal() {
    if (saving) {
      return;
    }

    setShowLeadModal(false);
    setEditingLead(null);
    setLeadForm({
      ...emptyLeadForm,
    });
  }

  /*
   * =========================================================
   * REVENUE MODAL
   * =========================================================
   */

  function openAddRevenue(
    lead?: Lead,
  ) {
    if (!websiteId) {
      setError(
        'Please select a website first.',
      );
      return;
    }

    setError('');

    setRevenueForm({
      ...emptyRevenueForm,
      leadId: lead?.id || '',
      amount:
        lead &&
        Number(lead.estimatedValue) > 0
          ? String(
              lead.estimatedValue,
            )
          : '',
      source:
        lead?.source || '',
    });

    setShowRevenueModal(true);
  }

  function closeRevenueModal() {
    if (savingRevenue) {
      return;
    }

    setShowRevenueModal(false);

    setRevenueForm({
      ...emptyRevenueForm,
    });
  }

  /*
   * =========================================================
   * FORM UPDATE
   * =========================================================
   */

  function updateLeadForm(
    field: keyof LeadForm,
    value: string,
  ) {
    setLeadForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  function updateRevenueForm(
    field: keyof RevenueForm,
    value: string,
  ) {
    setRevenueForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  /*
   * =========================================================
   * CREATE / UPDATE LEAD
   * =========================================================
   */

  async function handleLeadSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) return;

    if (!websiteId) {
      setError(
        'Please select a website first.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const score =
        Number(leadForm.score) || 0;

      const estimatedValue =
        Number(
          leadForm.estimatedValue,
        ) || 0;

      if (
        score < 0 ||
        score > 100
      ) {
        throw new Error(
          'Lead score must be between 0 and 100.',
        );
      }

      if (
        estimatedValue < 0
      ) {
        throw new Error(
          'Estimated value cannot be negative.',
        );
      }

      const data = {
        name:
          leadForm.name.trim() ||
          undefined,

        email:
          leadForm.email.trim() ||
          undefined,

        phone:
          leadForm.phone.trim() ||
          undefined,

        company:
          leadForm.company.trim() ||
          undefined,

        source:
          leadForm.source.trim() ||
          'WEBSITE',

        sourceDetail:
          leadForm.sourceDetail.trim() ||
          undefined,

        status:
          leadForm.status.trim() ||
          'NEW',

        score,

        estimatedValue,

        notes:
          leadForm.notes.trim() ||
          undefined,

        landingPage:
          leadForm.landingPage.trim() ||
          undefined,

        keyword:
          leadForm.keyword.trim() ||
          undefined,
      };

      if (editingLead) {
        await updateLead(
          websiteId,
          editingLead.id,
          data,
        );
      } else {
        await createLead(
          websiteId,
          data,
        );
      }

      closeLeadModal();

      await loadData();
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to save lead',
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * =========================================================
   * CREATE REVENUE
   * =========================================================
   */

  async function handleRevenueSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (savingRevenue) return;

    if (!websiteId) {
      setError(
        'Please select a website first.',
      );
      return;
    }

    const amount =
      Number(revenueForm.amount) || 0;

    if (amount <= 0) {
      setError(
        'Revenue amount must be greater than 0.',
      );
      return;
    }

    setSavingRevenue(true);
    setError('');

    try {
      await createRevenue(
        websiteId,
        {
          leadId:
            revenueForm.leadId ||
            undefined,

          amount,

          currency:
            revenueForm.currency ||
            'INR',

          source:
            revenueForm.source.trim() ||
            undefined,

          sourceDetail:
            revenueForm.sourceDetail.trim() ||
            undefined,

          status:
            revenueForm.status ||
            'RECOGNIZED',

          description:
            revenueForm.description.trim() ||
            undefined,
        },
      );

      closeRevenueModal();

      await loadData();
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to create revenue',
      );
    } finally {
      setSavingRevenue(false);
    }
  }

  /*
   * =========================================================
   * DELETE LEAD
   * =========================================================
   */

  async function handleDeleteLead(
    lead: Lead,
  ) {
    setPendingDeleteLead(lead);
  }

  async function confirmDeleteLead() {
    const lead = pendingDeleteLead;

    if (!lead) {
      return;
    }

    try {
      setDeletingId(lead.id);
      setError('');

      await deleteLead(
        websiteId,
        lead.id,
      );

      setPendingDeleteLead(null);
      await loadData();
    } catch (e: any) {
      setError(
        e?.message ||
          'Failed to delete lead',
      );
    } finally {
      setDeletingId(null);
    }
  }

  /*
   * =========================================================
   * HELPERS
   * =========================================================
   */

  function formatMoney(
    amount: number,
    currency = 'INR',
  ) {
    const symbol =
      currency === 'INR'
        ? '₹'
        : currency;

    return `${symbol}${Number(
      amount || 0,
    ).toLocaleString('en-IN')}`;
  }

  const activeWebsite =
    websites.find((site) => site.id === websiteId) || null;

  const dateLabel =
    DATE_RANGES.find((range) => range.key === dateRange)?.label ?? '';

  const revenueValue = (() => {
    if (
      revenueSummary == null &&
      summary == null
    ) {
      return '—';
    }

    const revenueRaw =
      revenueSummary != null &&
      (revenueSummary as any)
        .totalRevenue !==
        undefined
        ? (revenueSummary as any)
            .totalRevenue
        : summary != null &&
            (summary as any)
              .revenue !==
              undefined
          ? (summary as any)
              .revenue
          : undefined;

    if (
      revenueRaw == null &&
      (revenueSummary != null ||
        summary != null)
    ) {
      return 'Not measurable — no leads recorded';
    }

    return formatMoney(
      revenueRaw ?? 0,
    );
  })();

  const leadColumns: DataTableColumn<Lead>[] = [
    {
      key: 'lead',
      label: 'Lead',
      priority: 'high',
      render: (lead) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold text-rk-ink">
            {lead.name || 'Unnamed lead'}
          </span>
          <span className="rk-metadata mt-0.5 block truncate">
            {lead.email || lead.phone || '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'high',
      render: (lead) => (
        <Badge
          label={lead.status || 'NEW'}
          tone={leadStatusTone(lead.status || 'NEW')}
        />
      ),
    },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      priority: 'high',
      render: (lead) => (
        <span className="font-bold">
          {formatMoney(lead.estimatedValue ?? 0)}
        </span>
      ),
    },
    {
      key: 'source',
      label: 'Source',
      priority: 'medium',
      render: (lead) => (
        <Badge label={lead.source || 'Unknown'} tone="info" />
      ),
    },
    {
      key: 'company',
      label: 'Company',
      priority: 'low',
      render: (lead) => lead.company || '—',
    },
    {
      key: 'score',
      label: 'Score',
      align: 'right',
      priority: 'low',
      render: (lead) => (
        <span className="font-bold">{lead.score ?? 0}</span>
      ),
    },
  ];

  const revenueColumns: DataTableColumn<Revenue>[] = [
    {
      key: 'lead',
      label: 'Lead',
      priority: 'high',
      render: (revenue) => {
        const linkedLead = leads.find(
          (lead) => lead.id === revenue.leadId,
        );
        return (
          <span className="block min-w-0">
            <span className="block truncate font-bold text-rk-ink">
              {linkedLead?.name ||
                linkedLead?.email ||
                'Direct Revenue'}
            </span>
            {linkedLead?.company ? (
              <span className="rk-metadata mt-0.5 block truncate">
                {linkedLead.company}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      priority: 'high',
      render: (revenue) => (
        <span className="font-bold text-rk-success">
          {formatMoney(
            revenue.amount ?? 0,
            revenue.currency || 'INR',
          )}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      priority: 'medium',
      render: (revenue) =>
        revenue.recognizedAt
          ? new Date(
              revenue.recognizedAt,
            ).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '—',
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (revenue) => (
        <Badge
          label={revenue.status || 'RECOGNIZED'}
          tone={revenueStatusTone(revenue.status || 'RECOGNIZED')}
        />
      ),
    },
    {
      key: 'source',
      label: 'Source',
      priority: 'low',
      render: (revenue) => revenue.source || '—',
    },
    {
      key: 'description',
      label: 'Description',
      priority: 'low',
      render: (revenue) =>
        revenue.description || revenue.sourceDetail || '—',
    },
  ];

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <AppShell
      mobileOpen={mobileOpen}
      onClose={() => setMobileOpen(false)}
      onMenu={() => setMobileOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          tourAnchor="discover-leads"
          eyebrow="Business impact"
          title="Leads & Revenue"
          description="Track leads, pipeline value, conversions, revenue and acquisition sources."
          meta={
            <>
              {activeWebsite ? (
                <span className="truncate">{activeWebsite.name}</span>
              ) : (
                <span>No website selected</span>
              )}
              <span aria-hidden>·</span>
              <span>{dateLabel}</span>
              <span aria-hidden>·</span>
              <span>
                {leads.length} leads · {revenues.length} transactions
              </span>
            </>
          }
          actions={
            <>
              <SecondaryButton
                onClick={loadData}
                disabled={loading || !websiteId}
              >
                <RefreshCw
                  size={14}
                  aria-hidden
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </SecondaryButton>

              <SecondaryButton
                onClick={() => openAddRevenue()}
                disabled={!websiteId || loading}
              >
                <IndianRupee size={14} aria-hidden />
                Add Revenue
              </SecondaryButton>

              <PrimaryButton onClick={openAddLead}>
                <Plus size={14} aria-hidden />
                Add Lead
              </PrimaryButton>
            </>
          }
        />

        {/* Website + period — shared FilterBar */}
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
              {
                key: 'period',
                label: 'Period',
                value: dateRange,
                options: DATE_RANGES.map((range) => ({
                  value: range.key,
                  label: range.label,
                })),
                onChange: (value) =>
                  setDateRange(value as DateRangeKey),
              },
            ]}
            meta={
              activeWebsite
                ? `Showing pipeline for ${activeWebsite.name}`
                : 'Select a website to load its pipeline'
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

        {loading ? (
          <div className="mt-4">
            <LoadingBlock title="Loading leads and revenue…" lines={5} />
          </div>
        ) : (
          <>
            {/* What happened — pipeline metrics */}
            <section aria-label="Lead metrics" className="mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  What happened?
                </h2>
                <p className="rk-metadata hidden sm:block">
                  Leads captured in range
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm">
                  <SharedMetric
                    label="Total Leads"
                    value={String(summary?.total ?? leads.length)}
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm">
                  <SharedMetric
                    label="New"
                    value={
                      summary == null
                        ? '—'
                        : String(summary.new ?? 0)
                    }
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm">
                  <SharedMetric
                    label="Qualified"
                    value={
                      summary == null
                        ? '—'
                        : String(summary.qualified ?? 0)
                    }
                    tone="neutral"
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm">
                  <SharedMetric
                    label="Converted"
                    value={
                      summary == null
                        ? '—'
                        : String(summary.converted ?? 0)
                    }
                    tone="positive"
                  />
                </div>

                <div className="col-span-2 rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:col-span-1">
                  <SharedMetric
                    label="Conversion Rate"
                    value={
                      summary == null
                        ? '—'
                        : summary.conversionRate == null
                          ? '—'
                          : `${summary.conversionRate}%`
                    }
                    detail={
                      summary != null &&
                      summary.conversionRate == null
                        ? 'Not measurable — no leads recorded'
                        : undefined
                    }
                  />
                </div>
              </div>
            </section>

            {/* How much — value metrics */}
            <section aria-label="Value metrics" className="mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  How much revenue did it generate?
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <SharedMetric
                    label="Pipeline Value"
                    value={
                      summary == null
                        ? '—'
                        : formatMoney(summary.pipelineValue ?? 0)
                    }
                    detail="Estimated value of open pipeline"
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <SharedMetric
                    label="Revenue"
                    value={revenueValue}
                    detail="Recognized transactions in range"
                    tone="positive"
                  />
                </div>
              </div>
            </section>

            <OutcomeSection
              outcome={outcome}
              outcomeError={outcomeError}
              dateLabel={dateLabel}
              onGapAction={handleGapAction}
              gapActionMap={gapActionMap}
            />

            <p className="mt-3">
              <Link
                href="/roi"
                className="rk-focusable inline-flex items-center gap-1 text-[13px] font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
              >
                Open Revenue Intelligence
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            </p>

            {/* Lead pipeline — shared DataTable */}
            <div id="leads-pipeline" className="mt-6 scroll-mt-24">
              <Panel
                eyebrow="Pipeline"
                title="Lead Pipeline"
                description="Latest captured leads."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={openAddLead}
                    disabled={!websiteId || loading}
                  >
                    <Plus size={14} aria-hidden />
                    Add Lead
                  </SecondaryButton>
                }
                padded={false}
              >
                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Lead pipeline"
                    columns={leadColumns}
                    rows={leads}
                    keyOf={(lead) => lead.id}
                    loading={false}
                    emptyTitle="No leads captured yet"
                    emptyDescription="Add your first lead to start tracking your pipeline."
                    rowActions={(lead) => [
                      ...(lead.status?.toUpperCase() !== 'CONVERTED'
                        ? [
                            {
                              label: 'Revenue',
                              onSelect: () =>
                                openAddRevenue(lead),
                            },
                          ]
                        : []),
                      {
                        label: 'Edit',
                        onSelect: () => openEditLead(lead),
                      },
                      {
                        label:
                          deletingId === lead.id
                            ? 'Deleting…'
                            : 'Delete',
                        onSelect: () =>
                          handleDeleteLead(lead),
                      },
                    ]}
                    renderExpanded={(lead) => (
                      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                        <div>
                          <dt className="rk-field-label">Company</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {lead.company || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Contact</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {[lead.email, lead.phone]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Source detail</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {lead.sourceDetail || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Landing page</dt>
                          <dd className="rk-technical-value mt-0.5 !text-rk-ink">
                            {lead.landingPage || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Keyword</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {lead.keyword || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rk-field-label">Notes</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {lead.notes || '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  />
                </div>
              </Panel>
            </div>

            {/* Revenue — shared DataTable */}
            <div className="mt-6">
              <Panel
                eyebrow="Revenue"
                title="Revenue"
                description="Revenue generated from converted leads."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={() => openAddRevenue()}
                    disabled={!websiteId || loading}
                  >
                    <Plus size={14} aria-hidden />
                    Add Revenue
                  </SecondaryButton>
                }
                padded={false}
              >
                <div className="grid gap-px border-b border-rk-border bg-rk-border sm:grid-cols-3">
                  <div className="bg-rk-surface px-4 py-3.5 sm:px-5">
                    <SharedMetric
                      label="Total Revenue"
                      value={
                        revenueSummary == null
                          ? '—'
                          : formatMoney(
                              revenueSummary.totalRevenue ?? 0,
                            )
                      }
                      tone="positive"
                    />
                  </div>

                  <div className="bg-rk-surface px-4 py-3.5 sm:px-5">
                    <SharedMetric
                      label="Transactions"
                      value={
                        revenueSummary == null
                          ? '—'
                          : String(revenueSummary.transactions ?? 0)
                      }
                    />
                  </div>

                  <div className="bg-rk-surface px-4 py-3.5 sm:px-5">
                    <SharedMetric
                      label="Average Revenue"
                      value={
                        revenueSummary == null
                          ? '—'
                          : formatMoney(
                              revenueSummary.averageRevenue ?? 0,
                            )
                      }
                    />
                  </div>
                </div>

                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Revenue transactions"
                    columns={revenueColumns}
                    rows={revenues}
                    keyOf={(revenue) => revenue.id}
                    loading={false}
                    emptyTitle="No revenue recorded yet"
                    emptyDescription="Add revenue when a lead converts."
                    renderExpanded={(revenue) => (
                      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                        <div>
                          <dt className="rk-field-label">Source detail</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {revenue.sourceDetail || '—'}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="rk-field-label">Description</dt>
                          <dd className="mt-0.5 font-medium text-rk-ink">
                            {revenue.description || '—'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  />
                </div>
              </Panel>
            </div>

            {/* Lead sources */}
            <div className="mt-6">
              <Panel
                eyebrow="Acquisition"
                title="Lead Sources"
                description="Where pipeline originates."
              >
                {summary &&
                Object.keys(summary.bySource || {}).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(summary.bySource || {}).map(
                      ([source, count]) => (
                        <div
                          key={source}
                          className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5"
                        >
                          <p className="rk-field-label truncate">
                            {source}
                          </p>
                          <p className="rk-number mt-1.5 text-xl font-extrabold">
                            {String(count)}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="rk-metadata">No source data yet.</p>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>

      {/* =========================================================
          ADD / EDIT LEAD MODAL
      ========================================================= */}

      {showLeadModal && (
        <div
          className="rk-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLeadModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingLead ? 'Edit lead' : 'Add lead'}
            className="rk-dialog max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-rk-lg border border-rk-border bg-rk-surface"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rk-border bg-rk-surface p-5">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-rk-ink">
                  {editingLead
                    ? 'Edit Lead'
                    : 'Add Lead'}
                </h2>

                <p className="rk-metadata mt-1">
                  {editingLead
                    ? 'Update lead information.'
                    : 'Capture a new lead in your pipeline.'}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeLeadModal
                }
                disabled={saving}
                aria-label="Close"
                className="rk-focusable grid h-9 w-9 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink disabled:opacity-50"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <form
              onSubmit={
                handleLeadSubmit
              }
              className="p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">

                <Field label="Name">
                  <input
                    type="text"
                    value={
                      leadForm.name
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'name',
                        e.target.value,
                      )
                    }
                    placeholder="Rahul Patil"
                    className="input"
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={
                      leadForm.email
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'email',
                        e.target.value,
                      )
                    }
                    placeholder="rahul@example.com"
                    className="input"
                  />
                </Field>

                <Field label="Phone">
                  <input
                    type="tel"
                    value={
                      leadForm.phone
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'phone',
                        e.target.value,
                      )
                    }
                    placeholder="9876543210"
                    className="input"
                  />
                </Field>

                <Field label="Company">
                  <input
                    type="text"
                    value={
                      leadForm.company
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'company',
                        e.target.value,
                      )
                    }
                    placeholder="Company name"
                    className="input"
                  />
                </Field>

                <Field
                  label="Source"
                  required
                >
                  <select
                    value={
                      leadForm.source
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'source',
                        e.target.value,
                      )
                    }
                    className="input"
                  >
                    <option value="WEBSITE">
                      Website
                    </option>

                    <option value="GOOGLE">
                      Google
                    </option>

                    <option value="GOOGLE_ADS">
                      Google Ads
                    </option>

                    <option value="SEO">
                      SEO
                    </option>

                    <option value="SOCIAL">
                      Social Media
                    </option>

                    <option value="FACEBOOK">
                      Facebook
                    </option>

                    <option value="INSTAGRAM">
                      Instagram
                    </option>

                    <option value="REFERRAL">
                      Referral
                    </option>

                    <option value="DIRECT">
                      Direct
                    </option>

                    <option value="OTHER">
                      Other
                    </option>
                  </select>
                </Field>

                <Field label="Source Detail">
                  <input
                    type="text"
                    value={
                      leadForm.sourceDetail
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'sourceDetail',
                        e.target.value,
                      )
                    }
                    placeholder="Campaign / referral details"
                    className="input"
                  />
                </Field>

                <Field
                  label="Status"
                  required
                >
                  <select
                    value={
                      leadForm.status
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'status',
                        e.target.value,
                      )
                    }
                    className="input"
                  >
                    <option value="NEW">
                      New
                    </option>

                    <option value="CONTACTED">
                      Contacted
                    </option>

                    <option value="QUALIFIED">
                      Qualified
                    </option>

                    <option value="CONVERTED">
                      Converted
                    </option>

                    <option value="LOST">
                      Lost
                    </option>
                  </select>
                </Field>

                <Field
                  label="Lead Score"
                  required
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={
                      leadForm.score
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'score',
                        e.target.value,
                      )
                    }
                    className="input"
                  />
                </Field>

                <Field
                  label="Estimated Value (₹)"
                  required
                >
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      leadForm.estimatedValue
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'estimatedValue',
                        e.target.value,
                      )
                    }
                    className="input"
                  />
                </Field>

                <Field label="Landing Page">
                  <input
                    type="text"
                    value={
                      leadForm.landingPage
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'landingPage',
                        e.target.value,
                      )
                    }
                    placeholder="/contact"
                    className="input"
                  />
                </Field>

                <Field label="Keyword">
                  <input
                    type="text"
                    value={
                      leadForm.keyword
                    }
                    onChange={(e) =>
                      updateLeadForm(
                        'keyword',
                        e.target.value,
                      )
                    }
                    placeholder="best dental clinic pune"
                    className="input"
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Notes">
                    <textarea
                      rows={4}
                      value={
                        leadForm.notes
                      }
                      onChange={(e) =>
                        updateLeadForm(
                          'notes',
                          e.target.value,
                        )
                      }
                      placeholder="Lead notes..."
                      className="input resize-none"
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <SecondaryButton
                  onClick={
                    closeLeadModal
                  }
                  disabled={saving}
                >
                  Cancel
                </SecondaryButton>

                <PrimaryButton
                  type="submit"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw
                      size={15}
                      aria-hidden
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2
                      size={15}
                      aria-hidden
                    />
                  )}

                  {saving
                    ? 'Saving…'
                    : editingLead
                    ? 'Update Lead'
                    : 'Create Lead'}
                </PrimaryButton>
              </div>
            </form>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/opportunities"
              className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
            >
              Review in Opportunities
            </Link>
            <Link
              href="/actions"
              className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
            >
              Open Actions
            </Link>
          </div>
        </div>
      )}

      {/* =========================================================
          ADD REVENUE MODAL
      ========================================================= */}

      {showRevenueModal && (
        <div
          className="rk-dialog-backdrop fixed inset-0 z-[110] flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeRevenueModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add revenue"
            className="rk-dialog max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-rk-lg border border-rk-border bg-rk-surface"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rk-border bg-rk-surface p-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 place-items-center rounded-rk-md bg-rk-successSoft text-rk-success"
                  >
                    <IndianRupee
                      size={18}
                    />
                  </span>

                  <div>
                    <h2 className="text-lg font-extrabold tracking-tight text-rk-ink">
                      Add Revenue
                    </h2>

                    <p className="rk-metadata mt-1">
                      Record revenue generated
                      from your pipeline.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  closeRevenueModal
                }
                disabled={
                  savingRevenue
                }
                aria-label="Close"
                className="rk-focusable grid h-9 w-9 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink disabled:opacity-50"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <form
              onSubmit={
                handleRevenueSubmit
              }
              className="p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">

                {/* LEAD */}

                <div className="sm:col-span-2">
                  <Field label="Link to Lead">
                    <select
                      value={
                        revenueForm.leadId
                      }
                      onChange={(e) =>
                        updateRevenueForm(
                          'leadId',
                          e.target.value,
                        )
                      }
                      className="input"
                    >
                      <option value="">
                        Direct / No linked lead
                      </option>

                      {leads.map(
                        (lead) => (
                          <option
                            key={
                              lead.id
                            }
                            value={
                              lead.id
                            }
                          >
                            {lead.name ||
                              lead.email ||
                              'Unnamed lead'}
                            {lead.company
                              ? ` — ${lead.company}`
                              : ''}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                </div>

                {/* AMOUNT */}

                <Field
                  label="Revenue Amount (₹)"
                  required
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={
                      revenueForm.amount
                    }
                    onChange={(e) =>
                      updateRevenueForm(
                        'amount',
                        e.target.value,
                      )
                    }
                    placeholder="50000"
                    className="input"
                  />
                </Field>

                {/* CURRENCY */}

                <Field
                  label="Currency"
                  required
                >
                  <select
                    value={
                      revenueForm.currency
                    }
                    onChange={(e) =>
                      updateRevenueForm(
                        'currency',
                        e.target.value,
                      )
                    }
                    className="input"
                  >
                    <option value="INR">
                      INR — Indian Rupee
                    </option>

                    <option value="USD">
                      USD — US Dollar
                    </option>

                    <option value="EUR">
                      EUR — Euro
                    </option>

                    <option value="GBP">
                      GBP — British Pound
                    </option>
                  </select>
                </Field>

                {/* SOURCE */}

                <Field label="Source">
                  <input
                    type="text"
                    value={
                      revenueForm.source
                    }
                    onChange={(e) =>
                      updateRevenueForm(
                        'source',
                        e.target.value,
                      )
                    }
                    placeholder="Google Ads / SEO / Referral"
                    className="input"
                  />
                </Field>

                {/* SOURCE DETAIL */}

                <Field label="Source Detail">
                  <input
                    type="text"
                    value={
                      revenueForm.sourceDetail
                    }
                    onChange={(e) =>
                      updateRevenueForm(
                        'sourceDetail',
                        e.target.value,
                      )
                    }
                    placeholder="Campaign / referral details"
                    className="input"
                  />
                </Field>

                {/* STATUS */}

                <Field
                  label="Status"
                  required
                >
                  <select
                    value={
                      revenueForm.status
                    }
                    onChange={(e) =>
                      updateRevenueForm(
                        'status',
                        e.target.value,
                      )
                    }
                    className="input"
                  >
                    <option value="RECOGNIZED">
                      Recognized
                    </option>

                    <option value="PENDING">
                      Pending
                    </option>

                    <option value="REFUNDED">
                      Refunded
                    </option>

                    <option value="CANCELLED">
                      Cancelled
                    </option>
                  </select>
                </Field>

                {/* DESCRIPTION */}

                <div className="sm:col-span-2">
                  <Field label="Description">
                    <textarea
                      rows={4}
                      value={
                        revenueForm.description
                      }
                      onChange={(e) =>
                        updateRevenueForm(
                          'description',
                          e.target.value,
                        )
                      }
                      placeholder="Website project payment, SEO retainer, consultation..."
                      className="input resize-none"
                    />
                  </Field>
                </div>

              </div>

              {/* INFO */}

              {revenueForm.leadId && (
                <div className="mt-5 rounded-rk-md border border-rk-success/30 bg-rk-successSoft px-4 py-3 text-xs leading-5 text-rk-ink">
                  <p className="font-bold">
                    Lead conversion
                  </p>

                  <p className="mt-1 text-rk-secondary">
                    When this revenue is
                    created against a lead,
                    the backend will mark that
                    lead as{' '}
                    <strong className="text-rk-ink">
                      CONVERTED
                    </strong>
                    .
                  </p>
                </div>
              )}

              {/* ACTIONS */}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <SecondaryButton
                  onClick={
                    closeRevenueModal
                  }
                  disabled={
                    savingRevenue
                  }
                >
                  Cancel
                </SecondaryButton>

                <PrimaryButton
                  type="submit"
                  disabled={
                    savingRevenue
                  }
                >
                  {savingRevenue ? (
                    <RefreshCw
                      size={15}
                      aria-hidden
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2
                      size={15}
                      aria-hidden
                    />
                  )}

                  {savingRevenue
                    ? 'Saving…'
                    : 'Record Revenue'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteLead !== null}
        title="Delete lead?"
        description={`Delete lead "${
          pendingDeleteLead?.name ||
          pendingDeleteLead?.email ||
          'Unnamed lead'
        }"? This cannot be undone.`}
        confirmLabel="Delete lead"
        confirming={deletingId !== null}
        onConfirm={confirmDeleteLead}
        onCancel={() =>
          setPendingDeleteLead(null)
        }
      />
    </AppShell>
  );
}

/*
 * =========================================================
 * FIELD
 * =========================================================
 */

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="rk-field-label mb-1.5 block">
        {label}

        {required && (
          <span className="ml-1 text-rk-danger">
            *
          </span>
        )}
      </span>

      {children}
    </label>
  );
}

/*
 * =========================================================
 * OUTCOME SECTION — How confidently is it attributed?
 * =========================================================
 */

function OutcomeSection({
  outcome,
  outcomeError,
  dateLabel,
  onGapAction,
  gapActionMap,
}: {
  outcome: OutcomeResponse | null;
  outcomeError: string;
  dateLabel: string;
  onGapAction: (
    gapId: string,
  ) => void;
  gapActionMap: Record<
    string,
    boolean
  >;
}) {
  if (outcomeError && !outcome) {
    return (
      <div className="mt-6">
        <Panel
          eyebrow="Outcome"
          title="Business Outcome"
          description="Traffic → leads → revenue attribution for the selected period."
        >
          <div className="rounded-rk-md border border-rk-warning/30 bg-rk-warningSoft px-4 py-3.5">
            <p className="text-sm font-bold text-rk-ink">
              Outcome engine unavailable
            </p>

            <p className="mt-1 text-xs leading-5 text-rk-secondary">
              {outcomeError} Lead and
              revenue records below remain
              fully available.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  if (!outcome) {
    return null;
  }

  const funnel = outcome.funnel;
  const roi = outcome.roi;
  const coverage =
    outcome.attribution.coverage;

  const funnelStages: Array<{
    label: string;
    display: string;
    availability?: string;
  }> = [
    {
      label: 'Visitors',
      display:
        funnel.visitors !== null
          ? String(funnel.visitors)
          : '—',
      availability:
        funnel.visitorsAvailability,
    },
    {
      label: 'Leads',
      display: String(
        funnel.leads,
      ),
    },
    {
      label: 'Qualified',
      display: String(
        funnel.qualified,
      ),
    },
    {
      label: 'Conversions',
      display: String(
        funnel.conversions,
      ),
    },
    {
      label: 'Revenue',
      display: formatOutcomeMoney(
        funnel.revenue,
      ),
    },
  ];

  return (
    <div className="mt-6">
      <Panel
        eyebrow="Outcome"
        title="Business Outcome"
        description={`How confidently is revenue attributed? ${dateLabel} · real records only.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {funnelStages.map(
            (stage) => (
              <div
                key={stage.label}
                className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5"
              >
                <p className="rk-label">
                  {stage.label}
                </p>

                <p className="rk-number mt-1.5 truncate text-xl font-extrabold">
                  {stage.display}
                </p>

                {stage.availability &&
                  stage.availability !==
                    'AVAILABLE' && (
                    <p className="rk-metadata mt-1">
                      {formatAvailability(
                        stage.availability,
                      )}
                    </p>
                  )}
              </div>
            ),
          )}
        </div>

        <p className="mt-3 text-xs text-rk-secondary">
          Conversion rate:{' '}
          <span className="font-bold text-rk-ink">
            {funnel.conversionRate !==
            null
              ? `${funnel.conversionRate}%`
              : '— (no leads in range)'}
          </span>
        </p>

        <div className="mt-5 grid gap-5 border-t border-rk-border pt-5 lg:grid-cols-2">
          <div>
            <h3 className="rk-label">
              Revenue attribution
            </h3>

            <div className="mt-3 space-y-2">
              <AttributionRow
                label="Directly attributed (linked lead)"
                count={
                  outcome.attribution
                    .tiers
                    .DIRECTLY_ATTRIBUTED
                    ?.count ?? 0
                }
                amount={
                  outcome.attribution
                    .tiers
                    .DIRECTLY_ATTRIBUTED
                    ?.amount ?? 0
                }
              />

              <AttributionRow
                label="Source recorded"
                count={
                  outcome.attribution
                    .tiers
                    .SOURCE_RECORDED
                    ?.count ?? 0
                }
                amount={
                  outcome.attribution
                    .tiers
                    .SOURCE_RECORDED
                    ?.amount ?? 0
                }
              />

              <AttributionRow
                label="Unattributed"
                count={
                  outcome.attribution
                    .tiers.UNATTRIBUTED
                    ?.count ?? 0
                }
                amount={
                  outcome.attribution
                    .tiers.UNATTRIBUTED
                    ?.amount ?? 0
                }
              />
            </div>

            <p className="mt-3 text-xs text-rk-secondary">
              Attribution coverage:{' '}
              <span className="font-bold text-rk-ink">
                {coverage !== null
                  ? `${coverage}%`
                  : '— (no recognized revenue)'}
              </span>
            </p>
          </div>

          <div>
            <h3 className="rk-label">
              Attributed ROI
            </h3>

            {roi.measurable &&
            roi.attributedRoi !==
              null ? (
              <div className="mt-3">
                <p className="rk-number text-3xl font-extrabold">
                  {roi.attributedRoi}%
                </p>

                <p className="mt-1 text-xs leading-5 text-rk-secondary">
                  {formatOutcomeMoney(
                    roi.attributedRevenue,
                  )}{' '}
                  attributed revenue
                  against{' '}
                  {formatOutcomeMoney(
                    roi.spend,
                  )}{' '}
                  spend.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-rk-secondary">
                ROI unavailable —
                insufficient
                spend/attribution
                data.
                {roi.spend <= 0
                  ? ' No marketing spend is recorded in range.'
                  : ' No attributed revenue is recorded in range.'}
              </p>
            )}

            <div className="mt-4 border-t border-rk-border pt-3 text-xs leading-5 text-rk-secondary">
              <span className="font-semibold text-rk-ink">
                Recent 30d vs prior 30d:
              </span>{' '}
              leads{' '}
              {
                outcome.recentChanges
                  .leadsRecent
              }{' '}
              ({signed(
                outcome.recentChanges
                  .leadsDelta,
              )}
              ) · revenue{' '}
              {formatOutcomeMoney(
                outcome.recentChanges
                  .revenueRecent,
              )}{' '}
              ({signedMoney(
                outcome.recentChanges
                  .revenueDelta,
              )}
              )
            </div>
          </div>
        </div>

        {outcome.sources.length >
          0 && (
          <div className="mt-5 border-t border-rk-border pt-5">
            <h3 className="rk-label">
              Source performance
            </h3>

            <div className="mt-3">
              <DataTable
                caption="Outcome source performance"
                columns={[
                  {
                    key: 'source',
                    label: 'Source',
                    priority: 'high',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="font-semibold">
                        {row.source}
                      </span>
                    ),
                  },
                  {
                    key: 'leads',
                    label: 'Leads',
                    align: 'right',
                    priority: 'high',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="tabular-nums">
                        {row.leads}
                      </span>
                    ),
                  },
                  {
                    key: 'conversions',
                    label: 'Conv.',
                    align: 'right',
                    priority: 'medium',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="tabular-nums">
                        {row.conversions}
                        {row.conversionRate !==
                        null
                          ? ` (${row.conversionRate}%)`
                          : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'revenue',
                    label: 'Attr. revenue',
                    align: 'right',
                    priority: 'medium',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="tabular-nums">
                        {formatOutcomeMoney(
                          row.attributedRevenue,
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'spend',
                    label: 'Spend',
                    align: 'right',
                    priority: 'low',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="tabular-nums">
                        {formatOutcomeMoney(
                          row.spend,
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'roi',
                    label: 'ROI',
                    align: 'right',
                    priority: 'low',
                    render: (row: (typeof outcome.sources)[number]) => (
                      <span className="font-semibold tabular-nums">
                        {row.roi !== null
                          ? `${row.roi}%`
                          : '—'}
                      </span>
                    ),
                  },
                ]}
                rows={outcome.sources}
                keyOf={(row) => row.source}
                loading={false}
                density="compact"
              />
            </div>
          </div>
        )}

        {outcome.conversionGaps
          .length > 0 && (
          <div className="mt-5 rounded-rk-md border border-rk-warning/30 bg-rk-warningSoft/50 px-4 py-3.5">
            <h3 className="rk-label">
              Outcome opportunities
            </h3>

            <div className="mt-3 space-y-2">
              {outcome.conversionGaps.map(
                (gap) => {
                  const busy =
                    gapActionMap[
                      gap.id
                    ];

                  return (
                    <div
                      key={gap.id}
                      className="flex flex-col gap-2 rounded-rk-md border border-rk-border bg-rk-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-rk-ink">
                          {gap.title}
                        </p>

                        <p className="mt-0.5 text-xs leading-5 text-rk-secondary">
                          {gap.description}
                        </p>
                      </div>

                      <PrimaryButton
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          onGapAction(
                            gap.id,
                          )
                        }
                      >
                        {busy
                          ? 'Added ✓'
                          : 'Add to Actions'}
                      </PrimaryButton>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function formatOutcomeMoney(
  value: number,
) {
  const safe = Number(value ?? 0);

  return `₹${safe.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;
}

function AttributionRow({
  label,
  count,
  amount,
}: {
  label: string;
  count: number;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-rk-md border border-rk-border bg-rk-soft px-4 py-2.5">
      <span className="text-xs font-semibold text-rk-secondary">
        {label}
      </span>

      <span className="text-xs tabular-nums text-rk-ink">
        <span className="font-bold">
          {count}
        </span>{' '}
        ·{' '}
        {formatOutcomeMoney(
          amount,
        )}
      </span>
    </div>
  );
}

function formatAvailability(
  value: string,
) {
  if (
    value === 'NOT_CONNECTED'
  ) {
    return 'Analytics not connected';
  }

  return 'No data available';
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`;
}

function signedMoney(
  value: number,
) {
  return `${value > 0 ? '+' : ''}${formatOutcomeMoney(value)}`;
}
