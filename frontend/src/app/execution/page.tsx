'use client';

/*
 * RENKOO Governed Execution 1.0 (Phase 29).
 * SEARCH GROWTH WORK: ready for review → proposal
 * detail → approval → execution → verification →
 * measurement → learning. Human approves every write.
 * No CMS connected: copy/export/manual only.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import AppShell from '@/components/AppShell';
import Drawer from '@/components/ui/Drawer';
import {
  PageHeader,
  Panel,
  StatusChip,
  DataSourceBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui';
import {
  approveActionProposal,
  executeActionProposal,
  getActions,
  getActionProposals,
  getWebsites,
  proposeActionChange,
  rejectActionProposal,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function human(value: unknown): string {
  return str(value).replaceAll('_', ' ');
}

export default function ExecutionPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sites, actionRes] = await Promise.all([
        getWebsites().catch(() => []),
        getActions().catch(() => ({ actions: [] })),
      ]);
      const list = Array.isArray(sites) ? sites : [];
      setWebsites(list);
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem('renkoo_website_id')
          : null;
      const valid =
        stored && list.some((s: any) => s.id === stored)
          ? stored
          : list[0]?.id || '';
      setWebsiteId(valid);
      const all: any[] = Array.isArray(
        (actionRes as any)?.actions,
      )
        ? (actionRes as any).actions
        : [];
      setActions(
        valid
          ? all.filter((action: any) => !action.websiteId || action.websiteId === valid)
          : all,
      );
    } catch (err: any) {
      setError(err?.message || 'Execution work failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openAction(id: string) {
    setOpenId(id);
    setDetail(null);
    setMessage('');
    try {
      setDetail(await getActionProposals(id));
    } catch {
      setDetail({ error: true });
    }
  }

  async function runProposal() {
    if (!openId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await proposeActionChange(openId, {});
      setDetail(await getActionProposals(openId));
      setMessage(
        result?.blocked
          ? 'Proposal stored as draft: proposed content is not supported by attached evidence.'
          : 'Proposal created for review.',
      );
    } catch (err: any) {
      setMessage(err?.message || 'Proposal failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runApprove(version: number) {
    if (!openId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const first: any = await approveActionProposal(openId, {
        version,
      });
      if (first?.requiresConfirmation) {
        setMessage(
          `Confirm: ${str(first.confirmation)} Calling approve again with confirmed:true executes approval.`,
        );
        const done: any = await approveActionProposal(
          openId,
          { version, confirmed: true },
        );
        setMessage(
          `Approved v${str(done?.proposal?.version ?? version)}.`,
        );
      } else {
        setMessage('Approved.');
      }
      setDetail(await getActionProposals(openId));
      void load();
    } catch (err: any) {
      setMessage(err?.message || 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runReject(version: number) {
    if (!openId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await rejectActionProposal(openId, { version });
      setMessage('Rejected.');
      setDetail(await getActionProposals(openId));
      void load();
    } catch (err: any) {
      setMessage(err?.message || 'Rejection failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runExecute(version: number) {
    if (!openId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result: any = await executeActionProposal(
        openId,
        { version, method: 'MANUAL' },
      );
      if (result?.status === 'EXECUTION_NOT_CONNECTED') {
        setMessage(
          'No write-capable CMS is connected. Copy the approved change or export it; then mark manual execution.',
        );
      } else {
        setMessage('Manual execution recorded. Verify the live page next.');
      }
      setDetail(await getActionProposals(openId));
      void load();
    } catch (err: any) {
      setMessage(err?.message || 'Execution failed.');
    } finally {
      setBusy(false);
    }
  }

  const reviewable = actions.filter((action: any) =>
    ['TODO', 'IN_PROGRESS', 'DONE'].includes(
      str(action.status),
    ),
  );

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Execution"
        title="Search growth work"
        description="Evidence-backed proposals with human approval. RENKOO never modifies websites on its own."
        meta={
          <span className="text-xs text-rk-muted">
            {websiteId
              ? `Website scope active`
              : 'All websites'}
          </span>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Reading execution work" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Execution work failed to load"
            description={error}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Ready for review"
            title="Proposals awaiting humans"
            description="Approve, reject or edit. Approval requires explicit confirmation of the exact change."
          >
            {reviewable.length === 0 ? (
              <EmptyState
                title="No work awaiting review"
                description="Actions with proposals appear here."
              />
            ) : (
              <ul className="space-y-2">
                {reviewable.slice(0, 12).map((action: any) => (
                  <li key={str(action.id)}>
                    <button
                      type="button"
                      onClick={() => void openAction(str(action.id))}
                      className="rk-focusable flex w-full flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left"
                    >
                      <span className="text-sm font-semibold text-rk-ink">
                        {str(action.title)}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <StatusChip
                          status={human(action.status)}
                        />
                        <StatusChip
                          status={human(action.type)}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            eyebrow="Honesty"
            title="What execution cannot do"
            description="No write-capable CMS is connected. Copy, export or record manual execution — never faked."
          >
            <p className="text-xs text-rk-muted">
              Blocked classes (URL, redirects, robots,
              canonical, deletion, server, DNS, code) stay
              recommendation-only. AUTO_ALLOWED never
              executes in this phase.
            </p>
          </Panel>
        </div>
      )}

      <Drawer
        open={openId !== null}
        onClose={() => {
          setOpenId(null);
          setDetail(null);
          setMessage('');
        }}
        title="Proposal detail"
        eyebrow="Governed change"
      >
        {!detail || detail.error ? (
          <p className="text-sm text-rk-muted">
            {detail?.error ? 'Detail unavailable.' : 'Loading…'}
          </p>
        ) : (
          <div className="space-y-3">
            {(detail.proposals ?? []).map((proposal: any) => (
              <div
                key={str(proposal.version)}
                className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
              >
                <p className="text-sm font-semibold text-rk-ink">
                  v{str(proposal.version)} —{' '}
                  {str(proposal.expectedChange)}
                </p>
                <p className="mt-1 break-words text-xs text-rk-secondary">
                  Current:{' '}
                  {str(proposal.currentState) || 'unavailable'}
                </p>
                <p className="break-words text-xs text-rk-secondary">
                  Proposed: {str(proposal.proposedState)}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <StatusChip
                    status={human(proposal.status)}
                  />
                  <StatusChip
                    status={`Risk ${human(proposal.risk)}`}
                  />
                  <DataSourceBadge
                    source={`${(proposal.evidence ?? []).length} evidence sources`}
                    connected={false}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PrimaryButton
                    type="button"
                    onClick={() => void runApprove(Number(proposal.version))}
                    disabled={busy}
                  >
                    Approve
                  </PrimaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => void runReject(Number(proposal.version))}
                    disabled={busy}
                  >
                    Reject
                  </SecondaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => void runExecute(Number(proposal.version))}
                    disabled={busy}
                  >
                    Record manual execution
                  </SecondaryButton>
                </div>
              </div>
            ))}
            {(detail.proposals ?? []).length === 0 ? (
              <div>
                <p className="text-sm text-rk-muted">
                  No proposal yet for this action.
                </p>
                <div className="mt-2">
                  <PrimaryButton
                    type="button"
                    onClick={() => void runProposal()}
                    disabled={busy}
                  >
                    Create proposal
                  </PrimaryButton>
                </div>
              </div>
            ) : null}
            {message ? (
              <p className="text-xs text-rk-muted">{message}</p>
            ) : null}
            <p className="text-xs text-rk-muted">
              {str(detail.aiProposal ?? '')}
            </p>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
