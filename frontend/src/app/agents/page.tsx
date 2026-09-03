'use client';

import Sidebar from '@/components/Sidebar';
import { useState } from 'react';

export default function AgentsPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar mobileOpen={open} onClose={() => setOpen(false)} />
      <main className="lg:pl-[270px]">
        <section className="mx-auto max-w-[1150px] p-5 lg:p-8">
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="mt-2 text-sm text-slate-500">
            AI-powered growth workflows and execution agents.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
            <h2 className="text-lg font-bold">Agent Center</h2>
            <p className="mt-2 text-sm text-slate-500">
              AI agent workflows will be enabled here as individual agents
              become production-ready.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
