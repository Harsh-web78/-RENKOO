"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  createWebsite,
  getWebsites,
  isLimitError,
  limitUsageText,
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

export default function WebsiteSelector() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState<unknown>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getWebsites();
        if (cancelled) return;

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
        if (!cancelled) {
          setError(err?.message || "Unable to load websites.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAddOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectedWebsite =
    websites.find((site) => site.id === selectedId) || websites[0] || null;

  const filteredWebsites = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return websites;

    return websites.filter((site) => {
      return (
        site.name.toLowerCase().includes(value) ||
        site.url.toLowerCase().includes(value)
      );
    });
  }, [websites, search]);

  function selectWebsite(id: string) {
    setSelectedId(id);
    setOpen(false);
    setSearch("");

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
      window.location.reload();
    }
  }

  async function handleAddWebsite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const url = String(form.get("url") || "").trim();

    if (!url) {
      setError("Enter a website URL.");
      return;
    }

    let normalizedUrl = url;

    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError("Enter a valid website URL.");
      return;
    }

    try {
      setAdding(true);
      setError("");
      setLimitError(null);

      const created = await createWebsite({
        name: name || domainLabel(normalizedUrl),
        url: normalizedUrl,
      });

      if (!created?.id) {
        throw new Error("Website was not created. Please try again.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, created.id);
      }

      setWebsites((current) => [...current, created]);
      setSelectedId(created.id);
      setAddOpen(false);
      setOpen(false);
      setSearch("");

      window.location.reload();
    } catch (err: any) {
      if (isLimitError(err)) {
        setLimitError(err);
        return;
      }

      setError(err?.message || "Unable to add website.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setError("");
          setLimitError(null);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="rk-focusable flex min-w-0 max-w-[300px] items-center gap-2 rounded-rk-md border border-rk-border bg-rk-surface px-2.5 py-2 text-left hover:bg-rk-soft"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-rk-border bg-rk-soft">
          {selectedWebsite ? (
            <img
              src={faviconUrl(selectedWebsite.url)}
              alt=""
              width={16}
              height={16}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <Globe2 size={15} className="text-rk-muted" aria-hidden />
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-rk-ink">
            {loading
              ? "Loading websites..."
              : selectedWebsite
                ? selectedWebsite.name
                : "Add your website"}
          </span>

          {selectedWebsite ? (
            <span className="block truncate text-[10px] text-rk-secondary">
              {domainLabel(selectedWebsite.url)}
            </span>
          ) : null}
        </span>

        <ChevronDown
          size={14}
          className="ml-auto shrink-0 text-rk-muted"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Websites"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[330px] overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-xl"
        >
          <div className="border-b border-rk-border p-2.5">
            {websites.length > 5 ? (
              <label className="flex h-9 items-center gap-2 rounded-rk-md border border-rk-border bg-rk-soft px-2.5">
                <Search size={14} className="text-rk-muted" aria-hidden />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search websites..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-rk-muted"
                  autoFocus
                />
              </label>
            ) : null}
          </div>

          <div className="max-h-[310px] overflow-y-auto p-1.5">
            {filteredWebsites.length > 0 ? (
              filteredWebsites.map((site) => {
                const selected = site.id === selectedId;

                return (
                  <button
                    key={site.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectWebsite(site.id)}
                    className={`flex w-full items-center gap-2.5 rounded-rk-md px-2.5 py-2.5 text-left ${
                      selected
                        ? "bg-rk-soft"
                        : "hover:bg-rk-soft"
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-rk-border bg-rk-surface">
                      <img
                        src={faviconUrl(site.url)}
                        alt=""
                        width={16}
                        height={16}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-rk-ink">
                        {site.name}
                      </span>
                      <span className="block truncate text-xs text-rk-secondary">
                        {domainLabel(site.url)}
                      </span>
                    </span>

                    {selected ? (
                      <Check
                        size={16}
                        className="shrink-0 text-rk-ink"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-5 text-center text-sm text-rk-muted">
                No websites found.
              </p>
            )}
          </div>

          <div className="border-t border-rk-border p-2.5">
            <div className="mb-2 px-2 text-[11px] font-semibold text-rk-muted">
              {websites.length} website{websites.length === 1 ? "" : "s"} connected
            </div>

            <button
              type="button"
              onClick={() => {
                setAddOpen(true);
                setError("");
                setLimitError(null);
              }}
              className="rk-focusable flex w-full items-center gap-2 rounded-rk-md px-2.5 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md border border-rk-border">
                <Plus size={15} aria-hidden />
              </span>
              Add website
            </button>

            <Link
              href="/websites"
              onClick={() => setOpen(false)}
              className="rk-focusable mt-0.5 flex w-full items-center rounded-rk-md px-2.5 py-2 text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
            >
              Manage websites
            </Link>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-website-title"
            className="w-full max-w-md rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rk-muted">
                  Website
                </p>
                <h2
                  id="add-website-title"
                  className="mt-1 text-xl font-semibold text-rk-ink"
                >
                  Add a website
                </h2>
                <p className="mt-1 text-sm text-rk-secondary">
                  Connect another site to this workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                className="rk-focusable grid h-8 w-8 place-items-center rounded-rk-md text-rk-muted hover:bg-rk-soft hover:text-rk-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {limitError ? (
              <div className="mt-5 rounded-rk-md border border-rk-border bg-rk-soft p-4">
                <p className="text-sm font-semibold text-rk-ink">
                  You&apos;ve reached your plan&apos;s website limit
                </p>

                <p className="mt-1 text-sm text-rk-secondary">
                  {limitUsageText(limitError) ||
                    "Your current plan does not have another website slot available."}
                </p>

                <div className="mt-4 flex gap-2">
                  <Link
                    href="/billing"
                    onClick={() => setAddOpen(false)}
                    className="rk-focusable inline-flex items-center justify-center rounded-rk-md bg-rk-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Upgrade plan
                  </Link>

                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="rk-focusable rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddWebsite} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-rk-ink">
                    Website URL
                  </span>
                  <input
                    name="url"
                    type="url"
                    placeholder="https://yourcompany.com"
                    required
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
                    className="rk-focusable rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm font-semibold text-rk-ink hover:bg-rk-soft"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={adding}
                    className="rk-focusable inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {adding ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <Plus size={15} aria-hidden />
                    )}
                    {adding ? "Adding..." : "Add website"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
