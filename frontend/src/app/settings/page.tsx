'use client';

/*
 * RENKOO — Settings (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / badges / buttons /
 * states with rk-* tokens. Profile/account logic, website
 * information, team management, password change, validation,
 * messages, permissions and auth behavior are unchanged.
 * No settings controls were added — every control maps to
 * an existing backend capability.
 */

import { getTeamMembers, inviteTeamMember, updateTeamMemberRole, removeTeamMember, TeamMember } from "../../lib/api";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PersonaSelector from '@/components/PersonaSelector';
import PageHeader from '@/components/ui/PageHeader';
import Panel from '@/components/ui/Panel';
import { Badge } from '@/components/ui/badge';
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
} from '@/components/ui/buttons';
import {
  EmptyState,
  LoadingBlock,
  LimitReachedState,
} from '@/components/ui/states';
import {
  getCurrentAccount,
  isLimitError,
  limitDetails,
  limitUsageText,
  logout,
  updateProfile,
  updatePassword,
  type CurrentAccount,
} from '@/lib/api';
import { limitTitle } from '@/lib/plans';
import {
  TOUR_DISCOVERY_EVENT,
  TOUR_RESTART_EVENT,
} from '@/components/tour/tourEvents';

export default function SettingsPage() {
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [teamLimit, setTeamLimit] =
    useState<unknown>(null);
const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'workspace' | 'profile' | 'team' | 'security' | 'billing'>('workspace');
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    getTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
    async function load() {
      try {
        const data = await getCurrentAccount();
        setAccount(data);
        setName(data.user.name || '');
      } catch (error: any) {
        setProfileMessage(
          error?.message || 'Unable to load account details.',
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleProfileSave() {
    if (name.trim().length < 2) {
      setProfileMessage('Name must contain at least 2 characters.');
      return;
    }

    setSavingProfile(true);
    setProfileMessage('');

    try {
      const updated = await updateProfile(name.trim());

      setAccount((previous) =>
        previous
          ? {
              ...previous,
              user: {
                ...previous.user,
                name: updated.name,
              },
            }
          : previous,
      );

      setProfileMessage('Profile updated successfully.');
    } catch (error: any) {
      setProfileMessage(
        error?.message || 'Unable to update profile.',
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave() {
    if (!currentPassword || !newPassword) {
      setPasswordMessage('Enter your current and new password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage(
        'New password must contain at least 8 characters.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    setPasswordMessage('');

    try {
      const result = await updatePassword(
        currentPassword,
        newPassword,
      );

      setPasswordMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordMessage(
        error?.message || 'Unable to update password.',
      );
    } finally {
      setSavingPassword(false);
    }
  }

  function scrollToSection(
    tab: 'workspace' | 'profile' | 'team' | 'security' | 'billing',
  ) {
    setActiveTab(tab);
    if (typeof document !== 'undefined') {
      document
        .getElementById(`settings-${tab}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleInvite() {
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) return;
    setTeamLoading(true);
    setTeamMessage("");
    setTeamLimit(null);
    try {
      await inviteTeamMember(trimmedEmail, inviteRole);
      setInviteEmail("");
      const refreshed = await getTeamMembers();
      setTeamMembers(refreshed);
      setTeamMessage(
        `Invite sent to ${trimmedEmail}. Member list refreshed — they will appear below once they accept.`
      );
    } catch (error) {
      if (isLimitError(error)) {
        setTeamLimit(error);
      } else {
        setTeamMessage(error instanceof Error ? error.message : "Failed to invite member.");
      }
    } finally {
      setTeamLoading(false);
    }
  }

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Account"
          title="Settings"
          description="Manage your RENKOO account, workspace and security."
          meta={
            <>
              {account?.user.email ? (
                <span className="truncate">{account.user.email}</span>
              ) : (
                <span>Your account</span>
              )}
              <span aria-hidden>·</span>
              <Badge
                label={account?.membership?.role || 'MEMBER'}
                tone="neutral"
              />
            </>
          }
        />

        <nav
          aria-label="Settings sections"
          className="mt-5 flex flex-wrap gap-2"
        >
          {(
            [
              { key: 'workspace', label: 'Workspace' },
              { key: 'profile', label: 'Profile' },
              { key: 'team', label: 'Team' },
              { key: 'security', label: 'Security' },
              { key: 'billing', label: 'Billing' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => scrollToSection(tab.key)}
              aria-current={activeTab === tab.key ? 'true' : undefined}
              className={`rk-focusable rounded-rk-md px-4 py-2 text-[13px] font-bold transition ${
                activeTab === tab.key
                  ? 'bg-rk-ink text-white shadow-rk-sm'
                  : 'border border-rk-border bg-rk-surface text-rk-secondary hover:border-rk-strong hover:text-rk-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="mt-4">
            <LoadingBlock title="Loading account…" lines={4} />
          </div>
        ) : (
          <div className="mt-6 space-y-6">

            <div id="settings-profile" className="scroll-mt-24">
              <Panel
                eyebrow="Profile"
                title="Personal account information"
                description="Your personal RENKOO account information."
                actions={
                  <Badge
                    label={account?.membership?.role || 'MEMBER'}
                    tone="info"
                  />
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="rk-field-label">
                      Full name
                    </span>

                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rk-input mt-1.5"
                    />
                  </label>

                  <div>
                    <span className="rk-field-label">
                      Email (read-only)
                    </span>

                    <input
                      value={account?.user.email || ''}
                      disabled
                      className="rk-input mt-1.5 opacity-70"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <PrimaryButton
                    onClick={() => void handleProfileSave()}
                    disabled={savingProfile}
                  >
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </PrimaryButton>

                  {profileMessage && (
                    <span className="rk-metadata">
                      {profileMessage}
                    </span>
                  )}
                </div>
              </Panel>
            </div>

            <div id="settings-workspace" className="scroll-mt-24">
              <Panel
                eyebrow="Workspace"
                title="Business workspace"
                description="Your RENKOO business workspace."
                actions={
                  <Badge label="Read-only" tone="neutral" />
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <p className="rk-field-label">
                      Organization
                    </p>
                    <p className="mt-1 font-bold text-rk-ink">
                      {account?.organization.name || '—'}
                    </p>
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <p className="rk-field-label">
                      Workspace slug
                    </p>
                    <p className="rk-technical-value mt-1 !text-rk-ink">
                      {account?.organization.slug || '—'}
                    </p>
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <p className="rk-field-label">
                      Website
                    </p>
                    <p className="mt-1 font-bold text-rk-ink">
                      {account?.website?.name || 'No website connected'}
                    </p>

                    {account?.website?.url && (
                      <p className="rk-technical-value mt-0.5 !text-rk-muted">
                        {account.website.url}
                      </p>
                    )}
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <p className="rk-field-label">
                      Industry
                    </p>
                    <p className="mt-1 font-bold text-rk-ink">
                      {account?.website?.industry || 'Not specified'}
                    </p>
                  </div>
                </div>
              </Panel>
            </div>

            <div id="settings-security" className="scroll-mt-24">
              <Panel
                eyebrow="Security"
                title="Password & sessions"
                description="Change your account password."
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="rk-field-label">
                      Current password
                    </span>
                    <input
                      type="password"
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) =>
                        setCurrentPassword(e.target.value)
                      }
                      autoComplete="current-password"
                      className="rk-input mt-1.5"
                    />
                  </label>

                  <label className="block">
                    <span className="rk-field-label">
                      New password
                    </span>
                    <input
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) =>
                        setNewPassword(e.target.value)
                      }
                      autoComplete="new-password"
                      className="rk-input mt-1.5"
                    />
                  </label>

                  <label className="block">
                    <span className="rk-field-label">
                      Confirm new password
                    </span>
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(e.target.value)
                      }
                      autoComplete="new-password"
                      className="rk-input mt-1.5"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <PrimaryButton
                    onClick={() => void handlePasswordSave()}
                    disabled={savingPassword}
                  >
                    {savingPassword
                      ? 'Updating…'
                      : 'Update password'}
                  </PrimaryButton>

                  {passwordMessage && (
                    <span className="rk-metadata">
                      {passwordMessage}
                    </span>
                  )}
                </div>

                <div className="mt-5 border-t border-rk-border pt-4">
                  <p className="text-sm font-bold text-rk-ink">
                    Sign out of RENKOO on this device.
                  </p>

                  <SecondaryButton
                    onClick={() => {
                      logout();
                      router.push('/login');
                      router.refresh();
                    }}
                    className="mt-3"
                  >
                    Log out
                  </SecondaryButton>
                </div>
              </Panel>
            </div>

            <Panel
              eyebrow="Role focus"
              title="Your role"
              description="What best describes your role? RENKOO re-orders dashboards, navigation and suggestions around it."
            >
              <PersonaSelector />
            </Panel>

            <Panel
              eyebrow="Guide"
              title="Product tour"
              description="Replay the guided setup tour, or browse short highlights per area. Skipping never blocks the product."
            >
              <div className="flex flex-wrap gap-2">
                <SecondaryButton
                  type="button"
                  data-tour="restart-tour"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent(
                        TOUR_RESTART_EVENT,
                      ),
                    );
                    router.push('/first-value');
                  }}
                >
                  Restart guided tour
                </SecondaryButton>

                <SecondaryButton
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent(
                        TOUR_DISCOVERY_EVENT,
                      ),
                    )
                  }
                >
                  Explore RENKOO
                </SecondaryButton>
              </div>
            </Panel>

            <div id="settings-billing" className="scroll-mt-24">
              <Panel
                eyebrow="Billing"
                title="Subscription & usage"
                description="Manage your RENKOO subscription, plan and usage."
              >
                <PrimaryButton
                  onClick={() => router.push('/billing')}
                >
                  Open billing
                </PrimaryButton>
              </Panel>
            </div>

            <div id="settings-team" className="scroll-mt-24">
              <Panel
                eyebrow="Team"
                title="Members & permissions"
                description="Manage organization members and permissions."
                padded={false}
              >
                <div className="border-b border-rk-border bg-rk-soft/60 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="team@example.com"
                      aria-label="Team member email"
                      className="rk-input flex-1"
                    />

                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
                      aria-label="Invite role"
                      className="rk-input sm:w-auto"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>

                    <PrimaryButton
                      onClick={() => void handleInvite()}
                      disabled={teamLoading}
                    >
                      {teamLoading ? "Inviting…" : "Invite"}
                    </PrimaryButton>
                  </div>

                  {teamMessage && (
                    <p role="status" className="rk-metadata mt-2 !text-rk-ink">
                      {teamMessage}
                    </p>
                  )}

                  {teamLimit ? (
                    <div className="mt-3">
                      <LimitReachedState
                        title={limitTitle(
                          limitDetails(teamLimit)?.planCode,
                        )}
                        description={`This workspace already uses its included team seat.${limitUsageText(teamLimit) ? ` ${limitUsageText(teamLimit)}.` : ''}`}
                        actionLabel="View plans"
                        actionHref="/billing"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="px-2 py-2 sm:px-3">
                  {teamMembers.length === 0 ? (
                    <EmptyState
                      title="No team members found"
                      description="Invite your first team member above."
                    />
                  ) : (
                    <ul className="divide-y divide-rk-border">
                      {teamMembers.map((member) => (
                        <li key={member.id} className="flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-rk-ink">
                              {member.user.name || member.user.email}
                            </p>
                            <p className="rk-metadata mt-0.5 truncate">
                              {member.user.email}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {member.role === "OWNER" ? (
                              <Badge label="Owner" tone="neutral" />
                            ) : (
                              <>
                                <select
                                  value={member.role}
                                  onChange={async (e) => {
                                    await updateTeamMemberRole(
                                      member.id,
                                      e.target.value as "ADMIN" | "MEMBER"
                                    );
                                    setTeamMembers(await getTeamMembers());
                                  }}
                                  aria-label={`Role for ${member.user.email}`}
                                  className="rk-input w-auto"
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="ADMIN">Admin</option>
                                </select>

                                <DangerButton
                                  size="sm"
                                  onClick={async () => {
                                    await removeTeamMember(member.id);
                                    setTeamMembers(await getTeamMembers());
                                  }}
                                >
                                  Remove
                                </DangerButton>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>

          </div>
        )}
      </div>
    </AppShell>
  );
}
