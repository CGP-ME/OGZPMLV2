'use strict';
// Re-send the exact already-authorized Fable prompt that failed before spawn.
// This is one historical seat replay, not a new full-chain/source review.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const { buildAdversarialReviewPrompt, runFableAdversarialReview } = require(path.join(root, 'trai_brain/mercury-bridge/adversarial-review'));
const { sanitizeForLedger } = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const row = JSON.parse(fs.readFileSync(path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/reviewer-evidence/ledger/2026-09-24.jsonl'), 'utf8').trim());
  const attempt = row.review_quarantines.find(q => q.unit === 'challenger').attempts[0];
  const sources = attempt.input_provenance.supplied_sources;
  const hostEvidenceSources = sources.filter(s => s.artifact_sha256).map(source => {
    const bytes = fs.readFileSync(path.join(root, source.path));
    const excerpt = bytes.toString('utf8').split('\n').slice(source.line_start - 1, source.line_end).join('\n');
    if (sha(bytes) !== source.artifact_sha256 || sha(excerpt) !== source.excerpt_sha256) throw new Error('Historical source hash mismatch');
    return { ...source, excerpt };
  });
  const query = sources.find(s => s.path === 'input://original-query').excerpt;
  const prior = { answer: sources.find(s => s.path === 'panel://prior-reviewer-evidence').excerpt,
    termination: 'not_selected', iterations: 0, toolTelemetry: null, answerQuality: { flags: [], evidence: [] },
    panelSourceLabel: 'Prior selected reviewer evidence', panelSourcePath: 'panel://prior-reviewer-evidence' };
  const prompt = buildAdversarialReviewPrompt({ query, mercuryResult: prior, hostEvidenceSources });
  if (sha(prompt) !== attempt.input_provenance.prompt_sha256) throw new Error('Rebuilt prompt does not match failed request');
  fs.writeFileSync(path.join(__dirname, 'fable-replay-start.json'), JSON.stringify({ at: new Date().toISOString(), sourceRun: row.run_id,
    originalFailure: 'spawn E2BIG', promptBytes: Buffer.byteLength(prompt), promptSha256: sha(prompt), exactPromptMatch: true,
    sourceSha256: sha(fs.readFileSync(path.join(root, 'trai_brain/mercury-bridge/llm-client.js'))) }, null, 2) + '\n', { flag: 'wx' });
  const result = await runFableAdversarialReview({ query, mercuryResult: prior, hostEvidenceSources,
    persistRaw: (stage, number, bytes) => {
      const file = path.join(__dirname, `${stage}-${number}.raw`);
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      return { path: path.relative(root, file), bytes: bytes.length, sha256: sha(bytes), mode: '0600' };
    } });
  fs.writeFileSync(path.join(__dirname, 'fable-replay-result.private.json'), JSON.stringify(sanitizeForLedger(result), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const receipt = { at: new Date().toISOString(), historicalSourceRun: row.run_id, exactPromptMatch: true,
    promptSha256: sha(prompt), promptBytes: Buffer.byteLength(prompt), ok: result.ok, parsed: result.parsed,
    attempts: result.attempts.map(a => ({ role: a.role, status: a.status, error: a.error, termination: a.termination,
      requestedModel: a.requested_model, appliedModels: a.applied_models, identity: a.identity_posture,
      tokens: a.tokens, rawOutput: a.raw_output, tools: a.tools,
      hostExcerpts: a.input_provenance?.supplied_sources?.filter(s => s.artifact_sha256).length })),
    answer: result.answer,
    limits: ['Historical prompt replay proves actual CLI/provider delivery only. Mercury/recheck/Kimi were not re-run; historical missing context remains missing. Not full-chain acceptance.'] };
  fs.writeFileSync(path.join(__dirname, 'fable-replay-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  if (!result.ok) process.exitCode = 2;
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
