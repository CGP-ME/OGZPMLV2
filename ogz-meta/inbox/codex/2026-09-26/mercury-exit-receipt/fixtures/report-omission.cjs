'use strict';
const assert = require('node:assert/strict');
const { buildExplicitTargetCorpus, runExplicitTargetReview } = require(`${process.cwd()}/trai_brain/mercury-bridge/evidence-ingestion`);
let finals = 0;
const target = 'receipt-source.js';
const corpus = buildExplicitTargetCorpus({ targets: [{ path: target, sourceContent: 'module.exports = 3;\n',
  diffContent: '', sourceRef: 'WORKTREE', status: 'current' }] });
(async () => {
  const result = await runExplicitTargetReview({ corpus, query: 'Receipt transport observation, not a live review.',
    maxRequestBytes: 98304, maxTokens: 7750, temperature: 0.8,
    call: async (_client, messages) => {
      const p = JSON.parse(messages[1].content);
      if (p.units) return { content: p.units.map(u => JSON.stringify({ unit_id: u.unit_id, target: u.target,
        disposition: 'examined_no_finding', summary: 'Fixture source only.', claims: [], citations: [`${target}:1`] })).join('\n') };
      if (p.task === 'file_explicit_target_candidate_set') return { content: JSON.stringify({ target,
        disposition: 'examined_no_finding', summary: 'Fixture read.', citations: [`${target}:1`], adjudications: [] }) };
      assert.equal(p.task, 'decide_explicit_target_review');
      finals++;
      return { content: JSON.stringify({ record_type: 'final_decision', decision: 'no_break_found',
        summary: 'Fixture only.', answer: 'Receipt fixture: deliberately missing INHERITED report fields.',
        citations: [`${target}:1`], adjudications: [] }) };
    } });
  console.log(JSON.stringify({ attempts: result.shardedReview.synthesis_attempts.map(r => ({
    status: r.status, structured: r.structured_response, report_absences: r.report_absences,
  })) }, null, 2));
  assert.equal(finals, 1);
  assert.equal(result.termination, 'answer_given');
  assert.ok(result.shardedReview.synthesis.report_absences.includes('inherited_section_incomplete'));
  console.log(JSON.stringify({ level: 'actual ingestion owner; synthetic provider response, not reasoning proof',
    final_calls: finals, termination: result.termination,
    report_absences: result.shardedReview.synthesis.report_absences,
    reporting_gap_in_exit_coverage: result.shardedReview.coverage.unresolved }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
