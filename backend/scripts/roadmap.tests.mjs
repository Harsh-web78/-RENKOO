/*
 * RENKOO Search Growth Roadmap 1.0 — composition tests.
 *
 * Deterministic priority/impact/effort labels, stable
 * identity dedup, dependency order, horizons,
 * do-this-first, execution-state respect, tenant-safe
 * statelessness and no-guarantee language. Pure
 * composition only — no DB, no provider calls.
 *
 * Run: npm run test:roadmap   (builds first)
 */
import assert from 'node:assert/strict';

const mod = await import(
  '../dist/keywords/keyword-roadmap.service.js'
);

const {
  kindForMapping,
  composeRoadmapPriority,
  classifyRoadmapImpact,
  classifyRoadmapEffort,
  targetLabelFor,
  roadmapItemId,
  ctaForRoadmapItem,
  dedupeRoadmapItems,
  orderRoadmapItems,
  attachRoadmapDependencies,
  assignRoadmapHorizons,
  selectDoThisFirst,
  composeRoadmap,
} = mod;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

const KW = 'crm software for startups';
const PAGE = 'https://site.com/crm-for-startups';

function cand(o = {}) {
  return {
    kind: 'IMPROVE_PAGE',
    keyword: KW,
    targetPage: PAGE,
    title: `Improve ${PAGE}`,
    why: 'Position #7 with observed demand.',
    evidence: [
      {
        source: 'Strategy',
        label: 'Priority HIGH',
        evidenceType: 'INFERRED',
      },
    ],
    strategyPriority: 'HIGH',
    position: 7,
    impressions: 4200,
    clicks: 120,
    ...o,
  };
}

function input(o = {}) {
  return {
    website: { id: 'w1', url: 'https://site.com' },
    scope: {},
    candidates: [cand()],
    existingActions: [],
    unavailable: [],
    generatedAt: '2026-09-09T00:00:00.000Z',
    ...o,
  };
}

/* 1. Website roadmap. */
await test('website roadmap', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand(),
        cand({
          kind: 'CREATE_PAGE',
          keyword: 'crm comparison',
          targetPage: null,
        }),
      ],
    }),
  );
  assert.ok(res.goal.length > 0);
  assert.equal(res.horizons.now.length + res.horizons.next7Days.length + res.horizons.next30Days.length, 2);
  assert.ok(res.doThisFirst.item);
  assert.equal(res.website.id, 'w1');
});

/* 2. Single keyword roadmap. */
await test('single keyword roadmap', async () => {
  const res = composeRoadmap(
    input({
      scope: { keyword: KW },
      candidates: [
        cand(),
        cand({ keyword: 'unrelated keyword' }),
      ],
    }),
  );
  assert.equal(res.scope.keyword, KW);
  assert.ok(res.priorities.every((p) => p.keyword === 'crm software for startups'));
  assert.ok(res.goal.includes(KW));
});

/* 3. Single page roadmap. */
await test('single page roadmap', async () => {
  const res = composeRoadmap(
    input({
      scope: { page: PAGE },
      candidates: [
        cand(),
        cand({ targetPage: 'https://site.com/other' }),
      ],
    }),
  );
  assert.ok(res.priorities.every((p) => p.targetPage === PAGE));
});

/* 4. Do-this-first selection. */
await test('do-this-first selection', async () => {
  const res = composeRoadmap(input());
  assert.ok(res.doThisFirst.item);
  assert.equal(res.doThisFirst.item.priority, 'HIGH');
  assert.ok(res.doThisFirst.reason.length > 0);
  assert.ok(res.doThisFirst.item.cta);
});

/* 5. High priority. */
await test('high priority', async () => {
  assert.equal(
    composeRoadmapPriority({ strategyPriority: 'HIGH' }),
    'HIGH',
  );
});

/* 6. Medium priority. */
await test('medium priority', async () => {
  assert.equal(
    composeRoadmapPriority({ strategyPriority: 'MEDIUM' }),
    'MEDIUM',
  );
});

/* 7. Low priority. */
await test('low priority', async () => {
  assert.equal(
    composeRoadmapPriority({ strategyPriority: 'LOW' }),
    'LOW',
  );
  assert.equal(composeRoadmapPriority({}), 'LOW');
});

/* 8. Strategy reuse. */
await test('strategy reuse', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({ strategyPriority: 'MEDIUM', impressions: 50 }),
      ],
    }),
  );
  assert.equal(res.priorities[0].priority, 'MEDIUM');
  assert.ok(
    res.priorities[0].evidence.some((e) => e.source === 'Strategy'),
  );
});

/* 9. Phase 4 diagnosis reuse. */
await test('diagnosis reuse lifts band', async () => {
  assert.equal(
    composeRoadmapPriority({
      strategyPriority: 'LOW',
      diagnosisType: 'CONTENT_COVERAGE_GAP',
    }),
    'MEDIUM',
  );
  const lifted = composeRoadmapPriority({
    strategyPriority: 'MEDIUM',
    diagnosisType: 'CONTENT_COVERAGE_GAP',
    impressions: 5000,
  });
  assert.equal(lifted, 'HIGH');
});

/* 10. Recommendation reuse. */
await test('recommendation reuse', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({
          recommendationId: 'rec_1',
          recommendationStatus: 'OPEN',
        }),
      ],
    }),
  );
  assert.equal(res.priorities[0].recommendation.id, 'rec_1');
  assert.equal(res.priorities[0].recommendation.status, 'OPEN');
});

/* 11. Action reuse. */
await test('action reuse attaches TODO', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({
          recommendationId: 'rec_1',
          recommendationStatus: 'OPEN',
        }),
      ],
      existingActions: [
        {
          id: 'act_1',
          status: 'TODO',
          recommendationId: 'rec_1',
        },
      ],
    }),
  );
  assert.equal(res.priorities[0].action.id, 'act_1');
  assert.equal(res.priorities[0].executionStatus, 'TODO');
});

/* 12. Content action kinds. */
await test('content action mapping', async () => {
  assert.equal(kindForMapping('IMPROVE', 'QUICK_WIN'), 'IMPROVE_PAGE');
  assert.equal(kindForMapping('OPTIMIZE', 'GROW'), 'OPTIMIZE_PAGE');
  assert.equal(kindForMapping('CREATE', 'CREATE'), 'CREATE_PAGE');
  assert.equal(kindForMapping('CONSOLIDATE', 'CONSOLIDATE'), 'CONSOLIDATE_PAGES');
  assert.equal(kindForMapping('PROTECT', 'PROTECT'), 'PROTECT_PAGE');
  assert.equal(kindForMapping('IGNORE', 'IGNORE'), 'TRACK_KEYWORD');
});

/* 13. Internal-link action identity. */
await test('internal-link action identity', async () => {
  const a = roadmapItemId({
    kind: 'BUILD_INTERNAL_SUPPORT',
    keyword: KW,
    targetPage: PAGE,
  });
  const b = roadmapItemId({
    kind: 'BUILD_INTERNAL_SUPPORT',
    keyword: '  CRM Software For Startups ',
    targetPage: `${PAGE}/`,
  });
  assert.equal(a, b);
  assert.ok(a.startsWith('link|'));
});

/* 14. Technical action + effort. */
await test('technical action effort', async () => {
  assert.equal(
    classifyRoadmapEffort({
      kind: 'FIX_TECHNICAL_BLOCKER',
      issueCode: 'NOINDEX_DETECTED',
    }),
    'LOW',
  );
  assert.equal(
    classifyRoadmapEffort({
      kind: 'FIX_TECHNICAL_BLOCKER',
      issueCode: 'CORE_WEB_VITALS_LCP',
    }),
    'UNKNOWN',
  );
});

/* 15. Consolidation ordering. */
await test('consolidation orders before page work', async () => {
  const ordered = orderRoadmapItems(
    [
      cand({ kind: 'IMPROVE_PAGE' }),
      cand({ kind: 'CONSOLIDATE_PAGES' }),
    ].map((c) => {
      const res = composeRoadmap(input({ candidates: [c] }));
      return res.priorities[0];
    }),
  );
  assert.equal(ordered[0].kind, 'CONSOLIDATE_PAGES');
});

/* 16. Duplicate action collapse. */
await test('duplicate action collapse', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({ strategyPriority: 'HIGH' }),
        {
          ...cand({ strategyPriority: 'MEDIUM' }),
          evidence: [
            {
              source: 'Why-Not-#1',
              label: 'Primary diagnosis: CONTENT_COVERAGE_GAP',
              evidenceType: 'INFERRED',
            },
          ],
          diagnosisType: 'CONTENT_COVERAGE_GAP',
        },
      ],
    }),
  );
  assert.equal(res.horizons.now.length + res.horizons.next7Days.length + res.horizons.next30Days.length, 1);
  const item = [
    ...res.horizons.now,
    ...res.horizons.next7Days,
    ...res.horizons.next30Days,
  ][0];
  assert.equal(item.evidence.length, 2);
  assert.equal(item.priority, 'HIGH');
});

/* 17. Existing action identity is stable. */
await test('existing action identity', async () => {
  const id1 = roadmapItemId({
    kind: 'IMPROVE_PAGE',
    keyword: KW,
    targetPage: PAGE,
  });
  const id2 = roadmapItemId({
    kind: 'IMPROVE_PAGE',
    keyword: KW,
    targetPage: PAGE,
  });
  assert.equal(id1, id2);
  assert.ok(id1.includes('IMPROVE_PAGE'));
});

/* 18. Dependency ordering. */
await test('dependency ordering', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({ kind: 'IMPROVE_PAGE' }),
        cand({ kind: 'BUILD_INTERNAL_SUPPORT' }),
        cand({ kind: 'FIX_TECHNICAL_BLOCKER', keyword: null }),
      ],
    }),
  );
  const all = [
    ...res.horizons.now,
    ...res.horizons.next7Days,
    ...res.horizons.next30Days,
    ...res.horizons.ongoing,
  ];
  const link = all.find((i) => i.kind === 'BUILD_INTERNAL_SUPPORT');
  const improve = all.find((i) => i.kind === 'IMPROVE_PAGE');
  const blocker = all.find((i) => i.kind === 'FIX_TECHNICAL_BLOCKER');
  assert.ok(link.dependsOn.includes(improve.id));
  assert.ok(improve.dependsOn.includes(blocker.id));
  assert.ok(res.dependencies.length >= 2);
  const ordered = orderRoadmapItems(all);
  assert.ok(
    ordered.findIndex((i) => i.id === blocker.id) <
      ordered.findIndex((i) => i.id === improve.id),
  );
});

/* 19. NOW horizon. */
await test('NOW horizon holds unblocked HIGH', async () => {
  const horizons = assignRoadmapHorizons(
    orderRoadmapItems(
      dedupeRoadmapItems([
        composeRoadmap(input()).priorities[0],
      ]),
    ),
  );
  assert.equal(horizons.now.length, 1);
  assert.equal(horizons.now[0].priority, 'HIGH');
});

/* 20. 7-day horizon. */
await test('7-day horizon holds MEDIUM', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({ strategyPriority: 'MEDIUM', impressions: 200 }),
      ],
    }),
  );
  assert.equal(res.horizons.next7Days.length, 1);
  assert.equal(res.horizons.now.length, 0);
});

/* 21. 30-day horizon. */
await test('30-day horizon holds LOW', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({
          strategyPriority: 'LOW',
          impressions: 0,
          clicks: 0,
          position: 0,
        }),
      ],
    }),
  );
  const all =
    res.horizons.now.length +
    res.horizons.next7Days.length +
    res.horizons.next30Days.length;
  assert.equal(all, 1);
  assert.equal(res.horizons.next30Days.length, 1);
});

/* 22. Ongoing monitoring. */
await test('ongoing monitoring', async () => {
  const res = composeRoadmap(
    input({
      candidates: [cand({ kind: 'MONITOR', keyword: null })],
    }),
  );
  assert.equal(res.horizons.ongoing.length, 1);
  assert.equal(res.horizons.now.length, 0);
});

/* 23. Impact classification. */
await test('impact classification', async () => {
  assert.equal(
    classifyRoadmapImpact({
      kind: 'IMPROVE_PAGE',
      priority: 'HIGH',
      impressions: 4200,
      position: 7,
    }),
    'HIGH',
  );
  assert.equal(
    classifyRoadmapImpact({
      kind: 'MONITOR',
      priority: 'LOW',
    }),
    'LOW',
  );
  assert.equal(
    classifyRoadmapImpact({
      kind: 'IMPROVE_PAGE',
      priority: 'MEDIUM',
      impressions: 100,
      existingImpact: 'HIGH',
    }),
    'HIGH',
  );
});

/* 24. Effort classification. */
await test('effort classification', async () => {
  assert.equal(classifyRoadmapEffort({ kind: 'REFRESH_PAGE' }), 'LOW');
  assert.equal(
    classifyRoadmapEffort({ kind: 'BUILD_INTERNAL_SUPPORT' }),
    'LOW',
  );
  assert.equal(classifyRoadmapEffort({ kind: 'IMPROVE_PAGE' }), 'MEDIUM');
  assert.equal(classifyRoadmapEffort({ kind: 'CREATE_PAGE' }), 'HIGH');
  assert.equal(
    classifyRoadmapEffort({ kind: 'CONSOLIDATE_PAGES' }),
    'HIGH',
  );
});

/* 25. Unknown effort. */
await test('unknown effort when unknowable', async () => {
  assert.equal(
    classifyRoadmapEffort({
      kind: 'FIX_TECHNICAL_BLOCKER',
      issueCode: 'MYSTERY_ENGINEERING_TASK',
    }),
    'UNKNOWN',
  );
});

/* 26. Insufficient evidence. */
await test('insufficient evidence state', async () => {
  const res = composeRoadmap(input({ candidates: [] }));
  assert.equal(res.doThisFirst.item, null);
  assert.ok(
    res.doThisFirst.reason.includes(
      'does not have enough evidence',
    ),
  );
  assert.equal(res.priorities.length, 0);
});

/* 27. Unavailable data preserved. */
await test('unavailable data preserved', async () => {
  const res = composeRoadmap(
    input({
      candidates: [],
      unavailable: [
        {
          key: 'strategy',
          reason: 'unavailable',
          unlocks: 'Run strategy.',
        },
      ],
    }),
  );
  assert.equal(res.unavailable.length, 1);
  assert.ok(res.doThisFirst.reason.includes('strategy'));
});

/* 28. No clear first action. */
await test('no clear first action with monitor-only', async () => {
  const res = composeRoadmap(
    input({
      candidates: [cand({ kind: 'MONITOR', keyword: null })],
    }),
  );
  assert.equal(res.doThisFirst.item, null);
  assert.ok(res.horizons.ongoing.length === 1);
});

/* 29. Completed action leaves queue. */
await test('completed action counted not queued', async () => {
  const res = composeRoadmap(
    input({
      existingActions: [
        {
          id: 'act_done',
          status: 'DONE',
          type: 'IMPROVE_PAGE',
          url: PAGE,
          title: KW,
          metadata: { strategyKeyword: KW, targetPage: PAGE },
        },
      ],
    }),
  );
  const queued =
    res.horizons.now.length +
    res.horizons.next7Days.length +
    res.horizons.next30Days.length;
  assert.equal(queued, 0);
  assert.equal(res.progress.completed, 1);
  assert.equal(res.progress.searchResult, 'Still measuring');
});

/* 30. Dismissed action never resurrected. */
await test('dismissed action stays out', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand({
          recommendationId: 'rec_x',
          recommendationStatus: 'DISMISSED',
        }),
      ],
      existingActions: [
        { id: 'act_x', status: 'DISMISSED', recommendationId: 'rec_x' },
      ],
    }),
  );
  const queued =
    res.horizons.now.length +
    res.horizons.next7Days.length +
    res.horizons.next30Days.length;
  assert.equal(queued, 0);
});

/* 31. Partial data still composes. */
await test('partial data composes', async () => {
  const res = composeRoadmap(
    input({
      candidates: [cand({ impressions: 0, clicks: 0, position: 0 })],
      unavailable: [
        { key: 'diagnosis', reason: 'down', unlocks: 'Retry.' },
      ],
    }),
  );
  assert.ok(res.doThisFirst.item);
  assert.equal(res.unavailable.length, 1);
  assert.ok(
    ['VERIFIED', 'OBSERVED', 'INFERRED', 'UNAVAILABLE'].includes(
      res.doThisFirst.item.evidenceState,
    ),
  );
});

/* 32. Stateless across tenants. */
await test('no cross-tenant leakage', async () => {
  const a = composeRoadmap(
    input({
      existingActions: [
        { id: 'act_a', status: 'TODO', recommendationId: 'rec_1' },
      ],
      candidates: [
        cand({ recommendationId: 'rec_1', recommendationStatus: 'OPEN' }),
      ],
    }),
  );
  const b = composeRoadmap(
    input({
      existingActions: [],
      candidates: [
        cand({ recommendationId: 'rec_1', recommendationStatus: 'OPEN' }),
      ],
    }),
  );
  assert.equal(a.priorities[0].executionStatus, 'TODO');
  assert.equal(b.priorities[0].executionStatus, 'NOT_STARTED');
  assert.equal(b.priorities[0].action, null);
});

/* 33. Malformed data degrades. */
await test('malformed data degrades', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        {
          kind: 'BOGUS_KIND',
          keyword: null,
          targetPage: 'not a url {{{',
          title: '???',
          why: '',
          evidence: [],
        },
      ],
    }),
  );
  assert.ok(res);
  const all = [
    ...res.horizons.now,
    ...res.horizons.next7Days,
    ...res.horizons.next30Days,
    ...res.horizons.ongoing,
  ];
  assert.equal(all.length, 1);
  assert.equal(all[0].evidenceState, 'UNAVAILABLE');
});

/* 34. Ranking target semantics. */
await test('ranking target semantics', async () => {
  assert.equal(targetLabelFor(7), 'Top 3');
  assert.equal(targetLabelFor(2), 'Hold Top 3');
  const res = composeRoadmap(input());
  assert.equal(res.priorities[0].ranking.target, 'Top 3');
  assert.equal(res.priorities[0].ranking.current, 7);
  const dump = JSON.stringify(res);
  assert.ok(!dump.includes('Expected: #'));
});

/* 35. No guaranteed ranking claims. */
await test('no guaranteed ranking claims', async () => {
  const res = composeRoadmap(
    input({
      candidates: [
        cand(),
        cand({ kind: 'CREATE_PAGE', keyword: 'new topic' }),
        cand({ kind: 'FIX_TECHNICAL_BLOCKER', keyword: null }),
      ],
    }),
  );
  const dump = JSON.stringify(res).toLowerCase();
  assert.ok(!dump.includes('guarantee'));
  assert.ok(!dump.includes('will rank #1'));
  assert.ok(!dump.includes('rank #1'));
  assert.ok(!dump.includes('probability'));
  const cta = ctaForRoadmapItem('IMPROVE_PAGE', 'CONTENT_COVERAGE_GAP');
  assert.ok(cta && cta.href.length > 0);
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);
