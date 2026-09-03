'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getActions,
  updateActionStatus,
  RenkooAction,
} from '@/lib/api';

type Filter =
  | 'ALL'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'DISMISSED';

export default function ActionsPage() {
  const [actions, setActions] = useState<RenkooAction[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadActions() {
    try {
      setLoading(true);
      setError('');

      const data = await getActions();
      setActions(Array.isArray(data?.actions) ? data.actions : []);
    } catch (err: any) {
      console.error('[RENKOO] ACTIONS ERROR', err);
      setError(err?.message || 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActions();
  }, []);

  async function changeStatus(
    actionId: string,
    status: RenkooAction['status'],
  ) {
    try {
      const updated = await updateActionStatus(
        actionId,
        status,
      );

      setActions((current) =>
        current.map((action) =>
          action.id === actionId
            ? { ...action, ...updated }
            : action,
        ),
      );
    } catch (err: any) {
      console.error('[RENKOO] STATUS UPDATE ERROR', err);
      setError(
        err?.message || 'Failed to update action',
      );
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'ALL') return actions;

    return actions.filter(
      (action) => action.status === filter,
    );
  }, [actions, filter]);

  const todo = actions.filter(
    (a) => a.status === 'TODO',
  ).length;

  const inProgress = actions.filter(
    (a) => a.status === 'IN_PROGRESS',
  ).length;

  const done = actions.filter(
    (a) => a.status === 'DONE',
  ).length;

  if (loading) {
    return (
      <main className="p-8">
        <p className="text-sm text-gray-500">
          Loading actions...
        </p>
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Action Engine
        </h1>

        <p className="mt-2 text-gray-500">
          Turn growth opportunities into completed work.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total" value={actions.length} />
        <Stat label="To Do" value={todo} />
        <Stat label="In Progress" value={inProgress} />
        <Stat label="Done" value={done} />
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {(
          [
            'ALL',
            'TODO',
            'IN_PROGRESS',
            'DONE',
            'DISMISSED',
          ] as Filter[]
        ).map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={
              filter === item
                ? 'rounded-lg bg-black px-4 py-2 text-sm text-white'
                : 'rounded-lg border bg-white px-4 py-2 text-sm'
            }
          >
            {item.replace('_', ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border p-10 text-center">
          <h2 className="font-semibold">
            No actions found
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Create an action from the Opportunity Engine.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onStatusChange={changeStatus}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function ActionCard({
  action,
  onStatusChange,
}: {
  action: RenkooAction;
  onStatusChange: (
    id: string,
    status: RenkooAction['status'],
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="flex flex-col gap-5 md:flex-row md:justify-between">
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full border px-2.5 py-1 text-xs">
              {action.priority}
            </span>

            <span className="rounded-full border px-2.5 py-1 text-xs">
              {action.type}
            </span>

            <span className="rounded-full border px-2.5 py-1 text-xs">
              {action.status.replace('_', ' ')}
            </span>
          </div>

          <h2 className="text-lg font-semibold">
            {action.title}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {action.description}
          </p>
        </div>

        <div className="flex gap-2 md:flex-col">
          {action.status === 'TODO' && (
            <button
              onClick={() =>
                onStatusChange(
                  action.id,
                  'IN_PROGRESS',
                )
              }
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Start
            </button>
          )}

          {action.status === 'IN_PROGRESS' && (
            <>
              <button
                onClick={() =>
                  onStatusChange(
                    action.id,
                    'DONE',
                  )
                }
                className="rounded-lg bg-black px-4 py-2 text-sm text-white"
              >
                Mark Done
              </button>

              <button
                onClick={() =>
                  onStatusChange(
                    action.id,
                    'DISMISSED',
                  )
                }
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Dismiss
              </button>
            </>
          )}

          {action.status === 'TODO' && (
            <button
              onClick={() =>
                onStatusChange(
                  action.id,
                  'DISMISSED',
                )
              }
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Dismiss
            </button>
          )}

          {action.status === 'DONE' && (
            <span className="px-4 py-2 text-sm font-medium">
              ✓ Completed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
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



