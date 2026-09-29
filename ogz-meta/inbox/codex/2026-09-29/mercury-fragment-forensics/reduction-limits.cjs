'use strict';
// Deterministic real-ingestion observation: reducer cannot replace quote source.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ingestion = require(path.resolve(__dirname, '../../../../../trai_brain/mercury-bridge/evidence-ingestion'));
async function observe(oversized = false) {
  const target = 'fixture-source.js';
  const content = `function value(input) {\n${oversized ? '  // preserved context\n'.repeat(6500) : ''}  return input;\n}\n`;
  const total = content.trimEnd().split('\n').length;
  const corpus = ingestion.buildExplicitTargetCorpus({ targets: [{ path: target,
    sourceContent: content, sourceRef: 'WORKTREE', diffContent: '', status: 'current' }] });
  let reductions = 0, candidates = 0, candidateDecisions = null, finalPreserved = false;
  const result = await ingestion.runExplicitTargetReview({ corpus, query: 'Source handoff observation only.',
    maxRequestBytes: 98304, maxTokens: 7750,
    syntaxContext: { fileReceipts: [{ file: target, source_sha256: ingestion.sha256(content), parser: 'fixture_ranges' }],
      functionScopes: [{ file: target, line: 1, endLine: total, name: 'value' }] },
    call: async (_client, messages, tools, options) => {
      assert.ok(ingestion.providerRequestBytes(messages, tools, options) <= 98304, 'Oversized request dispatched');
      const p = JSON.parse(messages[1].content);
      if (p.units) return { content: p.units.map(unit => JSON.stringify({
        unit_id: unit.unit_id, target: unit.target, disposition: 'finding',
        summary: 'Long model inspection output. '.repeat(oversized ? 1 : 5000),
        claims: [{ statement: 'Return value allegation.', citations: [`${target}:1`] }],
      })).join('\n') };
      if (p.task === 'reduce_explicit_target_findings') {
        reductions++;
        assert.ok(!p.inputs.some(node => node.source_citation), 'Literal source entered a lossy reducer');
        assert.ok(!p.inputs.some(node => node.node_kind === 'candidate_set'), 'Filed claim decisions entered a lossy reducer');
        assert.ok(!messages.some(message => message.content.includes('BEGIN LITERAL SOURCE')));
        return { content: JSON.stringify({ record_type: 'reduction', summary: 'Retained fixture allegation.', findings: [] }) };
      }
      if (p.task === 'file_explicit_target_candidate_set') {
        candidates++;
        assert.equal(oversized, false);
        const literal = messages.find(message => message.content.includes('BEGIN LITERAL SOURCE'));
        assert.ok(literal && literal.content.includes('2:   return input;'), 'Candidate lost literal source after reduction');
        const adjudications = p.leaf_manifest.targets[0].claims.map(claim => ({ claim_id: claim.claim_id,
          disposition: 'refuted', reason: 'Fixture source returns its input.',
          evidence: [{ citation: `${target}:2`, quote: 'return input;' }] }));
        candidateDecisions = adjudications;
        return { content: JSON.stringify({ target, disposition: 'examined_no_finding', summary: 'Fixture only.', adjudications }) };
      }
      assert.equal(p.task, 'decide_explicit_target_review');
      if (!oversized) {
        const literal = messages.find(message => message.content.includes('BEGIN LITERAL SOURCE'));
        assert.ok(literal && literal.content.includes('1: function value(input) {') && literal.content.includes('2:   return input;'), 'Final lost physical context through reduction');
        const filed = p.inputs.find(node => node.node_kind === 'candidate_set');
        assert.ok(filed, 'Final input lost the original filed decisions');
        const record = JSON.parse(filed.raw_output.split('\n')[1]);
        // The original provider decisions plus host evidence metadata survive;
        // no second candidate run may replace them after report reduction.
        assert.deepEqual(record.adjudications.map(({ evidence, ...decision }) => ({
          ...decision, evidence: evidence.map(({ citation, quote }) => ({ citation, quote })) })), candidateDecisions);
        finalPreserved = true;
      }
      return { content: JSON.stringify({ record_type: 'final_decision', decision: oversized ? 'cannot_verify' : 'no_break_found',
        adjudications: p.leaf_manifest.targets.flatMap(entry => entry.claims.map(claim => ({ claim_id: claim.claim_id,
          disposition: oversized ? 'unresolved' : 'refuted', reason: oversized ? 'Literal input was not delivered.' : 'Fixture returns its input.',
          evidence: oversized ? [] : [{ citation: `${target}:2` }] }))),
        summary: 'Transport observation only.', answer: 'INHERITED: fixture-source.js; || 0, swallowed catch, bypass env, silent default: absent in fixture.\nFOURTH SHAPE CLASSIFIER: classified 0 of 0.\n', citations: [] }) };
    } });
  if (!oversized) { assert.ok(reductions > 0); assert.equal(candidates, 1); assert.equal(finalPreserved, true); }
  else {
    assert.equal(candidates, 0);
    assert.ok(result.shardedReview.candidates.some(receipt => receipt.error === 'literal_source_and_manifest_exceed_request_envelope'));
    assert.equal(result.shardedReview.coverage.authorityReady, false);
  }
  return { oversized, sourceBytes: Buffer.byteLength(content), reductions, candidates, finalPreserved,
    candidateErrors: result.shardedReview.candidates.map(receipt => receipt.error),
    authorityReady: result.shardedReview.coverage.authorityReady };
}
(async () => {
  const result = { level: 'deterministic transport, not provider reasoning', cases: [await observe(), await observe(true)] };
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
