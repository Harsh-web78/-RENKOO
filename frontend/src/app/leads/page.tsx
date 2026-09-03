'use client';

import {
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from 'react';

import {
  Users,
  RefreshCw,
  Plus,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
  CheckCircle2,
  IndianRupee,
  Wallet,
  ArrowUpRight,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

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
  Website,
  Lead,
  LeadsSummary,
  Revenue,
  RevenueSummary,
} from '../../lib/api';

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
  }, [websiteId]);

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
        setWebsiteId(safeWebsites[0].id);
      } else {
        setWebsiteId('');
        setLeads([]);
        setSummary(null);
        setRevenues([]);
        setRevenueSummary(null);
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

      const [
        leadData,
        summaryData,
        revenueData,
        revenueSummaryData,
      ] = await Promise.all([
        getLeads(websiteId),
        getLeadsSummary(websiteId),
        getRevenue(websiteId),
        getRevenueSummary(websiteId),
      ]);

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
    } finally {
      setLoading(false);
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
    const confirmed =
      window.confirm(
        `Delete lead "${
          lead.name ||
          lead.email ||
          'Unnamed lead'
        }"?`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(lead.id);
      setError('');

      await deleteLead(
        websiteId,
        lead.id,
      );

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
   * STATUS STYLE
   * =========================================================
   */

  function getStatusClass(
    status: string,
  ) {
    const normalized =
      status.toUpperCase();

    if (
      normalized === 'CONVERTED'
    ) {
      return 'bg-emerald-50 text-emerald-700';
    }

    if (
      normalized === 'QUALIFIED'
    ) {
      return 'bg-blue-50 text-blue-700';
    }

    if (
      normalized === 'CONTACTED'
    ) {
      return 'bg-violet-50 text-violet-700';
    }

    if (
      normalized === 'LOST'
    ) {
      return 'bg-red-50 text-red-700';
    }

    return 'bg-slate-100 text-slate-700';
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

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={false}
        onClose={() => {}}
      />

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-5 lg:p-8">

          {/* =====================================================
              HEADER
          ====================================================== */}

          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users
                  size={23}
                  className="text-blue-600"
                />

                <h1 className="text-2xl font-bold text-slate-900">
                  Leads & Revenue
                </h1>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Track leads, pipeline value,
                conversions, revenue and
                acquisition sources.
              </p>
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {websites.map(
                  (website) => (
                    <option
                      key={website.id}
                      value={website.id}
                    >
                      {website.name}
                    </option>
                  ),
                )}
              </select>

              <button
                type="button"
                onClick={loadData}
                disabled={
                  loading ||
                  !websiteId
                }
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={
                    loading
                      ? 'animate-spin'
                      : ''
                  }
                />

                Refresh
              </button>
            </div>
          </header>

          {/* =====================================================
              ERROR
          ====================================================== */}

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0"
              />

              <div className="flex-1">
                {error}
              </div>

              <button
                type="button"
                onClick={() =>
                  setError('')
                }
                className="rounded-lg p-1 hover:bg-red-100"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* =====================================================
              LEAD METRICS
          ====================================================== */}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric
              label="Total Leads"
              value={
                summary?.total ??
                leads.length
              }
            />

            <Metric
              label="New"
              value={
                summary?.new ?? 0
              }
            />

            <Metric
              label="Qualified"
              value={
                summary?.qualified ??
                0
              }
            />

            <Metric
              label="Converted"
              value={
                summary?.converted ??
                0
              }
            />

            <Metric
              label="Conversion Rate"
              value={`${summary?.conversionRate ?? 0}%`}
            />
          </div>

          {/* =====================================================
              VALUE METRICS
          ====================================================== */}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Metric
              label="Pipeline Value"
              value={formatMoney(
                summary?.pipelineValue ??
                  0,
              )}
            />

            <Metric
              label="Revenue"
              value={formatMoney(
                revenueSummary?.totalRevenue ??
                  summary?.revenue ??
                  0,
              )}
            />
          </div>

          {/* =====================================================
              LEAD PIPELINE
          ====================================================== */}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Lead Pipeline
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Latest captured leads
                </p>
              </div>

              <button
                type="button"
                onClick={
                  openAddLead
                }
                disabled={
                  !websiteId ||
                  loading
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={15} />
                Add Lead
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <RefreshCw
                  size={22}
                  className="animate-spin text-blue-600"
                />
              </div>
            ) : leads.length ===
              0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <Users
                    size={21}
                    className="text-slate-500"
                  />
                </div>

                <div className="mt-4 text-sm font-semibold text-slate-800">
                  No leads captured yet.
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Add your first lead to
                  start tracking your
                  pipeline.
                </p>

                <button
                  type="button"
                  onClick={
                    openAddLead
                  }
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus size={14} />
                  Add First Lead
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">

                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">
                        Lead
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Company
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Source
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Status
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Score
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Value
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {leads.map(
                      (lead) => (
                        <tr
                          key={
                            lead.id
                          }
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">
                              {lead.name ||
                                'Unnamed lead'}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {lead.email ||
                                lead.phone ||
                                '—'}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {lead.company ||
                              '—'}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              {lead.source ||
                                'Unknown'}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                                lead.status ||
                                  'NEW',
                              )}`}
                            >
                              {lead.status ||
                                'NEW'}
                            </span>
                          </td>

                          <td className="px-5 py-4 font-bold text-slate-900">
                            {lead.score ??
                              0}
                          </td>

                          <td className="px-5 py-4 font-semibold text-slate-900">
                            {formatMoney(
                              lead.estimatedValue ??
                                0,
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">

                              {lead.status?.toUpperCase() !==
                                'CONVERTED' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAddRevenue(
                                      lead,
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                                >
                                  <IndianRupee
                                    size={
                                      13
                                    }
                                  />
                                  Revenue
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  openEditLead(
                                    lead,
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Pencil
                                  size={
                                    13
                                  }
                                />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteLead(
                                    lead,
                                  )
                                }
                                disabled={
                                  deletingId ===
                                  lead.id
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingId ===
                                lead.id ? (
                                  <RefreshCw
                                    size={
                                      13
                                    }
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2
                                    size={
                                      13
                                    }
                                  />
                                )}

                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* =====================================================
              REVENUE SECTION
          ====================================================== */}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Wallet
                    size={18}
                    className="text-emerald-600"
                  />

                  <h2 className="text-sm font-bold text-slate-900">
                    Revenue
                  </h2>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Revenue generated from
                  converted leads
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  openAddRevenue()
                }
                disabled={
                  !websiteId ||
                  loading
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={15} />
                Add Revenue
              </button>
            </div>

            {/* REVENUE SUMMARY */}

            <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-3">

              <RevenueMetric
                icon={
                  <IndianRupee
                    size={17}
                  />
                }
                label="Total Revenue"
                value={formatMoney(
                  revenueSummary?.totalRevenue ??
                    0,
                )}
              />

              <RevenueMetric
                icon={
                  <Wallet
                    size={17}
                  />
                }
                label="Transactions"
                value={
                  revenueSummary?.transactions ??
                  0
                }
              />

              <RevenueMetric
                icon={
                  <ArrowUpRight
                    size={17}
                  />
                }
                label="Average Revenue"
                value={formatMoney(
                  revenueSummary?.averageRevenue ??
                    0,
                )}
              />

            </div>

            {/* REVENUE TABLE */}

            {loading ? (
              <div className="flex items-center justify-center p-10">
                <RefreshCw
                  size={20}
                  className="animate-spin text-blue-600"
                />
              </div>
            ) : revenues.length ===
              0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                  <Wallet
                    size={19}
                    className="text-emerald-600"
                  />
                </div>

                <div className="mt-3 text-sm font-semibold text-slate-800">
                  No revenue recorded yet.
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Add revenue when a lead
                  converts.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    openAddRevenue()
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Plus size={14} />
                  Add Revenue
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">

                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">
                        Date
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Lead
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Source
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Description
                      </th>

                      <th className="px-5 py-3 font-semibold">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {revenues.map(
                      (revenue) => {
                        const linkedLead =
                          leads.find(
                            (lead) =>
                              lead.id ===
                              revenue.leadId,
                          );

                        return (
                          <tr
                            key={
                              revenue.id
                            }
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-4 text-xs text-slate-500">
                              {revenue.recognizedAt
                                ? new Date(
                                    revenue.recognizedAt,
                                  ).toLocaleDateString(
                                    'en-IN',
                                    {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    },
                                  )
                                : '—'}
                            </td>

                            <td className="px-5 py-4">
                              <div className="font-semibold text-slate-900">
                                {linkedLead?.name ||
                                  linkedLead?.email ||
                                  'Direct Revenue'}
                              </div>

                              {linkedLead?.company && (
                                <div className="mt-1 text-xs text-slate-500">
                                  {
                                    linkedLead.company
                                  }
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4 text-xs text-slate-600">
                              {revenue.source ||
                                '—'}
                            </td>

                            <td className="max-w-[260px] px-5 py-4 text-xs text-slate-500">
                              {revenue.description ||
                                revenue.sourceDetail ||
                                '—'}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  revenue.status?.toUpperCase() ===
                                  'RECOGNIZED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {revenue.status ||
                                  'RECOGNIZED'}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right font-bold text-emerald-700">
                              {formatMoney(
                                revenue.amount ??
                                  0,
                                revenue.currency ||
                                  'INR',
                              )}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>

                </table>
              </div>
            )}
          </section>

          {/* =====================================================
              LEAD SOURCES
          ====================================================== */}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <h2 className="text-sm font-bold text-slate-900">
              Lead Sources
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

              {Object.entries(
                summary?.bySource ||
                  {},
              ).map(
                ([source, count]) => (
                  <div
                    key={source}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {source}
                    </div>

                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {String(count)}
                    </div>
                  </div>
                ),
              )}

              {(!summary ||
                Object.keys(
                  summary.bySource ||
                    {},
                ).length ===
                  0) && (
                <div className="text-xs text-slate-500">
                  No source data yet.
                </div>
              )}

            </div>
          </section>

        </div>
      </main>

      {/* =========================================================
          ADD / EDIT LEAD MODAL
      ========================================================= */}

      {showLeadModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLeadModal();
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingLead
                    ? 'Edit Lead'
                    : 'Add Lead'}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
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
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <X size={19} />
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
                <button
                  type="button"
                  onClick={
                    closeLeadModal
                  }
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2
                      size={15}
                    />
                  )}

                  {saving
                    ? 'Saving...'
                    : editingLead
                    ? 'Update Lead'
                    : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          ADD REVENUE MODAL
      ========================================================= */}

      {showRevenueModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeRevenueModal();
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                    <IndianRupee
                      size={18}
                      className="text-emerald-600"
                    />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Add Revenue
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
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
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <X size={19} />
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
                <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-800">
                  <div className="font-semibold">
                    Lead conversion
                  </div>

                  <div className="mt-1">
                    When this revenue is
                    created against a lead,
                    the backend will mark that
                    lead as{' '}
                    <strong>
                      CONVERTED
                    </strong>
                    .
                  </div>
                </div>
              )}

              {/* ACTIONS */}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    closeRevenueModal
                  }
                  disabled={
                    savingRevenue
                  }
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingRevenue
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingRevenue ? (
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <CheckCircle2
                      size={15}
                    />
                  )}

                  {savingRevenue
                    ? 'Saving...'
                    : 'Record Revenue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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
      <div className="mb-1.5 text-xs font-semibold text-slate-700">
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </div>

      {children}
    </label>
  );
}

/*
 * =========================================================
 * METRIC
 * =========================================================
 */

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

/*
 * =========================================================
 * REVENUE METRIC
 * =========================================================
 */

function RevenueMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}
