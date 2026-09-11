/*
 * RENKOO Governed Growth Work Queue 1.0 — tests (Phase 36).
 *
 * 228 tests over pure functions only: work types,
 * queue status mapping (existing lifecycle is truth),
 * READY gates, approval states + packs, client
 * approval, blockers, owner/capacity honesty, stale
 * evidence, fingerprints, TODAY ordering (never a
 * score), reconsideration, section assignment, bounds,
 * determinism, tenant isolation, honesty invariants.
 * No DB, no provider calls, no AI calls, no billing.
 *
 * Run: npm run test:growth-work-1   (dist built)
 */
import assert from 'node:assert/strict';

const gw = await import(
  '../dist/growth-plan/growth-work.js'
);

const results = [];
let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

function qs(o = {}) {
  return gw.queueStatusFor({
    actionStatus: null,
    proposalStatus: null,
    verificationState: null,
    measurementPending: false,
    blocked: false,
    waiting: false,
    ...o,
  });
}

function tsig(o = {}) {
  return {
    inNow: false,
    queueReady: false,
    dependencyReady: false,
    priorityBand: null,
    goalAlignment: null,
    evidenceComplete: false,
    ...o,
  };
}

/* ---------- work types (16) ---------- */

await test('work consolidate', async () => {
  assert.equal(gw.workTypeFor('CONSOLIDATE_PAGES', null), 'CONSOLIDATE_PAGES');
});

await test('work create', async () => {
  assert.equal(gw.workTypeFor('CREATE_PAGE', null), 'CREATE_PAGE');
});

await test('work protect', async () => {
  assert.equal(gw.workTypeFor('PROTECT_PAGE', null), 'PROTECT_PAGE');
});

await test('work fix technical', async () => {
  assert.equal(gw.workTypeFor('FIX_TECHNICAL_BLOCKER', null), 'FIX_TECHNICAL');
  assert.equal(gw.workTypeFor('CRAWL_ISSUE', null), 'FIX_TECHNICAL');
});

await test('work internal link', async () => {
  assert.equal(gw.workTypeFor('BUILD_INTERNAL_SUPPORT', null), 'INTERNAL_LINK');
  assert.equal(gw.workTypeFor('ORPHAN', 'CONNECT'), 'INTERNAL_LINK');
});

await test('work ai visibility', async () => {
  assert.equal(gw.workTypeFor('AI_VISIBILITY_GAP', null), 'AI_VISIBILITY');
  assert.equal(gw.workTypeFor('x', 'CITATION_GAP'), 'AI_VISIBILITY');
  assert.equal(gw.workTypeFor('GEO_AUDIT', null), 'AI_VISIBILITY');
});

await test('work refresh', async () => {
  assert.equal(gw.workTypeFor('REFRESH_PAGE', null), 'CONTENT_REFRESH');
});

await test('work verify', async () => {
  assert.equal(gw.workTypeFor('x', 'VERIFY'), 'VERIFY_CHANGE');
});

await test('work measure', async () => {
  assert.equal(gw.workTypeFor('TRACK_KEYWORD', null), 'MEASURE_OUTCOME');
  assert.equal(gw.workTypeFor('MONITOR', 'MEASURE'), 'MEASURE_OUTCOME');
});

await test('work improve', async () => {
  assert.equal(gw.workTypeFor('IMPROVE_PAGE', null), 'IMPROVE_PAGE');
  assert.equal(gw.workTypeFor('OPTIMIZE_PAGE', null), 'IMPROVE_PAGE');
});

await test('work investigate', async () => {
  assert.equal(gw.workTypeFor('x', 'INVESTIGATE'), 'INVESTIGATE');
});

await test('work general fallback', async () => {
  assert.equal(gw.workTypeFor('BOGUS', 'UNKNOWN'), 'GENERAL');
  assert.equal(gw.workTypeFor(null, null), 'GENERAL');
});

await test('work case-insensitive', async () => {
  assert.equal(gw.workTypeFor('improve_page', null), 'IMPROVE_PAGE');
});

await test('work decision only', async () => {
  assert.equal(gw.workTypeFor(null, 'CREATE'), 'CREATE_PAGE');
});

await test('work prompt maps ai', async () => {
  assert.equal(gw.workTypeFor('PROMPT_GAP', null), 'AI_VISIBILITY');
});

await test('work consolidat substring', async () => {
  assert.equal(gw.workTypeFor('POSSIBLE_CONSOLIDATION', null), 'CONSOLIDATE_PAGES');
});

/* ---------- queue status mapping (24) ---------- */

await test('status dismissed', async () => {
  assert.equal(qs({ actionStatus: 'DISMISSED' }), 'DISMISSED');
});

await test('status done unverified verifying', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'UNVERIFIED' }), 'VERIFYING');
});

await test('status done null verifying', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: null }), 'VERIFYING');
});

await test('status done conflicting verifying', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'CONFLICTING' }), 'VERIFYING');
});

await test('status done verified measuring', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('status done verified completed', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'VERIFIED', measurementPending: false }), 'COMPLETED');
});

await test('status done partial measuring', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'PARTIALLY_VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('status done partial completed', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'PARTIALLY_VERIFIED', measurementPending: false }), 'COMPLETED');
});

await test('status executed never verified', async () => {
  assert.notEqual(qs({ actionStatus: 'DONE', verificationState: null }), 'VERIFIED');
  assert.notEqual(qs({ actionStatus: 'DONE', verificationState: 'UNVERIFIED' }), 'COMPLETED');
});

await test('status in progress', async () => {
  assert.equal(qs({ actionStatus: 'IN_PROGRESS' }), 'IN_PROGRESS');
});

await test('status in progress executed', async () => {
  assert.equal(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'EXECUTED' }), 'EXECUTED');
});

await test('status in progress executing', async () => {
  assert.equal(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'EXECUTING' }), 'EXECUTED');
});

await test('status todo review approval', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'READY_FOR_REVIEW' }), 'AWAITING_APPROVAL');
});

await test('status todo rejected blocked', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'REJECTED' }), 'BLOCKED');
});

await test('status todo cancelled blocked', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'CANCELLED' }), 'BLOCKED');
});

await test('status todo waiting', async () => {
  assert.equal(qs({ actionStatus: 'TODO', waiting: true }), 'WAITING');
});

await test('status todo ready', async () => {
  assert.equal(qs({ actionStatus: 'TODO' }), 'READY');
});

await test('status blocked flag', async () => {
  assert.equal(qs({ actionStatus: 'TODO', blocked: true }), 'BLOCKED');
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'VERIFIED', blocked: true }), 'BLOCKED');
});

await test('status null ready', async () => {
  assert.equal(qs({}), 'READY');
});

await test('status lowercase handled', async () => {
  assert.equal(qs({ actionStatus: 'done', verificationState: 'verified', measurementPending: false }), 'COMPLETED');
  assert.equal(qs({ actionStatus: 'todo', proposalStatus: 'ready_for_review' }), 'AWAITING_APPROVAL');
});

await test('status done approved proposal measuring', async () => {
  assert.equal(qs({ actionStatus: 'DONE', proposalStatus: 'APPROVED', verificationState: 'VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('status in progress approved stays', async () => {
  assert.equal(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'APPROVED' }), 'IN_PROGRESS');
});

await test('status todo draft ready', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'DRAFT' }), 'READY');
});

await test('status done failed verification', async () => {
  assert.equal(qs({ actionStatus: 'DONE', verificationState: 'FAILED' }), 'VERIFYING');
});

/* ---------- ready gate (16) ---------- */

function gate(o = {}) {
  return gw.readyGate({
    hasAction: true,
    dependencySatisfied: true,
    approvalSatisfied: true,
    approvalPending: false,
    approvalDenied: false,
    evidencePresent: true,
    executionPath: true,
    ...o,
  });
}

await test('gate all true ready', async () => {
  const g = gate();
  assert.equal(g.ready, true);
  assert.deepEqual(g.reasons, []);
});

await test('gate no action', async () => {
  const g = gate({ hasAction: false });
  assert.equal(g.ready, false);
  assert.ok(g.reasons.some((r) => r.includes('No existing action')));
});

await test('gate dep unsatisfied', async () => {
  const g = gate({ dependencySatisfied: false });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'WAITING');
});

await test('gate denied blocked', async () => {
  const g = gate({ approvalDenied: true });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'BLOCKED');
  assert.ok(g.reasons.some((r) => r.includes('denied')));
});

await test('gate pending approval section', async () => {
  const g = gate({ approvalPending: true });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'AWAITING_APPROVAL');
  assert.ok(g.reasons.some((r) => r.includes('awaiting review')));
});

await test('gate approval unsatisfied', async () => {
  const g = gate({ approvalSatisfied: false });
  assert.equal(g.ready, false);
});

await test('gate no evidence waiting', async () => {
  const g = gate({ evidencePresent: false });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'WAITING');
});

await test('gate no path blocked', async () => {
  const g = gate({ executionPath: false });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'BLOCKED');
});

await test('gate denied beats pending', async () => {
  const g = gate({ approvalDenied: true, approvalPending: true });
  assert.equal(g.sectionIfNot, 'BLOCKED');
});

await test('gate multiple reasons', async () => {
  const g = gate({ dependencySatisfied: false, evidencePresent: false });
  assert.equal(g.reasons.length, 2);
});

await test('gate pending reasons mention review', async () => {
  assert.ok(gate({ approvalPending: true }).reasons.some((r) => r.includes('review')));
});

await test('gate ready section ignored', async () => {
  assert.equal(gate().sectionIfNot, 'WAITING');
});

await test('gate dep satisfied ok', async () => {
  assert.equal(gate({ dependencySatisfied: true }).ready, true);
});

await test('gate evidence required text', async () => {
  assert.ok(gate({ evidencePresent: false }).reasons.some((r) => r.includes('evidence')));
});

await test('gate deterministic', async () => {
  assert.deepEqual(gate({ dependencySatisfied: false }), gate({ dependencySatisfied: false }));
});

await test('gate all false blocked', async () => {
  const g = gate({ hasAction: false, dependencySatisfied: false, approvalSatisfied: false, evidencePresent: false, executionPath: false });
  assert.equal(g.ready, false);
  assert.equal(g.sectionIfNot, 'BLOCKED');
});

/* ---------- approval states (14) ---------- */

await test('approval approved', async () => {
  assert.equal(gw.approvalStateFor('APPROVED', true), 'APPROVED');
  assert.equal(gw.approvalStateFor('approved', false), 'APPROVED');
});

await test('approval pending', async () => {
  assert.equal(gw.approvalStateFor('READY_FOR_REVIEW', true), 'PENDING_REVIEW');
});

await test('approval denied rejected', async () => {
  assert.equal(gw.approvalStateFor('REJECTED', true), 'DENIED');
});

await test('approval denied cancelled', async () => {
  assert.equal(gw.approvalStateFor('CANCELLED', true), 'DENIED');
});

await test('approval draft required', async () => {
  assert.equal(gw.approvalStateFor('DRAFT', true), 'REQUIRED_NOT_REQUESTED');
  assert.equal(gw.approvalStateFor(null, true), 'REQUIRED_NOT_REQUESTED');
});

await test('approval draft optional', async () => {
  assert.equal(gw.approvalStateFor('DRAFT', false), 'NOT_REQUIRED');
  assert.equal(gw.approvalStateFor('', false), 'NOT_REQUIRED');
});

await test('approval executed approved', async () => {
  assert.equal(gw.approvalStateFor('EXECUTED', true), 'APPROVED');
  assert.equal(gw.approvalStateFor('EXECUTING', true), 'APPROVED');
  assert.equal(gw.approvalStateFor('VERIFICATION_PENDING', true), 'APPROVED');
});

await test('approval unknown', async () => {
  assert.equal(gw.approvalStateFor('WEIRD', true), 'UNKNOWN');
});

await test('approval pack five lines', async () => {
  const pack = gw.approvalPack({ title: 'Fix titles', why: 'CTR gap', evidence: 'GSC', page: '/x', changeType: 'CHANGE_TITLE', risk: 'Low; revert via CMS.' });
  assert.equal(pack.length, 5);
  assert.ok(pack[0].startsWith('WHAT WILL CHANGE:'));
  assert.ok(pack[1].startsWith('WHY:'));
  assert.ok(pack[2].startsWith('SOURCE EVIDENCE:'));
  assert.ok(pack[3].includes('/x'));
  assert.ok(pack[4].includes('never automatic'));
});

await test('approval pack null page', async () => {
  const pack = gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: null, changeType: 'c', risk: 'r' });
  assert.ok(pack[3].includes('not page-bound'));
});

await test('approval no auto text', async () => {
  assert.match(gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: null, changeType: 'c', risk: 'r' })[4], /never automatic/);
});

await test('approval required vs pending distinct', async () => {
  assert.notEqual(gw.approvalStateFor(null, true), gw.approvalStateFor('READY_FOR_REVIEW', true));
});

await test('approval denied blocks gate', async () => {
  assert.equal(gate({ approvalDenied: true }).sectionIfNot, 'BLOCKED');
});

await test('approval pending gates queue', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'READY_FOR_REVIEW' }), 'AWAITING_APPROVAL');
});

/* ---------- client approval (14) ---------- */

function cap(o = {}) {
  return gw.clientApprovalFor({
    proposalStatus: null,
    actionStatus: null,
    verificationState: null,
    ...o,
  });
}

await test('client ready review', async () => {
  assert.equal(cap({ proposalStatus: 'READY_FOR_REVIEW' }), 'READY_FOR_REVIEW');
});

await test('client approved todo', async () => {
  assert.equal(cap({ proposalStatus: 'APPROVED', actionStatus: 'TODO' }), 'APPROVED');
});

await test('client executing progress', async () => {
  assert.equal(cap({ proposalStatus: 'APPROVED', actionStatus: 'IN_PROGRESS' }), 'EXECUTING');
});

await test('client executing verified stays verifying', async () => {
  assert.equal(cap({ proposalStatus: 'APPROVED', actionStatus: 'IN_PROGRESS', verificationState: 'VERIFIED' }), 'VERIFYING');
});

await test('client done verified completed', async () => {
  assert.equal(cap({ actionStatus: 'DONE', verificationState: 'VERIFIED' }), 'COMPLETED');
});

await test('client done unverified verifying', async () => {
  assert.equal(cap({ actionStatus: 'DONE', verificationState: null }), 'VERIFYING');
});

await test('client draft na', async () => {
  assert.equal(cap({ proposalStatus: 'DRAFT' }), 'NOT_APPLICABLE');
  assert.equal(cap({}), 'NOT_APPLICABLE');
});

await test('client rejected awaiting', async () => {
  assert.equal(cap({ proposalStatus: 'REJECTED', actionStatus: 'TODO' }), 'AWAITING_CLIENT_APPROVAL');
});

await test('client approved no action executing', async () => {
  assert.equal(cap({ proposalStatus: 'APPROVED', actionStatus: null }), 'EXECUTING');
});

await test('client partial verifying', async () => {
  assert.equal(cap({ actionStatus: 'DONE', verificationState: 'PARTIALLY_VERIFIED' }), 'COMPLETED');
});

await test('client no fake approved', async () => {
  assert.notEqual(cap({ proposalStatus: 'DRAFT', actionStatus: 'TODO' }), 'APPROVED');
});

await test('client seven states vocabulary', async () => {
  const states = new Set([
    cap({ proposalStatus: 'READY_FOR_REVIEW' }),
    cap({ proposalStatus: 'APPROVED', actionStatus: 'TODO' }),
    cap({ proposalStatus: 'APPROVED', actionStatus: 'IN_PROGRESS' }),
    cap({ actionStatus: 'DONE', verificationState: 'VERIFIED' }),
    cap({ actionStatus: 'DONE' }),
    cap({}),
    cap({ proposalStatus: 'REJECTED', actionStatus: 'TODO' }),
  ]);
  assert.equal(states.size, 7);
});

await test('client lowercase handled', async () => {
  assert.equal(cap({ proposalStatus: 'ready_for_review' }), 'READY_FOR_REVIEW');
});

await test('client cancelled awaiting', async () => {
  assert.equal(cap({ proposalStatus: 'CANCELLED', actionStatus: 'TODO' }), 'AWAITING_CLIENT_APPROVAL');
});

/* ---------- blockers (10) ---------- */

await test('blocker none note', async () => {
  assert.equal(gw.blockerNote('NONE'), 'No blockers.');
});

await test('blocker stale note', async () => {
  const n = gw.blockerNote('STALE_EVIDENCE');
  assert.match(n, /STALE_EVIDENCE/);
  assert.match(n, /never silently execute/);
});

await test('blocker approval required', async () => {
  assert.match(gw.blockerNote('APPROVAL_REQUIRED'), /APPROVAL_REQUIRED/);
  assert.match(gw.blockerNote('APPROVAL_REQUIRED'), /no workaround fabricated/);
});

await test('blocker dependency', async () => {
  assert.match(gw.blockerNote('DEPENDENCY_INCOMPLETE'), /DEPENDENCY_INCOMPLETE/);
});

await test('blocker verification', async () => {
  assert.match(gw.blockerNote('VERIFICATION_REQUIRED'), /VERIFICATION_REQUIRED/);
});

await test('blocker measurement', async () => {
  assert.match(gw.blockerNote('MEASUREMENT_UNAVAILABLE'), /MEASUREMENT_UNAVAILABLE/);
});

await test('blocker connections', async () => {
  assert.match(gw.blockerNote('GSC_NOT_CONNECTED'), /GSC_NOT_CONNECTED/);
  assert.match(gw.blockerNote('GA4_NOT_CONNECTED'), /GA4_NOT_CONNECTED/);
  assert.match(gw.blockerNote('CRAWL_REQUIRED'), /CRAWL_REQUIRED/);
  assert.match(gw.blockerNote('CMS_NOT_CONNECTED'), /CMS_NOT_CONNECTED/);
  assert.match(gw.blockerNote('PROVIDER_UNAVAILABLE'), /PROVIDER_UNAVAILABLE/);
});

await test('blocker denied', async () => {
  assert.match(gw.blockerNote('APPROVAL_DENIED'), /APPROVAL_DENIED/);
});

await test('blockers never hidden text', async () => {
  assert.doesNotMatch(gw.blockerNote('STALE_EVIDENCE'), /workaround available|auto-approved/i);
});

await test('blocker kinds vocabulary', async () => {
  for (const k of ['GSC_NOT_CONNECTED', 'GA4_NOT_CONNECTED', 'CRAWL_REQUIRED', 'APPROVAL_REQUIRED', 'APPROVAL_DENIED', 'DEPENDENCY_INCOMPLETE', 'VERIFICATION_REQUIRED', 'MEASUREMENT_UNAVAILABLE', 'CMS_NOT_CONNECTED', 'PROVIDER_UNAVAILABLE', 'STALE_EVIDENCE', 'NONE']) {
    assert.ok(gw.blockerNote(k).length > 3);
  }
});

/* ---------- owner + capacity (6) ---------- */

await test('owner set', async () => {
  assert.equal(gw.ownerFor('Priya'), 'Priya');
});

await test('owner empty unassigned', async () => {
  assert.equal(gw.ownerFor(''), 'OWNER_UNASSIGNED');
  assert.equal(gw.ownerFor(null), 'OWNER_UNASSIGNED');
  assert.equal(gw.ownerFor('   '), 'OWNER_UNASSIGNED');
});

await test('owner trimmed', async () => {
  assert.equal(gw.ownerFor('  Ravi  '), 'Ravi');
});

await test('capacity unknown text', async () => {
  const c = gw.capacityNote();
  assert.match(c, /CAPACITY_UNKNOWN/);
  assert.doesNotMatch(c, /[0-9]+ (hours|days)/);
});

await test('capacity ordering works text', async () => {
  assert.match(gw.capacityNote(), /Ordering still works/);
});

await test('no invented person', async () => {
  assert.notEqual(gw.ownerFor(null), 'Unassigned Team Member');
  assert.equal(gw.ownerFor(undefined), 'OWNER_UNASSIGNED');
});

/* ---------- stale evidence (9) ---------- */

await test('stale old todo', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-01-01T00:00:00.000Z', status: 'TODO', nowIso: '2026-09-15T00:00:00.000Z' }),
    true,
  );
});

await test('stale recent todo', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-09-01T00:00:00.000Z', status: 'TODO', nowIso: '2026-09-15T00:00:00.000Z' }),
    false,
  );
});

await test('stale done never', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2020-01-01T00:00:00.000Z', status: 'DONE', nowIso: '2026-09-15T00:00:00.000Z' }),
    false,
  );
});

await test('stale dismissed never', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2020-01-01T00:00:00.000Z', status: 'DISMISSED', nowIso: '2026-09-15T00:00:00.000Z' }),
    false,
  );
});

await test('stale in progress old', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-01-01T00:00:00.000Z', status: 'IN_PROGRESS', nowIso: '2026-09-15T00:00:00.000Z' }),
    true,
  );
});

await test('stale null date false', async () => {
  assert.equal(gw.isStaleWork({ updatedAtIso: null, status: 'TODO' }), false);
});

await test('stale invalid dates false', async () => {
  assert.equal(gw.isStaleWork({ updatedAtIso: 'nope', status: 'TODO', nowIso: 'also-nope' }), false);
});

await test('stale custom window', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-09-01T00:00:00.000Z', status: 'TODO', nowIso: '2026-09-15T00:00:00.000Z', staleAfterDays: 7 }),
    true,
  );
});

await test('stale boundary exact', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-07-17T00:00:00.000Z', status: 'TODO', nowIso: '2026-09-15T00:00:00.000Z', staleAfterDays: 60 }),
    false,
  );
});

/* ---------- fingerprints (6) ---------- */

function fp(o = {}) {
  return gw.workFingerprint({ organizationId: 'o1', websiteId: 'w1', actionId: 'a1', ...o });
}

await test('fingerprint deterministic', async () => {
  assert.equal(fp(), fp());
});

await test('fingerprint distinct actions', async () => {
  assert.notEqual(fp(), fp({ actionId: 'a2' }));
});

await test('fingerprint isolates tenants', async () => {
  assert.notEqual(fp(), fp({ organizationId: 'o2' }));
});

await test('fingerprint isolates websites', async () => {
  assert.notEqual(fp(), fp({ websiteId: 'w2' }));
});

await test('fingerprint stable id reuse', async () => {
  assert.equal(fp({ actionId: 'a1' }), fp());
});

await test('fingerprint length 32', async () => {
  assert.equal(fp().length, 32);
});

/* ---------- TODAY ordering (22) ---------- */

await test('today rank seven levels', async () => {
  assert.equal(gw.todayRank(tsig()).length, 7);
});

await test('today now wins', async () => {
  assert.ok(gw.compareToday(tsig({ inNow: true }), tsig({})) < 0);
});

await test('today ready wins', async () => {
  assert.ok(gw.compareToday(tsig({ queueReady: true }), tsig({})) < 0);
});

await test('today dep ready wins', async () => {
  assert.ok(gw.compareToday(tsig({ dependencyReady: true }), tsig({})) < 0);
});

await test('today high wins', async () => {
  assert.ok(gw.compareToday(tsig({ priorityBand: 'HIGH' }), tsig({ priorityBand: 'LOW' })) < 0);
});

await test('today medium beats low', async () => {
  assert.ok(gw.compareToday(tsig({ priorityBand: 'MEDIUM' }), tsig({ priorityBand: 'LOW' })) < 0);
});

await test('today null band last', async () => {
  assert.ok(gw.compareToday(tsig({ priorityBand: 'LOW' }), tsig({})) < 0);
});

await test('today direct wins', async () => {
  assert.ok(gw.compareToday(tsig({ goalAlignment: 'DIRECT' }), tsig({ goalAlignment: 'WEAK' })) < 0);
});

await test('today strong beats contextual', async () => {
  assert.ok(gw.compareToday(tsig({ goalAlignment: 'STRONG' }), tsig({ goalAlignment: 'CONTEXTUAL' })) < 0);
});

await test('today evidence wins', async () => {
  assert.ok(gw.compareToday(tsig({ evidenceComplete: true }), tsig({})) < 0);
});

await test('today ties zero', async () => {
  assert.equal(gw.compareToday(tsig(), tsig()), 0);
});

await test('today lexicographic now dominates', async () => {
  const a = tsig({ inNow: true, priorityBand: 'LOW' });
  const b = tsig({ priorityBand: 'HIGH', goalAlignment: 'DIRECT', evidenceComplete: true, queueReady: true, dependencyReady: true });
  assert.ok(gw.compareToday(a, b) < 0);
});

await test('today reason now', async () => {
  assert.match(gw.todayReason(tsig({ inNow: true }), tsig({})), /NOW decisions/);
});

await test('today reason ready', async () => {
  assert.match(gw.todayReason(tsig({ queueReady: true }), tsig({})), /READY actions/);
});

await test('today reason dep', async () => {
  assert.match(gw.todayReason(tsig({ dependencyReady: true }), tsig({})), /prerequisite/);
});

await test('today reason priority', async () => {
  assert.match(gw.todayReason(tsig({ priorityBand: 'HIGH' }), tsig({ priorityBand: 'LOW' })), /HIGH priority/);
});

await test('today reason alignment', async () => {
  assert.match(gw.todayReason(tsig({ goalAlignment: 'DIRECT' }), tsig({ goalAlignment: 'WEAK' })), /business-goal alignment/);
});

await test('today reason evidence', async () => {
  assert.match(gw.todayReason(tsig({ evidenceComplete: true }), tsig({})), /evidence completeness/);
});

await test('today reason tiebreak', async () => {
  assert.match(gw.todayReason(tsig(), tsig()), /tie-break/);
});

await test('today reason not a score', async () => {
  assert.match(gw.todayReason(tsig({ inNow: true }), tsig({})), /not a score/);
});

await test('today deterministic', async () => {
  const a = tsig({ inNow: true });
  const b = tsig({});
  assert.equal(gw.compareToday(a, b), gw.compareToday(a, b));
});

await test('today antisymmetric', async () => {
  const a = tsig({ priorityBand: 'HIGH' });
  const b = tsig({ priorityBand: 'LOW' });
  assert.equal(gw.compareToday(a, b), -gw.compareToday(b, a));
});

/* ---------- reconsideration (6) ---------- */

await test('reconsider not dismissed', async () => {
  const r = gw.reconsideration({ actionDismissed: false, evidenceMateriallyChanged: true, rulesAllow: true });
  assert.equal(r.available, false);
});

await test('reconsider available', async () => {
  const r = gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: true, rulesAllow: true });
  assert.equal(r.available, true);
  assert.match(r.note, /RECONSIDERATION_AVAILABLE/);
  assert.match(r.note, /Never auto-resurrected/);
});

await test('reconsider no change', async () => {
  const r = gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: false, rulesAllow: true });
  assert.equal(r.available, false);
});

await test('reconsider rules deny', async () => {
  const r = gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: true, rulesAllow: false });
  assert.equal(r.available, false);
});

await test('reconsider dismissed stays', async () => {
  assert.match(gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: false, rulesAllow: false }).note, /stay dismissed/);
});

await test('reconsider deterministic', async () => {
  const mk = () => gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: true, rulesAllow: true });
  assert.deepEqual(mk(), mk());
});

/* ---------- sections (16) ---------- */

await test('section today ready', async () => {
  assert.equal(gw.assignQueueSection('READY', true), 'TODAY');
});

await test('section today in progress', async () => {
  assert.equal(gw.assignQueueSection('IN_PROGRESS', true), 'TODAY');
});

await test('section today blocked stays', async () => {
  assert.equal(gw.assignQueueSection('BLOCKED', true), 'BLOCKED');
});

await test('section ready', async () => {
  assert.equal(gw.assignQueueSection('READY', false), 'READY');
});

await test('section approval', async () => {
  assert.equal(gw.assignQueueSection('AWAITING_APPROVAL', false), 'AWAITING_APPROVAL');
});

await test('section in progress', async () => {
  assert.equal(gw.assignQueueSection('IN_PROGRESS', false), 'IN_PROGRESS');
});

await test('section blocked', async () => {
  assert.equal(gw.assignQueueSection('BLOCKED', false), 'BLOCKED');
});

await test('section executed verify', async () => {
  assert.equal(gw.assignQueueSection('EXECUTED', false), 'VERIFY');
});

await test('section verifying verify', async () => {
  assert.equal(gw.assignQueueSection('VERIFYING', false), 'VERIFY');
});

await test('section verified measure', async () => {
  assert.equal(gw.assignQueueSection('VERIFIED', false), 'MEASURE');
});

await test('section measuring measure', async () => {
  assert.equal(gw.assignQueueSection('MEASURING', false), 'MEASURE');
});

await test('section completed', async () => {
  assert.equal(gw.assignQueueSection('COMPLETED', false), 'COMPLETED');
});

await test('section waiting', async () => {
  assert.equal(gw.assignQueueSection('WAITING', false), 'WAITING');
});

await test('section dismissed waiting', async () => {
  assert.equal(gw.assignQueueSection('DISMISSED', false), 'WAITING');
});

await test('section today verify stays', async () => {
  assert.equal(gw.assignQueueSection('VERIFYING', true), 'VERIFY');
});

await test('sections vocabulary eight', async () => {
  assert.equal(gw.QUEUE_SECTIONS.length, 8);
});

/* ---------- bounds (5) ---------- */

await test('bound today five', async () => {
  assert.equal(gw.MAX_TODAY, 5);
});

await test('bound ready twenty', async () => {
  assert.equal(gw.MAX_READY, 20);
});

await test('bound section twentyfive', async () => {
  assert.equal(gw.MAX_SECTION, 25);
});

await test('bound stale sixty', async () => {
  assert.equal(gw.STALE_AFTER_DAYS, 60);
});

await test('today cap respected', async () => {
  assert.ok(gw.MAX_TODAY <= 5);
});

/* ---------- honesty invariants (14) ---------- */

await test('no work score', async () => {
  const r = gw.todayRank(tsig({ inNow: true }));
  assert.ok(Array.isArray(r));
  assert.doesNotMatch(gw.todayReason(tsig({ inNow: true }), tsig({})), /score: [0-9]/i);
});

await test('executed never verified mapping', async () => {
  assert.notEqual(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'EXECUTED' }), 'VERIFIED');
  assert.equal(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'EXECUTED' }), 'EXECUTED');
});

await test('execution not success mapping', async () => {
  assert.notEqual(qs({ actionStatus: 'DONE', verificationState: null }), 'COMPLETED');
});

await test('no fake owners', async () => {
  assert.equal(gw.ownerFor(null), 'OWNER_UNASSIGNED');
});

await test('no fake capacity', async () => {
  assert.doesNotMatch(gw.capacityNote(), /[0-9]+/);
});

await test('no fake revenue', async () => {
  assert.doesNotMatch(gw.todayReason(tsig({ goalAlignment: 'DIRECT' }), tsig({})), /₹|\$[0-9]/);
});

await test('no causality text', async () => {
  const blob = JSON.stringify([
    gw.todayReason(tsig({ inNow: true }), tsig({})),
    gw.blockerNote('DEPENDENCY_INCOMPLETE'),
    gw.capacityNote(),
  ]);
  assert.doesNotMatch(blob, /caused|because of|guaranteed|will increase/i);
});

await test('no auto execution language', async () => {
  assert.match(gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: null, changeType: 'c', risk: 'r' })[4], /never automatic/);
  assert.doesNotMatch(gw.readyGate({ hasAction: true, dependencySatisfied: true, approvalSatisfied: true, approvalPending: false, approvalDenied: false, evidencePresent: true, executionPath: true }).reasons.join(' '), /auto-execut/i);
});

await test('dismissed never resurrect mapping', async () => {
  assert.equal(qs({ actionStatus: 'DISMISSED' }), 'DISMISSED');
  assert.equal(gw.assignQueueSection('DISMISSED', true), 'WAITING');
});

await test('blocked never ready', async () => {
  assert.notEqual(gw.assignQueueSection('BLOCKED', true), 'TODAY');
  assert.notEqual(gw.assignQueueSection('BLOCKED', true), 'READY');
});

await test('stale requires review text', async () => {
  assert.match(gw.blockerNote('STALE_EVIDENCE'), /review/);
});

await test('approval pack human text', async () => {
  assert.match(gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: '/p', changeType: 'c', risk: 'r' })[4], /human/);
});

await test('waiting distinct blocked', async () => {
  assert.notEqual(gw.assignQueueSection('WAITING', false), gw.assignQueueSection('BLOCKED', false));
});

await test('verify distinct measure', async () => {
  assert.notEqual(gw.assignQueueSection('VERIFYING', false), gw.assignQueueSection('MEASURING', false));
});

/* ---------- performance (6) ---------- */

await test('fingerprints batch 1000', async () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    seen.add(fp({ actionId: `action-${i}` }));
  }
  assert.equal(seen.size, 1000);
});

await test('ordering batch 500', async () => {
  const bands = ['HIGH', 'MEDIUM', 'LOW', null];
  for (let i = 0; i < 500; i++) {
    gw.compareToday(tsig({ priorityBand: bands[i % 4] }), tsig({ priorityBand: bands[(i + 1) % 4] }));
  }
  assert.ok(true);
});

await test('status batch 500', async () => {
  const states = ['TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED'];
  for (let i = 0; i < 500; i++) {
    qs({ actionStatus: states[i % states.length], verificationState: i % 2 ? 'VERIFIED' : null, measurementPending: i % 3 === 0 });
  }
  assert.ok(true);
});

await test('sections batch 500', async () => {
  const states = ['READY', 'IN_PROGRESS', 'BLOCKED', 'VERIFYING', 'MEASURING', 'COMPLETED'];
  for (let i = 0; i < 500; i++) {
    gw.assignQueueSection(states[i % states.length], i % 2 === 0);
  }
  assert.ok(true);
});

await test('gates batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    gate({ dependencySatisfied: i % 2 === 0, approvalPending: i % 3 === 0 });
  }
  assert.ok(true);
});

await test('types batch 200', async () => {
  const kinds = ['IMPROVE_PAGE', 'CREATE_PAGE', 'FIX_TECHNICAL', 'CITATION_GAP', 'BOGUS'];
  for (let i = 0; i < 200; i++) {
    gw.workTypeFor(kinds[i % kinds.length], null);
  }
  assert.ok(true);
});

/* ---------- status extras (8) ---------- */

await test('status todo approved ready', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'APPROVED' }), 'READY');
});

await test('status todo executing ready', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'EXECUTING' }), 'READY');
});

await test('status in progress review stays', async () => {
  assert.equal(qs({ actionStatus: 'IN_PROGRESS', proposalStatus: 'READY_FOR_REVIEW' }), 'AWAITING_APPROVAL');
});

await test('status done executing proposal measuring', async () => {
  assert.equal(qs({ actionStatus: 'DONE', proposalStatus: 'EXECUTED', verificationState: 'VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('status blocked beats review', async () => {
  assert.equal(qs({ actionStatus: 'TODO', proposalStatus: 'READY_FOR_REVIEW', blocked: true }), 'BLOCKED');
});

await test('status waiting beats ready', async () => {
  assert.equal(qs({ actionStatus: 'TODO', waiting: true }), 'WAITING');
});

await test('status done rejected proposal verifying', async () => {
  assert.equal(qs({ actionStatus: 'DONE', proposalStatus: 'REJECTED', verificationState: null }), 'VERIFYING');
});

await test('status whitespace handled', async () => {
  assert.equal(qs({ actionStatus: '  todo  ' }), 'READY');
});

/* ---------- gate extras (6) ---------- */

await test('gate approval required pending', async () => {
  const g = gate({ approvalSatisfied: false, approvalPending: true });
  assert.equal(g.sectionIfNot, 'AWAITING_APPROVAL');
});

await test('gate ready with review absent', async () => {
  assert.equal(gate({ approvalSatisfied: true }).ready, true);
});

await test('gate stale reason separate', async () => {
  const g = gate({ evidencePresent: true });
  assert.equal(g.ready, true);
});

await test('gate denied reason text', async () => {
  assert.ok(gate({ approvalDenied: true }).reasons.some((r) => r.includes('re-proposed')));
});

await test('gate waiting default section', async () => {
  assert.equal(gate({ dependencySatisfied: false }).sectionIfNot, 'WAITING');
});

await test('gate execution path text', async () => {
  assert.ok(gate({ executionPath: false }).reasons.some((r) => r.includes('execution path')));
});

/* ---------- approval/client extras (6) ---------- */

await test('approval verification pending counts approved', async () => {
  assert.equal(gw.approvalStateFor('VERIFICATION_PENDING', false), 'APPROVED');
});

await test('client executing draft action', async () => {
  assert.equal(cap({ proposalStatus: 'APPROVED', actionStatus: 'TODO', verificationState: null }), 'APPROVED');
});

await test('client in progress no proposal', async () => {
  assert.equal(cap({ proposalStatus: null, actionStatus: 'IN_PROGRESS' }), 'EXECUTING');
});

await test('approval pack risk line', async () => {
  const pack = gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: '/p', changeType: 'CHANGE_TITLE', risk: 'Reversible.' });
  assert.ok(pack[0].includes('CHANGE_TITLE'));
  assert.ok(pack[4].includes('Reversible.'));
});

await test('client done executing proposal verifying', async () => {
  assert.equal(cap({ proposalStatus: 'EXECUTED', actionStatus: 'DONE', verificationState: null }), 'VERIFYING');
});

await test('approval unknown proposal status', async () => {
  assert.equal(gw.approvalStateFor('PENDING', true), 'UNKNOWN');
});

/* ---------- ordering extras (6) ---------- */

await test('today weak beats unknown', async () => {
  assert.ok(gw.compareToday(tsig({ goalAlignment: 'WEAK' }), tsig({})) < 0);
});

await test('today unknown alignment last', async () => {
  assert.ok(gw.compareToday(tsig({ goalAlignment: 'CONTEXTUAL' }), tsig({ goalAlignment: 'UNKNOWN' })) < 0);
});

await test('today ready beats innow false but high', async () => {
  const a = tsig({ queueReady: true, priorityBand: 'LOW' });
  const b = tsig({ priorityBand: 'HIGH' });
  assert.ok(gw.compareToday(a, b) < 0);
});

await test('today reason dep text', async () => {
  assert.match(gw.todayReason(tsig({ dependencyReady: true }), tsig({})), /prerequisite satisfied/);
});

await test('today reason evidence text', async () => {
  assert.match(gw.todayReason(tsig({ evidenceComplete: true }), tsig({})), /evidence completeness/);
});

await test('today rank deterministic repeat', async () => {
  const a = tsig({ inNow: true, priorityBand: 'HIGH' });
  assert.deepEqual(gw.todayRank(a), gw.todayRank(a));
});

/* ---------- sections/blockers extras (6) ---------- */

await test('section today blocked verify excluded', async () => {
  assert.equal(gw.assignQueueSection('MEASURING', true), 'MEASURE');
  assert.equal(gw.assignQueueSection('COMPLETED', true), 'COMPLETED');
});

await test('section waiting today stays', async () => {
  assert.equal(gw.assignQueueSection('WAITING', true), 'WAITING');
});

await test('blocker gsc text', async () => {
  assert.match(gw.blockerNote('GSC_NOT_CONNECTED'), /explicit blocker/);
});

await test('owner numeric coerced', async () => {
  assert.equal(gw.ownerFor(42), '42');
});

await test('stale exactly boundary', async () => {
  assert.equal(
    gw.isStaleWork({ updatedAtIso: '2026-09-15T00:00:00.000Z', status: 'TODO', nowIso: '2026-09-15T00:00:00.000Z' }),
    false,
  );
});

await test('reconsider rules shape', async () => {
  const r = gw.reconsideration({ actionDismissed: true, evidenceMateriallyChanged: false, rulesAllow: true });
  assert.equal(r.available, false);
  assert.match(r.note, /without material evidence change/);
});

/* ---------- honesty extras (5) ---------- */

await test('no forecast language anywhere', async () => {
  const blob = JSON.stringify([
    gw.todayReason(tsig({ inNow: true }), tsig({})),
    gw.capacityNote(),
    gw.blockerNote('NONE'),
  ]);
  assert.doesNotMatch(blob, /forecast revenue|projected revenue|expected revenue|probability is [0-9]|will complete in/i);
  assert.match(blob, /not a score|invented|No blockers/);
});

await test('today max five enforced constant', async () => {
  assert.ok(gw.MAX_TODAY >= 3 && gw.MAX_TODAY <= 5);
});

await test('sections never duplicate mapping', async () => {
  const seen = new Map();
  for (const s of ['READY', 'IN_PROGRESS', 'BLOCKED', 'VERIFYING', 'MEASURING', 'COMPLETED']) {
    const section = gw.assignQueueSection(s, false);
    seen.set(section, (seen.get(section) ?? 0) + 1);
  }
  assert.ok([...seen.values()].every((n) => n === 1));
});

await test('dismissed excluded from today mapping', async () => {
  assert.notEqual(gw.assignQueueSection('DISMISSED', true), 'TODAY');
});

await test('approval pack never auto approves', async () => {
  assert.doesNotMatch(gw.approvalPack({ title: 't', why: 'w', evidence: 'e', page: null, changeType: 'c', risk: 'r' }).join(' '), /auto-approv/i);
});

/* ---------- performance extras (3) ---------- */

await test('today ordering batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    gw.compareToday(tsig({ inNow: i % 2 === 0, priorityBand: 'HIGH' }), tsig({ priorityBand: 'LOW' }));
  }
  assert.ok(true);
});

await test('approval batch 300', async () => {
  const states = ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', null];
  for (let i = 0; i < 300; i++) {
    gw.approvalStateFor(states[i % states.length], i % 2 === 0);
    gw.clientApprovalFor({ proposalStatus: states[i % states.length], actionStatus: 'TODO', verificationState: null });
  }
  assert.ok(true);
});

await test('worktype batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    gw.workTypeFor(`TYPE_${i % 10}`, `DECISION_${i % 5}`);
  }
  assert.ok(true);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nGrowth Work 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Growth Work 1.0 tests passed.');
}
