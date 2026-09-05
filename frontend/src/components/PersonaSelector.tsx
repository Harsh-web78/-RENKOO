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
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
            >
              <span className="block text-sm font-bold">
                {meta.label}
              </span>
              <span
                className={`mt-1 block text-xs ${
                  active
                    ? 'text-slate-300'
                    : 'text-slate-500'
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
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save role'}
        </button>

        {source === 'default' && (
          <span className="text-xs text-slate-500">
            Currently showing the suggested{' '}
            {
              PERSONA_META[effectivePersona]
                .label
            }{' '}
            view for your workspace role.
          </span>
        )}

        {message && (
          <span className="text-sm text-slate-600">
            {message}
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Your role only changes how RENKOO
        prioritizes information. Team
        permissions are managed separately
        below.
      </p>
    </div>
  );
}
