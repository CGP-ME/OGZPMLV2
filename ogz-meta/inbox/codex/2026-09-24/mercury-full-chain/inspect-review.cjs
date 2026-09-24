'use strict';
// Inspect completed live receipts; never calls a model or changes a verdict.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const ledgerPath = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rows = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
const lineIndex = rows.findLastIndex(line => JSON.parse(line).receipt_type === 'bridge_run');
if (lineIndex < 0) throw new Error('No completed bridge run in supplied ledger');
const row = JSON.parse(rows[lineIndex]);
const refs = new Map();
function collectRefs(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && value.sha256 && Number.isInteger(value.bytes)) {
    const identity = [value.path, value.line_start, value.line_end, value.sha256].join('|');
    refs.set(identity, value);
  }
  Object.values(value).forEach(collectRefs);
}
collectRefs(row);
const artifacts = [...refs.values()].map(ref => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref.path)) {
    const bytes = Buffer.from(ref.excerpt || '', 'utf8');
    return { path: ref.path, kind: 'inline_provenance', bytes: ref.bytes,
      redactedExcerptBytes: bytes.length, matched: ref.bytes === bytes.length && ref.sha256 === sha(bytes),
      limit: 'Sanitized ledger excerpts can differ from original provider-input hashes; raw stage receipts retain provenance.' };
  }
  const file = path.resolve(root, ref.path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return { path: ref.path, present: false, matched: false };
  const bytes = fs.readFileSync(file);
  if (ref.artifact_sha256) {
    const excerpt = bytes.toString('utf8').split('\n').slice(ref.line_start - 1, ref.line_end).join('\n');
    const artifactMatched = bytes.length === ref.artifact_bytes && sha(bytes) === ref.artifact_sha256;
    const excerptMatched = Buffer.byteLength(excerpt) === ref.excerpt_bytes && sha(excerpt) === ref.excerpt_sha256
      && ref.sha256 === ref.excerpt_sha256 && ref.bytes === ref.excerpt_bytes;
    return { path: ref.path, kind: 'attested_local_excerpt', lineStart: ref.line_start, lineEnd: ref.line_end,
      artifactMatched, excerptMatched, matched: artifactMatched && excerptMatched };
  }
  return { path: ref.path, kind: 'local_artifact', bytes: bytes.length, sha256: sha(bytes), matched: ref.bytes === bytes.length && ref.sha256 === sha(bytes) };
});
const bundle = row.source_refs?.current_change_evidence_bundle;
let bundleCheck = null;
if (bundle) {
  const manifestBytes = fs.readFileSync(path.join(root, bundle.manifest_path));
  const manifest = JSON.parse(manifestBytes);
  const lines = fs.readFileSync(path.join(root, bundle.path), 'utf8').split('\n');
  const sections = manifest.sections.map(s => {
    const content = lines.slice(s.line_start - 1, s.line_end).join('\n');
    return { id: s.id, kind: s.kind, target: s.target,
      matched: Buffer.byteLength(content) === s.bytes && sha(content) === s.sha256 };
  });
  bundleCheck = { path: bundle.path, bytes: bundle.bytes, lines: bundle.lines,
    manifestMatched: sha(manifestBytes) === bundle.manifest_sha256 && manifestBytes.length === bundle.manifest_bytes,
    sectionCount: sections.length, matchedSections: sections.filter(s => s.matched).length, sections };
}
const seats = (row.reviewer_panel?.seats || []).map(s => ({ id: s.id, status: s.status, verdict: s.verdict,
  provider: s.provider, appliedModels: s.appliedModels, evidenceChecksPassed: s.evidenceChecksPassed,
  doctrineReview: s.doctrineReview, evidence: s.evidence, answerSha256: sha(s.answer || ''),
  answerBytes: Buffer.byteLength(s.answer || '') }));
const rechecks = row.adversarial_review?.rechecks || [];
const fable = row.reviewer_panel?.seats?.find(s => s.id === 'fable');
const tools = (row.tools_invoked || []).map(t => ({ name: t.name, calls: t.calls, succeeded: t.succeeded, failed: t.failed }));
const reviewerDelivery = (row.reviewer_panel?.seats || []).flatMap(seat => (seat.providerAttempts || []).filter(a => a.input_provenance).map(a => ({
  seat: seat.id, role: a.role, attempt: a.attempt, status: a.status, termination: a.termination,
  promptBytes: a.input_provenance.prompt_bytes, promptSha256: a.input_provenance.prompt_sha256,
  hostExcerpts: (a.input_provenance.supplied_sources || []).filter(s => s.artifact_sha256).length,
  toolSources: (a.input_provenance.supplied_sources || []).filter(s => s.path?.startsWith('tool://')).length,
  failureSources: (a.input_provenance.supplied_sources || []).filter(s => s.path?.startsWith('provider://')).length,
})));
const decisionFields = (row.reviewer_panel?.seats || []).map(s => ({ seat: s.id,
  verdictFields: (s.answer || '').match(/^\s*(?:\*\*)?VERDICT(?:\*\*)?\s*:.*$/gm) || [] }));
const result = { inspectedAt: new Date().toISOString(), ledger: { path: ledgerPath, line: lineIndex + 1, rowSha256: sha(rows[lineIndex]) },
  runId: row.run_id, head: row.head_sha, prompt: row.prompt_excerpt, options: row.options, verdict: row.verdict,
  termination: row.termination, iterations: row.iterations, authority: row.reviewer_panel?.authority,
  seats, reviewerDelivery, decisionFields, rechecks: rechecks.map(r => ({ verdict: r.verdict, iterations: r.iterations, termination: r.termination,
    doctrine_review: r.doctrine_review, tools_invoked: (r.tools_invoked || []).map(t => ({ name: t.name, calls: t.calls, failed: t.failed })) })),
  fableAnswerPreserved: Boolean(fable && fable.answer === row.adversarial_review?.answer_full),
  fableNotRecheckSubstitution: Boolean(fable && rechecks.every(r => !r.answer_full || r.answer_full !== fable.answer)),
  tools, filesOpened: row.files_opened, deliveredReadCount: row.file_reads?.length,
  candidateSet: row.candidate_set ? { captured: row.candidate_set.captured_at_iteration, revised: row.candidate_set.revised_at_iteration,
    revisionCount: row.candidate_set.revisions?.length, answerCitationsSubset: row.candidate_set.answer_citations_subset,
    citationsNotFiled: row.candidate_set.citations_not_in_candidate_set } : null,
  qualityFlags: row.answer_quality, doctrineReview: row.doctrine_review, quarantines: row.review_quarantines,
  tokens: row.run_tokens, cost: row.run_cost, artifacts, bundleCheck,
  limits: ['This checks ledger structure and artifact hashes, not semantic validity of every citation or exhaustive program coverage.',
    'Readiness, successful transport and a model verdict alone do not establish acceptance. All absences remain unchanged.'] };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, runId: result.runId, verdict: result.verdict, authority: result.authority,
  iterations: result.iterations, seats, tools, candidateSet: result.candidateSet, fableAnswerPreserved: result.fableAnswerPreserved,
  artifacts: artifacts.length, mismatchedArtifacts: artifacts.filter(a => !a.matched),
  bundle: bundleCheck && { bytes: bundleCheck.bytes, sections: bundleCheck.sectionCount, matched: bundleCheck.matchedSections } }, null, 2));
