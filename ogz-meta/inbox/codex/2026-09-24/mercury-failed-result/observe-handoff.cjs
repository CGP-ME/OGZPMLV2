'use strict';
// Replay captured provider failure through the actual ask.runAgentic coordinator.
// Provider, database, trace writes and notifications are intercepted; repo tools
// are real new read-only calls, not claimed to be historical tool-result bytes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const Module = require('module');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const react = require(path.join(root, 'trai_brain/mercury-bridge/react-loop'));
const ledger = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const { createToolAdapter } = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = (file, before) => before ? execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
function load(file, before, overrides = {}) {
  const filename = path.join(root, file), instance = new Module(filename, module);
  instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = instance.require.bind(instance);
  instance.require = name => Object.hasOwn(overrides, name) ? overrides[name] : originalRequire(name);
  instance._compile(source(file, before), filename);
  return instance.exports;
}
async function main() {
  const row = JSON.parse(fs.readFileSync(path.join(root, 'ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/reviewer-evidence/ledger/2026-09-24.jsonl'), 'utf8').trim());
  const attempts = row.reviewer_panel.seats.find(s => s.id === 'mercury').providerAttempts;
  const adapter = createToolAdapter({ repoRoot: root });
  const history = [];
  for (const attempt of attempts) {
    const bytes = fs.readFileSync(path.join(root, attempt.raw_output.path));
    if (sha(bytes) !== attempt.raw_output.sha256) throw new Error('Historical raw hash mismatch');
    const frame = JSON.parse(bytes);
    if (attempt.status !== 'succeeded') continue;
    for (const call of frame.choices[0].message.tool_calls || []) {
      const name = call.function.name;
      if (!['git_diff', 'search', 'grep', 'regex_grep', 'open_file'].includes(name)) throw new Error('Unexpected tool in bounded replay');
      const args = JSON.parse(call.function.arguments), result = await adapter.execute(name, args);
      const delivered = react.serializeToolResultForHistory(name, result);
      history.push({ iteration: attempt.attempt, toolName: name, toolArgs: args, toolResult: result, toolDelivery: delivered.delivery });
    }
  }
  const failedResult = { answer: '(Mercury call failed: Provider response terminated before completion)',
    termination: 'error', iterations: 18, history, toolTelemetry: react.summarizeToolTelemetry(history), providerAttempts: attempts,
    toolsAvailable: Object.keys(adapter.tools), candidateSet: null };
  const observations = [];
  for (const before of [true, false]) {
    const adv = load('trai_brain/mercury-bridge/adversarial-review.js', before);
    const captures = [];
    let loopCalls = 0, capturedLedger;
    const transportClient = () => ({ initialize: async () => {}, generateWithTools: async () => { throw new Error('Unexpected provider call'); } });
    const capture = (role, args) => {
      const prompt = role === 'fable' ? adv.buildAdversarialReviewPrompt(args) : adv.buildKimiFinalAdjudicationPrompt(args);
      captures.push({ role, priorTermination: args.mercuryResult.termination, priorIterations: args.mercuryResult.iterations,
        promptSha256: sha(prompt), deliveredTools: history.filter((h, i) => prompt.includes(`tool://mercury-pass-1/${h.iteration}/${i + 1}`)).length,
        includesFailure: prompt.includes(failedResult.answer), includesRawFailureHash: prompt.includes(attempts.at(-1).raw_output.sha256) });
      return { ok: true, answer: 'VERDICT: needs_more_evidence\nCONSENSUS_BLOCKING: yes\nRECHECK_PROMPT: examine missing evidence',
        parsed: { verdict: 'needs_more_evidence', blocking: true }, attempts: [], quarantines: [], rechecks: [] };
    };
    class NoDatabase {
      constructor() { this.stats = { find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }) }; }
      async connect() {} async disconnect() {} async healthCheck() { return { ok: true, chunkCount: 1 }; }
    }
    const ask = load('trai_brain/mercury-bridge/ask.js', before, {
      './mongo-store': NoDatabase,
      './llm-client': { createMercuryLlmClient: transportClient },
      './react-loop': { ...react, runReactLoop: async () => { loopCalls++; return structuredClone(failedResult); } },
      './trace-memory': { ensureTraceIndexes: async () => {}, evictStaleTraces: async () => {}, retrieveSimilarTrace: async () => null },
      './adversarial-review': { ...adv, runFableAdversarialReview: async args => capture('fable', args),
        runKimiFinalAdjudication: async args => capture('kimi', args),
        notifyReviewQuarantines: async values => values || [], sendMaxPriorityNtfy: async () => ({ status: 'intercepted_local_observation' }) },
      './run-ledger': { ...ledger, writeRunLedgerEntry: ({ entry }) => { capturedLedger = entry; return { path: 'local-observation-only' }; } },
    });
    const result = await ask.runAgentic('Mercury, break my fix.', { quiet: true, topK: 0, blastRadius: 'LOCAL REPLAY: no new scan',
      reviewersExplicit: true, reviewers: ['mercury', 'fable', 'kimi'], maxTokens: 7750 });
    observations.push({ revision: before ? 'before' : 'after', askSha256: sha(source('trai_brain/mercury-bridge/ask.js', before)),
      captures, loopCalls, ledger: { iterations: capturedLedger.iterations, termination: capturedLedger.termination,
        toolCalls: capturedLedger.tools_invoked.reduce((n, t) => n + t.calls, 0), providerAttempts: capturedLedger.stages.mercury.provider_attempts.length,
        verdict: capturedLedger.verdict, ceiling: capturedLedger.reviewer_panel.authority.ceiling,
        mercurySeat: capturedLedger.reviewer_panel.seats.filter(s => s.id === 'mercury').map(s => ({ status: s.status, answer: s.answer, verdict: s.verdict, evidenceChecksPassed: s.evidenceChecksPassed })) } });
  }
  const after = observations[1];
  const passed = history.length === 18 && observations[0].ledger.toolCalls === 0 && after.ledger.toolCalls === 18
    && after.ledger.iterations === 18 && after.ledger.providerAttempts === 19 && after.loopCalls === 1
    && after.captures.every(c => c.priorTermination === 'error' && c.priorIterations === 18 && c.deliveredTools === 18 && c.includesFailure && c.includesRawFailureHash)
    && after.ledger.verdict === 'unverified' && after.ledger.ceiling === 'UNVERIFIED'
    && after.ledger.mercurySeat.every(s => s.status === 'failed' && s.verdict === null && s.evidenceChecksPassed === false);
  const receipt = { at: new Date().toISOString(), sourceRun: row.run_id, passed, providerCalls: 0, databaseWrites: 0, notifications: 0,
    observations, limits: ['Actual coordinator and prompt/ledger producers, with historical failure and new read-only tool calls. Providers/database/notifications intercepted. No full-chain acceptance or historical tool-byte identity claimed.'] };
  fs.writeFileSync(path.join(__dirname, 'handoff-observation.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  if (!passed) process.exitCode = 2;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
