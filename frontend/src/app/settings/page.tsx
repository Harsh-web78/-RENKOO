'use client';

import { getTeamMembers, inviteTeamMember, updateTeamMemberRole, removeTeamMember, TeamMember } from "../../lib/api";
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  getCurrentAccount,
  updateProfile,
  updatePassword,
  type CurrentAccount,
} from '@/lib/api';

export default function SettingsPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
const [open, setOpen] = useState(false);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        <header className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5 lg:px-8">
          <div>
            <div className="text-sm font-bold">RENKOO</div>
            <div className="text-xs text-slate-400">
              Account & Workspace
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1150px] p-5 lg:p-8">
          <h1 className="text-3xl font-bold">Settings</h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your RENKOO account, workspace and security.
          </p>

          {loading ? (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
              Loading account...
            </div>
          ) : (
            <div className="mt-8 space-y-6">

              {/* PROFILE */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">Profile</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Your personal RENKOO account information.
                    </p>
                  </div>

                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                    {account?.membership?.role || 'MEMBER'}
                  </span>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-semibold">
                      Full name
                    </label>

                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold">
                      Email
                    </label>

                    <input
                      value={account?.user.email || ''}
                      disabled
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-4">
                  <button
                    onClick={handleProfileSave}
                    disabled={savingProfile}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving...' : 'Save profile'}
                  </button>

                  {profileMessage && (
                    <span className="text-sm text-slate-500">
                      {profileMessage}
                    </span>
                  )}
                </div>
              </section>

              {/* WORKSPACE */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">Workspace</h2>

                <p className="mt-1 text-sm text-slate-500">
                  Your RENKOO business workspace.
                </p>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Organization
                    </div>
                    <div className="mt-2 text-base font-semibold">
                      {account?.organization.name || 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Workspace slug
                    </div>
                    <div className="mt-2 text-base font-semibold">
                      {account?.organization.slug || 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Website
                    </div>
                    <div className="mt-2 text-base font-semibold">
                      {account?.website?.name || 'No website connected'}
                    </div>

                    {account?.website?.url && (
                      <div className="mt-1 text-sm text-slate-500">
                        {account.website.url}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Industry
                    </div>
                    <div className="mt-2 text-base font-semibold">
                      {account?.website?.industry || 'Not specified'}
                    </div>
                  </div>
                </div>
              </section>

              {/* SECURITY */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">Security</h2>

                <p className="mt-1 text-sm text-slate-500">
                  Change your account password.
                </p>

                <div className="mt-6 grid gap-5 md:grid-cols-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) =>
                      setCurrentPassword(e.target.value)
                    }
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />

                  <input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) =>
                      setNewPassword(e.target.value)
                    }
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />

                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(e.target.value)
                    }
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="mt-5 flex items-center gap-4">
                  <button
                    onClick={handlePasswordSave}
                    disabled={savingPassword}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {savingPassword
                      ? 'Updating...'
                      : 'Update password'}
                  </button>

                  {passwordMessage && (
                    <span className="text-sm text-slate-500">
                      {passwordMessage}
                    </span>
                  )}
                </div>
              </section>

              {/* BILLING */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">Billing</h2>

                <p className="mt-1 text-sm text-slate-500">
                  Manage your RENKOO subscription, plan and usage.
                </p>

                <a
                  href="/billing"
                  className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
                >
                  Open billing
                </a>
              </section>

            </div>
          )}
        </section>
      
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Team</h2>
          <p className="text-sm text-slate-500">
            Manage organization members and permissions.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="team@example.com"
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-500"
          />

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>

          <button
            onClick={async () => {
              if (!inviteEmail.trim()) return;
              setTeamLoading(true);
              setTeamMessage("");
              try {
                await inviteTeamMember(inviteEmail, inviteRole);
                setInviteEmail("");
                setTeamMessage("Invitation created successfully.");
              } catch (error) {
                setTeamMessage(error instanceof Error ? error.message : "Failed to invite member.");
              } finally {
                setTeamLoading(false);
              }
            }}
            disabled={teamLoading}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {teamLoading ? "Inviting..." : "Invite"}
          </button>
        </div>

        {teamMessage && (
          <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {teamMessage}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">
                  {member.user.name || member.user.email}
                </div>
                <div className="text-sm text-slate-500">{member.user.email}</div>
              </div>

              <div className="flex items-center gap-2">
                {member.role === "OWNER" ? (
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                    Owner
                  </span>
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
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>

                    <button
                      onClick={async () => {
                        await removeTeamMember(member.id);
                        setTeamMembers(await getTeamMembers());
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {teamMembers.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              No team members found.
            </div>
          )}
        </div>
      </section></main>
    </div>
  );
}
