'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  getSharedReport,
  SharedReport,
} from '@/lib/api';

export default function SharedReportPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const [report, setReport] =
    useState<SharedReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setError('Invalid share link.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const data = await getSharedReport(token);
      setReport(data);
    } catch (err: any) {
      setError(
        err?.message ||
          'This shared report is not available. The link may have expired or been revoked.',
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[1000px] p-5 lg:p-8">
        <header className="border-b border-slate-200 pb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {(report?.branding?.agencyName ||
              'RENKOO') + ' · Client report'}
          </div>
          <h1 className="mt-1 text-2xl font-bold">
            {report?.title || 'Shared report'}
          </h1>
          {report && (
            <p className="mt-1 text-xs text-slate-400">
              {report.website.name} · {report.website.url} ·
              generated{' '}
              {new Date(
                report.generatedAt,
              ).toLocaleString()}
            </p>
          )}
        </header>

        {loading ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            Loading shared report...
          </p>
        ) : error || !report ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-bold">
              Report unavailable
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {error ||
                'This link is no longer valid.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-4">
              {Object.entries(
                report.sections ?? {},
              ).map(([key, section]: [string, any]) => (
                <section
                  key={key}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                      {key.replace(/_/g, ' ')}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        section?.status ===
                        'AVAILABLE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {section?.status || 'NO_DATA'}
                    </span>
                  </div>

                  {section?.status ===
                  'AVAILABLE' ? (
                    <SharedSectionBody
                      sectionKey={key}
                      section={section}
                    />
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">
                      {section?.reason ||
                        'No data available for this section.'}
                    </p>
                  )}
                </section>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
              >
                Print / Save as PDF
              </button>
            </div>

            <p className="mt-4 text-center text-[11px] text-slate-400">
              Read-only client view. Internal notes, team data,
              and other clients are never included.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function SharedSectionBody({
  sectionKey,
  section,
}: {
  sectionKey: string;
  section: any;
}) {
  if (sectionKey === 'overview') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          <b>{section.website?.name}</b> ·{' '}
          {section.website?.url}
        </p>
        {section.businessGoal && (
          <p className="mt-1">
            Priority: {section.businessGoal}
          </p>
        )}
      </div>
    );
  }

  if (sectionKey === 'seo') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Score <b>{section.score}/100</b> ·{' '}
        {section.openIssues} open issues across{' '}
        {section.pages} pages.
      </p>
    );
  }

  if (sectionKey === 'technical') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.groups ?? [])
          .slice(0, 8)
          .map((group: any) => (
            <li
              key={group.code}
              className="text-xs text-slate-600"
            >
              <b>{group.title}</b> — {group.count} pages
            </li>
          ))}
      </ul>
    );
  }

  if (sectionKey === 'opportunities') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          {section.total} open (
          {section.summary?.high ?? 0} high).
        </p>
        <ul className="mt-1.5 space-y-1">
          {(section.top ?? [])
            .slice(0, 8)
            .map((item: any, i: number) => (
              <li key={i}>
                · <b>{item.priority}</b> {item.title}
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (sectionKey === 'actions') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {section.open} open · {section.done} completed.
      </p>
    );
  }

  if (sectionKey === 'monitoring') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.changes ?? [])
          .slice(0, 8)
          .map((item: any, i: number) => (
            <li
              key={i}
              className="text-xs text-slate-600"
            >
              · <b>{item.severity}</b> {item.title}
            </li>
          ))}
      </ul>
    );
  }

  if (sectionKey === 'ai_visibility') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {section.counts?.completedChecks ?? 0} completed
        observations ·{' '}
        {section.counts?.brandMentions ?? 0} brand mentions.
      </p>
    );
  }

  if (sectionKey === 'competitors') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.competitors ?? []).map((item: any) => (
          <li
            key={item.id}
            className="text-xs text-slate-600"
          >
            <b>{item.name}</b> —{' '}
            {item.crawl
              ? `score ${item.crawl.score}`
              : 'no completed crawl'}
          </li>
        ))}
      </ul>
    );
  }

  if (sectionKey === 'outcome') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Revenue {section.funnel?.revenue ?? '—'} ·{' '}
        {section.funnel?.conversions ?? 0} conversions · ROI{' '}
        {section.roi?.measurable
          ? `${section.roi.attributedRoi}%`
          : 'unavailable'}.
      </p>
    );
  }

  if (sectionKey === 'narrative') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.summary ?? []).map(
          (line: string, i: number) => (
            <li
              key={i}
              className="text-xs leading-5 text-slate-600"
            >
              · {line}
            </li>
          ),
        )}
      </ul>
    );
  }

  if (
    sectionKey === 'changes' ||
    sectionKey === 'wins' ||
    sectionKey === 'risks' ||
    sectionKey === 'priorities' ||
    sectionKey === 'completed' ||
    sectionKey === 'nextPlan' ||
    sectionKey === 'limitations'
  ) {
    const items: any[] =
      section.rows ??
      section.items ??
      [];
    return (
      <ul className="mt-2 space-y-1">
        {items.map((item: any, i: number) => (
          <li
            key={i}
            className="text-xs leading-5 text-slate-600"
          >
            ·{' '}
            <b>
              {item.label ??
                item.title ??
                (typeof item === 'string'
                  ? item
                  : '')}
            </b>
            {item.statement || item.detail
              ? ` — ${item.statement ?? item.detail}`
              : typeof item === 'string'
                ? ''
                : ''}
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
