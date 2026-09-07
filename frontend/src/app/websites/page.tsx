"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import AppShell from "@/components/AppShell";
import {
  clearStoredWebsiteId,
  setStoredWebsiteId,
} from "@/components/WebsiteSelector";
import {
  createWebsite,
  deleteWebsite,
  getWebsites,
  isLimitError,
  limitUsageText,
  updateWebsite,
  type Website,
} from "@/lib/api";

const STORAGE_KEY = "renkoo_website_id";

function domainLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      new URL(url).hostname,
    )}&sz=32`;
  } catch {
    return "";
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Enter a website URL.");
  }

  const url = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch {
    throw new Error("Enter a valid website URL.");
  }
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState<unknown>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editWebsite, setEditWebsite] = useState<Website | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Website | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");

  const loadWebsites = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await getWebsites();
      const list = Array.isArray(result) ? result : [];

      setWebsites(list);

      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;

      const valid =
        stored && list.some((site) => site.id === stored)
          ? stored
          : list.find((site) => site.isActive)?.id ||
            list[0]?.id ||
            "";

      setSelectedId(valid);

      if (valid && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, valid);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load websites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWebsites();
  }, [loadWebsites]);

  const selectedWebsite =
    websites.find((site) => site.id === selectedId) || null;

  const websiteCount = websites.length;

  const activeCount = useMemo(
    () => websites.filter((site) => site.isActive).length,
    [websites],
  );

  function selectWebsite(id: string) {
    setSelectedId(id);

    if (typeof window !== "undefined") {
      setStoredWebsiteId(id);
    }

    setMenuOpen(null);
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const name = String(form.get("name") || "").trim();
    const rawUrl = String(form.get("url") || "");

    try {
      setSaving(true);
      setError("");
      setLimitError(null);

      const url = normalizeUrl(rawUrl);

      const created = await createWebsite({
        name: name || domainLabel(url),
        url,
      });

      if (!created?.id) {
        throw new Error("Website was not created. Please try again.");
      }

      if (typeof window !== "undefined") {
        setStoredWebsiteId(created.id);
      }

      setWebsites((current) => [...current, created]);
      setSelectedId(created.id);
      setAddOpen(false);
    } catch (err: any) {
      if (isLimitError(err)) {
        setLimitError(err);
      } else {
        setError(err?.message || "Unable to add website.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editWebsite) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const rawUrl = String(form.get("url") || "");

    try {
      setSaving(true);
      setError("");

      const url = normalizeUrl(rawUrl);

      const updated = await updateWebsite(editWebsite.id, {
        name: name || domainLabel(url),
        url,
      });

      setWebsites((current) =>
        current.map((site) =>
          site.id === editWebsite.id ? updated : site,
        ),
      );

      setEditWebsite(null);
    } catch (err: any) {
      setError(err?.message || "Unable to update website.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setSaving(true);
      setError("");

      await deleteWebsite(deleteTarget.id);

      const remaining = websites.filter(
        (site) => site.id !== deleteTarget.id,
      );

      setWebsites(remaining);
      setDeleteTarget(null);
      setMenuOpen(null);

      const nextId =
        remaining.find((site) => site.isActive)?.id ||
        remaining[0]?.id ||
        "";

      setSelectedId(nextId);

      if (typeof window !== "undefined") {
        if (nextId) {
          setStoredWebsiteId(nextId);
        } else {
          clearStoredWebsiteId();
        }
      }
    } catch (err: any) {
      setError(err?.message || "Unable to delete website.");
    } finally {
      setSaving(false);
    }
  }

  function setDefault(id: string) {
    selectWebsite(id);
  }

  return (
    <AppShell
      mobileOpen={false}
      onClose={() => undefined}
    >
      <div className="rk-page space-y-6">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="rk-label">Workspace</p>

            <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[30px]">
              Websites
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
              Manage the websites connected to this workspace
              and choose which one RENKOO should analyze.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError("");
              setLimitError(null);
              setAddOpen(true);
            }}
            className="rk-focusable inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-4 text-[13px] font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md"
          >
            <Plus size={16} aria-hidden />
            Add website
          </button>
        </section>

        {error ? (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3"
          >
            <p className="text-sm text-rk-secondary">{error}</p>

            <button
              type="button"
              onClick={() => setError("")}
              className="text-xs font-semibold text-rk-ink"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <p className="rk-label">Websites</p>
            <p className="rk-number mt-2 text-[26px] font-extrabold leading-none">
              {websiteCount}
            </p>
            <p className="rk-metadata mt-1.5">
              Connected to this workspace
            </p>
          </div>

          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <p className="rk-label">Active</p>
            <p className="rk-number mt-2 text-[26px] font-extrabold leading-none">
              {activeCount}
            </p>
            <p className="rk-metadata mt-1.5">
              Ready for analysis
            </p>
          </div>

          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <p className="rk-label">Selected website</p>
            <p className="mt-2 truncate text-[15px] font-extrabold tracking-tight text-rk-ink">
              {selectedWebsite
                ? domainLabel(selectedWebsite.url)
                : "None"}
            </p>
            <p className="rk-metadata mt-1.5 truncate">
              {selectedWebsite ? selectedWebsite.name : "—"}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface">
          <div className="flex items-center justify-between border-b border-rk-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-rk-ink">
                Connected websites
              </h2>
              <p className="mt-0.5 text-xs text-rk-muted">
                Select a website to make it the active RENKOO workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadWebsites()}
              disabled={loading}
              aria-label="Refresh websites"
              className="rk-focusable grid h-8 w-8 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
                aria-hidden
              />
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-rk-secondary">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Loading websites...
              </div>
            </div>
          ) : websites.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-rk-border bg-rk-soft">
                <Globe2 size={20} className="text-rk-secondary" aria-hidden />
              </div>

              <h3 className="mt-4 text-base font-bold text-rk-ink">
                No website connected
              </h3>

              <p className="mt-1 max-w-sm text-sm text-rk-secondary">
                Add your first website to start crawling and discovering growth
                opportunities.
              </p>

              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rk-focusable mt-4 inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Plus size={15} aria-hidden />
                Add website
              </button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-rk-border bg-rk-soft">
                      <th className="px-5 py-3 text-xs font-semibold text-rk-muted">
                        Website
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold text-rk-muted">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold text-rk-muted">
                        Google
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold text-rk-muted">
                        Added
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-rk-muted">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-rk-border">
                    {websites.map((site) => {
                      const selected = site.id === selectedId;

                      return (
                        <tr
                          key={site.id}
                          className={
                            selected
                              ? "bg-rk-soft/60"
                              : "hover:bg-rk-soft/40"
                          }
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => selectWebsite(site.id)}
                              className="rk-focusable flex min-w-0 items-center gap-3 text-left"
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-rk-border bg-rk-surface">
                                <img
                                  src={faviconUrl(site.url)}
                                  alt=""
                                  width={18}
                                  height={18}
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              </span>

                              <span className="min-w-0">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-rk-ink">
                                    {site.name}
                                  </span>

                                  {selected ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rk-ink px-2 py-0.5 text-[10px] font-bold text-white">
                                      <Check size={10} aria-hidden />
                                      Active
                                    </span>
                                  ) : null}
                                </span>

                                <span className="mt-0.5 block truncate text-xs text-rk-secondary">
                                  {domainLabel(site.url)}
                                </span>
                              </span>
                            </button>
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold text-rk-secondary">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  site.isActive
                                    ? "bg-emerald-500"
                                    : "bg-slate-400"
                                }`}
                              />
                              {site.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs text-rk-secondary">
                            Managed in Integrations
                          </td>

                          <td className="px-4 py-4 text-xs text-rk-secondary">
                            {formatDate(site.createdAt)}
                          </td>

                          <td className="relative px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setMenuOpen((current) =>
                                  current === site.id ? null : site.id,
                                )
                              }
                              aria-label={`Actions for ${site.name}`}
                              aria-expanded={menuOpen === site.id}
                              className="rk-focusable grid h-8 w-8 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                            >
                              <MoreHorizontal size={17} aria-hidden />
                            </button>

                            {menuOpen === site.id ? (
                              <div className="absolute right-5 top-12 z-30 w-48 overflow-hidden rounded-rk-md border border-rk-border bg-rk-surface py-1.5 text-left shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDefault(site.id);
                                    setMenuOpen(null);
                                  }}
                                  className="rk-focusable flex w-full items-center gap-2 px-3 py-2 text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                                >
                                  <Check size={15} aria-hidden />
                                  Set as default
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditWebsite(site);
                                    setMenuOpen(null);
                                    setError("");
                                  }}
                                  className="rk-focusable flex w-full items-center gap-2 px-3 py-2 text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                                >
                                  <Pencil size={15} aria-hidden />
                                  Edit website
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteTarget(site);
                                    setMenuOpen(null);
                                    setError("");
                                  }}
                                  className="rk-focusable flex w-full items-center gap-2 px-3 py-2 text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                                >
                                  <Trash2 size={15} aria-hidden />
                                  Delete website
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-rk-border md:hidden">
                {websites.map((site) => {
                  const selected = site.id === selectedId;

                  return (
                    <div key={site.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-rk-border bg-rk-soft">
                          <img
                            src={faviconUrl(site.url)}
                            alt=""
                            width={18}
                            height={18}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-rk-ink">
                            {site.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-rk-secondary">
                            {domainLabel(site.url)}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rk-secondary">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  site.isActive
                                    ? "bg-emerald-500"
                                    : "bg-slate-400"
                                }`}
                              />
                              {site.isActive ? "Active" : "Inactive"}
                            </span>

                            {selected ? (
                              <span className="rounded-full bg-rk-ink px-2 py-0.5 text-[10px] font-bold text-white">
                                Current
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setMenuOpen((current) =>
                              current === site.id ? null : site.id,
                            )
                          }
                          aria-label={`Actions for ${site.name}`}
                          className="rk-focusable grid h-8 w-8 shrink-0 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                        >
                          <MoreHorizontal size={17} aria-hidden />
                        </button>
                      </div>

                      <div className="mt-4 flex gap-2">
                        {!selected ? (
                          <button
                            type="button"
                            onClick={() => selectWebsite(site.id)}
                            className="rk-focusable rounded-rk-md bg-rk-ink px-3 py-2 text-xs font-semibold text-white"
                          >
                            Use this website
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setEditWebsite(site)}
                          className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-xs font-semibold text-rk-ink hover:bg-rk-soft"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(site)}
                          className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-xs font-semibold text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <p className="text-xs text-rk-muted">
          Google connections and property selection remain under Integrations.
          Website management only changes the website record and active
          workspace selection.
        </p>
      </div>

      {addOpen ? (
        <div className="rk-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-website-title"
            className="rk-dialog w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="rk-label">Website</p>
                <h2
                  id="add-website-title"
                  className="mt-1 text-xl font-bold text-rk-ink"
                >
                  Add website
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                className="rk-focusable text-xl text-rk-muted hover:text-rk-ink"
              >
                ×
              </button>
            </div>

            {limitError ? (
              <div className="mt-5 rounded-rk-md border border-rk-border bg-rk-soft p-4">
                <p className="text-sm font-bold text-rk-ink">
                  You&apos;ve reached your plan&apos;s website limit
                </p>

                <p className="mt-1 text-sm text-rk-secondary">
                  {limitUsageText(limitError) ||
                    "Your current plan does not have another website slot available."}
                </p>

                <div className="mt-4 flex gap-2">
                  <a
                    href="/billing"
                    className="rk-focusable rounded-rk-md bg-rk-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Upgrade plan
                  </a>

                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-surface"
                  >
                    Manage websites
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-rk-ink">
                    Website URL
                  </span>

                  <input
                    name="url"
                    type="url"
                    required
                    placeholder="https://yourcompany.com"
                    className="h-10 w-full rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink outline-none focus:border-rk-strong"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-rk-ink">
                    Website name
                    <span className="ml-1 font-normal text-rk-muted">
                      optional
                    </span>
                  </span>

                  <input
                    name="name"
                    type="text"
                    placeholder="Your Company"
                    className="h-10 w-full rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink outline-none focus:border-rk-strong"
                  />
                </label>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-rk-md border border-rk-border bg-rk-soft px-3 py-2 text-sm text-rk-secondary"
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rk-focusable inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <Plus size={15} aria-hidden />
                    )}
                    {saving ? "Adding..." : "Add website"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {editWebsite ? (
        <div className="rk-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-website-title"
            className="rk-dialog w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="rk-label">Website</p>
                <h2
                  id="edit-website-title"
                  className="mt-1 text-xl font-bold text-rk-ink"
                >
                  Edit website
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setEditWebsite(null)}
                aria-label="Close"
                className="rk-focusable text-xl text-rk-muted hover:text-rk-ink"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEdit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-rk-ink">
                  Website URL
                </span>

                <input
                  name="url"
                  type="url"
                  required
                  defaultValue={editWebsite.url}
                  className="h-10 w-full rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink outline-none focus:border-rk-strong"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-rk-ink">
                  Website name
                </span>

                <input
                  name="name"
                  type="text"
                  defaultValue={editWebsite.name}
                  className="h-10 w-full rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink outline-none focus:border-rk-strong"
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-rk-md border border-rk-border bg-rk-soft px-3 py-2 text-sm text-rk-secondary"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditWebsite(null)}
                  className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rk-focusable inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                  ) : (
                    <Pencil size={15} aria-hidden />
                  )}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="rk-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-website-title"
            className="rk-dialog w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-6"
          >
            <p className="rk-label">Permanent action</p>

            <h2
              id="delete-website-title"
              className="mt-1 text-xl font-bold text-rk-ink"
            >
              Delete {deleteTarget.name}?
            </h2>

            <p className="mt-2 text-sm leading-6 text-rk-secondary">
              This removes the website from this workspace. Existing crawl
              history and connected website data may no longer be available
              through this website record.
            </p>

            <div className="mt-5 rounded-rk-md border border-rk-border bg-rk-soft px-3 py-2">
              <p className="text-xs font-semibold text-rk-muted">
                Website
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-rk-ink">
                {domainLabel(deleteTarget.url)}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rk-focusable rounded-rk-md border border-rk-border px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="rk-focusable inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 size={15} aria-hidden />
                )}
                {saving ? "Deleting..." : "Delete website"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
