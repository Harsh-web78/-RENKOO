'use client';

/*
 * Persona selector: experience preference only.
 * Choosing a role changes ordering and emphasis
 * across RENKOO. It never changes what the user
 * is allowed to do — RBAC and entitlements stay
 * authoritative server-side.
 */

import { useState } from 'react';

import {
  PERSONA_IDS,
  PERSONA_META,
  usePersona,
  type PersonaId,
} from '@/lib/persona';

export default function PersonaSelector() {
  const {
    effectivePersona,
    persona,
    source,
    loading,
    setPersona,
  } = usePersona();

  const [draft, setDraft] = useState<
    PersonaId | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const shown = draft ?? persona;

  async function save() {
    if (!shown || saving) return;

    setSaving(true);
    setMessage('');

    try {
      await setPersona(shown);
      setDraft(null);
      setMessage(
        'Your role focus is updated.',
      );
    } catch {
      setMessage(
        'Unable to save your role right now.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Your role in RENKOO"
        className="grid gap-2 sm:grid-cols-2"
      >
        {PERSONA_IDS.map((id) => {
          const meta = PERSONA_META[id];
          const active =
            (shown ?? effectivePersona) ===
            id;

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={loading || saving}
              onClick={() => {
                setDraft(id);
                setMessage('');
              }}
              className={`rk-focusable rounded-rk-md border p-4 text-left shadow-rk-sm transition-all ${
                active
                  ? 'border-rk-ink bg-rk-ink text-white shadow-rk-md'
                  : 'border-rk-border bg-rk-surface hover:border-rk-strong hover:shadow-rk-md'
              }`}
            >
              <span className="block text-sm font-bold">
                {meta.label}
              </span>
              <span
                className={`mt-1 block text-xs leading-5 ${
                  active
                    ? 'text-white/70'
                    : 'text-rk-secondary'
                }`}
              >
                {meta.tagline}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={
            loading || saving || !shown
          }
          className="rk-focusable h-10 rounded-rk-md bg-rk-ink px-5 text-sm font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? 'Saving…' : 'Save role'}
        </button>

        {source === 'default' && (
          <span className="rk-metadata">
            Currently showing the suggested{' '}
            {
              PERSONA_META[effectivePersona]
                .label
            }{' '}
            view for your workspace role.
          </span>
        )}

        {message && (
          <span
            role="status"
            className="text-sm font-medium text-rk-secondary"
          >
            {message}
          </span>
        )}
      </div>

      <p className="rk-metadata mt-3">
        Your role only changes how RENKOO
        prioritizes information. Team
        permissions are managed separately
        below.
      </p>
    </div>
  );
}
