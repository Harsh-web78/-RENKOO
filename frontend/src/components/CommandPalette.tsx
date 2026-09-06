'use client';

/*
 * RENKOO V2 — CommandPalette foundation.
 * Cmd+K / Ctrl+K fuzzy jump list over REAL routes only
 * (the same grouped destinations AppShell renders).
 * Persona re-orders results via the existing orderNav helper;
 * nothing is hidden and RBAC stays authoritative server-side.
 * No backend search yet — this is the navigation foundation
 * future global search builds on.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { orderNav, usePersona } from '@/lib/persona';

export interface PaletteItem {
  name: string;
  href: string;
  group: string;
}

export default function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { effectivePersona } = usePersona();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo(
    () => orderNav(items, effectivePersona),
    [items, effectivePersona],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q),
    );
  }, [ranked, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open ]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-rk-scrim"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page"
        className="relative mx-auto w-full max-w-lg overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-rk-md"
      >
        <div className="flex items-center gap-2 border-b border-rk-border px-4">
          <Search
            size={16}
            aria-hidden
            className="shrink-0 text-rk-muted"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((a) =>
                  Math.min(a + 1, results.length - 1),
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const item = results[active];
                if (item) go(item.href);
              }
            }}
            placeholder="Type a page name or section…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded
            aria-controls="rk-palette-list"
            aria-activedescendant={
              results[active]
                ? `rk-palette-${active}`
                : undefined
            }
            className="h-12 w-full bg-transparent text-sm text-rk-ink outline-none placeholder:text-rk-muted"
          />
          <kbd
            aria-hidden
            className="shrink-0 rounded border border-rk-border bg-rk-soft px-1.5 py-0.5 text-[10px] font-bold text-rk-muted"
          >
            ESC
          </kbd>
        </div>

        <p
          role="status"
          className="rk-metadata border-b border-rk-border px-4 py-1.5"
        >
          {results.length === 0
            ? 'No matching pages'
            : `${results.length} page${results.length === 1 ? '' : 's'} · ordered for your role`}
        </p>

        <ul
          id="rk-palette-list"
          role="listbox"
          aria-label="Pages"
          className="max-h-72 overflow-y-auto p-2"
        >
          {results.map((item, index) => (
            <li key={`${item.group}-${item.href}`}>
              <button
                type="button"
                id={`rk-palette-${index}`}
                role="option"
                aria-selected={index === active}
                onClick={() => go(item.href)}
                onMouseEnter={() => setActive(index)}
                className={`rk-focusable flex w-full items-center gap-3 rounded-rk-md px-3 py-2 text-left text-sm ${
                  index === active
                    ? 'bg-rk-soft text-rk-ink'
                    : 'text-rk-secondary'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {item.name}
                </span>
                <span className="rk-metadata shrink-0">
                  {item.group}
                </span>
              </button>
            </li>
          ))}

          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-rk-muted">
              No pages match “{query.trim()}”.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
