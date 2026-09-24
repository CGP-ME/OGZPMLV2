'use strict';
// Local observation at the real reviewer transport boundary. No provider call.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const { createToolAdapter } = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const { serializeToolResultForHistory, summarizeToolTelemetry } = require(path.join(root, 'trai_brain/mercury-bridge/react-loop'));
const { runFableAdversarialReview, runKimiFinalAdjudication } = require(path.join(root, 'trai_brain/mercury-bridge/adversarial-review'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ledgerPath = path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/readonly-source/ledger/2026-09-24.jsonl');
const row = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim());
const bundle = row.source_refs.current_change_evidence_bundle;
const artifact = fs.readFileSync(path.join(root, bundle.path));
const lines = artifact.toString('utf8').split('\n');
if (lines.at(-1) === '') lines.pop();
const hostEvidenceSources = [];
for (let start = 0; start < lines.length; start += 150) {
  const excerpt = lines.slice(start, start + 150).join('\n');
  hostEvidenceSources.push({ path: bundle.path, artifact_sha256: sha(artifact), artifact_bytes: artifact.length,
    line_start: start + 1, line_end: Math.min(start + 150, lines.length),
    excerpt_sha256: sha(excerpt), excerpt_bytes: Buffer.byteLength(excerpt), excerpt });
}
async function main() {
  const adapter = createToolAdapter({ repoRoot: root });
  const history = [];
  // Actual read at the same source boundary as the completed run. Deliberately
  // request a large range so downstream delivery must retain compaction metadata.
  for (const [index, args] of [
    { path: 'core/StateManager.js', start_line: 1700, end_line: 1850 },
    { path: 'trai_brain/mercury-bridge/tool-adapter.js', start_line: 1, end_line: 500 },
  ].entries()) {
    const result = await adapter.execute('open_file', args);
    const delivered = serializeToolResultForHistory('open_file', result);
    history.push({ iteration: index + 1, toolName: 'open_file', toolArgs: args, toolResult: result, toolDelivery: delivered.delivery });
  }
  const primary = { answer: row.reviewer_panel.seats[0].answer, history,
    toolTelemetry: summarizeToolTelemetry(history), termination: 'local_transport_observation', iterations: 2 };
  const recheck = { answer: row.adversarial_review.rechecks[0].answer_full, history: history.slice(0, 1),
    toolTelemetry: summarizeToolTelemetry(history.slice(0, 1)), termination: 'local_transport_observation', iterations: 1 };
  const review = { answer: row.adversarial_review.answer_full, parsed: row.adversarial_review.parsed,
    rechecks: [recheck], recheckPrompts: ['Saved receipt replay; no new model claim.'] };
  const captures = [];
  function captureClient() {
    return { maxTokens: 7750, initialize: async () => {}, shutdown: async () => {},
      generateResponseWithMetadata: async prompt => {
        captures.push({ prompt, sha256: sha(prompt), bytes: Buffer.byteLength(prompt) });
        throw new Error('LOCAL_CAPTURE_ONLY_TRANSPORT_NOT_SENT');
      } };
  }
  const fable = await runFableAdversarialReview({ query: 'Mercury, break my fix.', mercuryResult: primary,
    hostEvidenceSources, createFableClient: captureClient, createOpusClient: captureClient });
  const fableCapture = captures[0];
  const fableCaptureCount = captures.length;
  let kimi;
  try {
    kimi = await runKimiFinalAdjudication({ query: 'Mercury, break my fix.', mercuryResult: primary, review,
      hostEvidenceSources, createClient: captureClient });
  } catch (error) {
    if (error.message !== 'LOCAL_CAPTURE_ONLY_TRANSPORT_NOT_SENT') throw error;
    kimi = { attempts: error.reviewerAttempts || [] };
  }
  const kimiCaptures = captures.slice(fableCaptureCount);
  const checked = captures.map((capture, index) => ({ role: index < fableCaptureCount ? 'fable' : 'kimi',
    promptSha256: capture.sha256, promptBytes: capture.bytes,
    deliveredArtifactExcerpts: hostEvidenceSources.filter(s => capture.prompt.includes(s.excerpt)).length,
    hostScopeWarningPresent: capture.prompt.includes('do not establish unread source'),
    deliveredPrimaryTools: history.filter(entry => capture.prompt.includes(JSON.stringify({ tool: entry.toolName, args: entry.toolArgs,
      delivery: entry.toolDelivery, result: serializeToolResultForHistory(entry.toolName, entry.toolResult).content }))).length,
    recheckToolSourcePresent: capture.prompt.includes('tool://mercury-pass-2/1/1') }));
  const attempts = [...(fable.attempts || []), ...(kimi.attempts || [])];
  const provenance = attempts.map(a => ({ role: a.role, hostExcerpts: (a.input_provenance?.supplied_sources || []).filter(s => s.path === bundle.path).length,
    toolSources: (a.input_provenance?.supplied_sources || []).filter(s => s.path?.startsWith('tool://')).length }));
  const passed = sha(artifact) === bundle.sha256 && Boolean(fableCapture) && kimiCaptures.length > 0
    && checked.every(c => c.deliveredArtifactExcerpts === hostEvidenceSources.length && c.deliveredPrimaryTools === history.length && c.hostScopeWarningPresent)
    && checked.filter(c => c.role === 'kimi').every(c => c.recheckToolSourcePresent)
    && provenance.every(p => p.hostExcerpts === hostEvidenceSources.length && p.toolSources >= history.length);
  const receipt = { at: new Date().toISOString(), passed, sourceRun: row.run_id, artifact: bundle,
    artifactExcerpts: hostEvidenceSources.length, actualToolReads: history.map(h => ({ args: h.toolArgs, delivery: h.toolDelivery })),
    checked, provenance, providerCalls: 0, intentionalTransportFailure: 'LOCAL_CAPTURE_ONLY_TRANSPORT_NOT_SENT',
    limits: ['Checks actual reviewer prompt-to-transport handoff and source provenance, not provider reasoning, full-chain acceptance or bot behavior.',
      'Source read observations are new local calls; saved model answers are identified as historical replay, not new provider responses.'] };
  fs.writeFileSync(path.join(__dirname, process.argv[2] || 'delivery-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed, artifactExcerpts: receipt.artifactExcerpts, checked, provenance, providerCalls: 0 }));
  if (!passed) process.exitCode = 2;
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
