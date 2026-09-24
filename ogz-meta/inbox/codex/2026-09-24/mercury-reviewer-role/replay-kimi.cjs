'use strict';
// Exact historical Kimi request; only the shared system-role producer changes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
const { buildKimiFinalAdjudicationPrompt, runKimiFinalAdjudication } = require(path.join(root, 'trai_brain/mercury-bridge/adversarial-review'));
const { sanitizeForLedger } = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const row = JSON.parse(fs.readFileSync(path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/reviewer-evidence/ledger/2026-09-24.jsonl'), 'utf8').trim());
  const oldSeat = row.reviewer_panel.seats.find(s => s.id === 'kimi');
  const attempt = oldSeat.providerAttempts[0], sources = attempt.input_provenance.supplied_sources;
  const hostEvidenceSources = sources.filter(s => s.artifact_sha256).map(s => {
    const b = fs.readFileSync(path.join(root, s.path)), excerpt = b.toString('utf8').split('\n').slice(s.line_start - 1, s.line_end).join('\n');
    if (sha(b) !== s.artifact_sha256 || sha(excerpt) !== s.excerpt_sha256) throw new Error('Historical source hash mismatch');
    return { ...s, excerpt };
  });
  const query = 'Mercury, break my fix.';
  const answer = `No prior reviewer output. Independently review the original query:\n${query}`;
  const prior = { answer, termination: 'not_selected', iterations: 0, toolTelemetry: null, answerQuality: { flags: [], evidence: [] },
    panelSourceLabel: 'Prior selected reviewer evidence', panelSourcePath: 'panel://prior-reviewer-evidence' };
  const review = { answer, parsed: { verdict: 'not_selected', blocking: false }, rechecks: [], recheckPrompts: [],
    panelSourceLabel: 'Earlier selected reviewer evidence (no prior Fable seat)', panelSourcePath: 'panel://prior-reviewer-evidence' };
  const prompt = buildKimiFinalAdjudicationPrompt({ query, mercuryResult: prior, review, hostEvidenceSources });
  if (sha(prompt) !== attempt.input_provenance.prompt_sha256) throw new Error('Historical Kimi request does not match');
  const previous = JSON.parse(execFileSync('git', ['show', 'HEAD:mercury.config.json'], { cwd: root, encoding: 'utf8' })).consensus.systemPrompt.join('\n');
  const start = { at: new Date().toISOString(), historicalSourceRun: row.run_id, requestSha256: sha(prompt), exactRequestMatch: true,
    requestBytes: Buffer.byteLength(prompt), systemBeforeSha256: sha(previous), systemAfterSha256: sha(config.CONSENSUS_SYSTEM_PROMPT),
    previousVerdictFields: oldSeat.answer.match(/^VERDICT:.*$/gm), configuredModel: config.TIE_BREAKER_MODEL, maxTokens: config.TIE_BREAKER_CLIENT_MAX_TOKENS };
  fs.writeFileSync(path.join(__dirname, 'kimi-replay-start.json'), JSON.stringify(start, null, 2) + '\n', { flag: 'wx' });
  const result = await runKimiFinalAdjudication({ query, mercuryResult: prior, review, hostEvidenceSources,
    persistRaw: (stage, number, bytes) => {
      const file = path.join(__dirname, `${stage}-${number}.raw`);
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      return { path: path.relative(root, file), sha256: sha(bytes), bytes: bytes.length, mode: '0600' };
    } });
  fs.writeFileSync(path.join(__dirname, 'kimi-replay-result.private.json'), JSON.stringify(sanitizeForLedger(result), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const receipt = { ...start, completedAt: new Date().toISOString(), parsedVerdict: result.parsed.verdict,
    verdictFields: result.answer.match(/^VERDICT:.*$/gm), answer: result.answer,
    attempts: result.attempts.map(a => ({ role: a.role, status: a.status, termination: a.termination, requestedModel: a.requested_model,
      appliedModels: a.applied_models, identity: a.identity_posture, tokens: a.tokens, rawOutput: a.raw_output,
      hostExcerpts: a.input_provenance.supplied_sources.filter(s => s.artifact_sha256).length })),
    limits: ['Historical request replay, not fresh source/index or full-chain acceptance. No missing-evidence ceiling changed.'] };
  fs.writeFileSync(path.join(__dirname, 'kimi-replay-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
