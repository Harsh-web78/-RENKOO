'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getUnifiedOpportunities,
  UnifiedOpportunity,
} from '@/lib/api';

type Filter =
  | 'ALL'
  | 'SEO'
  | 'COMPETITOR'
  | 'BACKLINK'
  | 'GEO'
  | 'AEO'
  | 'BUSINESS_BRAIN';

export default function OpportunitiesPage() {
  const [data, setData] =
    useState<any>(null);

  const [filter, setFilter] =
    useState<Filter>('ALL');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  useEffect(() => {
    const websiteId =
      localStorage.getItem('renkoo_website_id');

    if (!websiteId) {
      setError('No website selected.');
      setLoading(false);
      return;
    }

    getUnifiedOpportunities(websiteId)
      .then(setData)
      .catch((err) => {
        console.error(
          '[RENKOO] OPPORTUNITIES ERROR',
          err,
        );

        setError(
          err?.message ||
          'Failed to load opportunities',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const opportunities:
    UnifiedOpportunity[] =
    data?.opportunities || [];

  const filtered = useMemo(() => {
    if (filter === 'ALL') {
      return opportunities;
    }

    return opportunities.filter((item) => {
      switch (filter) {
        case 'SEO':
          return [
            'SEO_AUDIT',
            'CONTENT',
          ].includes(item.source);

        case 'COMPETITOR':
          return item.source ===
            'COMPETITOR_COMPARISON';

        case 'BACKLINK':
          return item.source ===
            'BACKLINK';

        case 'GEO':
          return [
            'GEO',
            'GEO_AUDIT',
          ].includes(item.source);

        case 'AEO':
          return [
            'AEO',
            'AEO_AUDIT',
          ].includes(item.source);

        case 'BUSINESS_BRAIN':
          return item.source ===
            'BUSINESS_BRAIN';

        default:
          return true;
      }
    });
  }, [filter, opportunities]);

  if (loading) {
    return (
      <main className="p-8">
        <p className="text-sm text-gray-500">
          Loading opportunities...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold">
          Opportunity Engine
        </h1>

        <div className="mt-6 rounded-xl border p-6 text-red-600">
          {error}
        </div>
      </main>
    );
  }

  const summary = data?.summary;

  return (
    <main className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Opportunity Engine
        </h1>

        <p className="mt-2 text-gray-500">
          One prioritized growth queue across RENKOO.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total"
          value={data?.total || 0}
        />

        <SummaryCard
          label="High Priority"
          value={summary?.high || 0}
        />

        <SummaryCard
          label="Medium"
          value={summary?.medium || 0}
        />

        <SummaryCard
          label="Low"
          value={summary?.low || 0}
        />
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {[
          'ALL',
          'SEO',
          'COMPETITOR',
          'BACKLINK',
          'GEO',
          'AEO',
          'BUSINESS_BRAIN',
        ].map((item) => (
          <button
            key={item}
            onClick={() =>
              setFilter(item as Filter)
            }
            className={
              filter === item
                ? 'rounded-lg bg-black px-4 py-2 text-sm text-white'
                : 'rounded-lg border bg-white px-4 py-2 text-sm'
            }
          >
            {item === 'BUSINESS_BRAIN'
              ? 'Business Brain'
              : item}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border p-10 text-center">
          <h2 className="font-semibold">
            No opportunities found
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            No opportunities are available for this filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="text-sm text-gray-500">
        {label}
      </div>

      <div className="mt-2 text-3xl font-bold">
        {value}
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
}: {
  opportunity: UnifiedOpportunity;
}) {
  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>
              {opportunity.source}
            </Badge>

            <Badge>
              {opportunity.priority}
            </Badge>

            <Badge>
              Score {opportunity.score}
            </Badge>
          </div>

          <h2 className="text-lg font-semibold">
            {opportunity.title}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {opportunity.description}
          </p>

          {opportunity.recommendation && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase text-gray-500">
                Recommended Action
              </div>

              <div className="mt-1 text-sm">
                {opportunity.recommendation}
              </div>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">
            Status
          </div>

          <div className="mt-1 text-sm font-medium">
            {opportunity.status}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

