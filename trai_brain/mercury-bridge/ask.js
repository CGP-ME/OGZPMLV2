#!/usr/bin/env node
/**
 * Mercury Bridge — CLI Entry
 * ══════════════════════════════════════════════════════════════
 * Ask Mercury questions about the OGZPrime codebase with either:
 *   (default) single-shot RAG — fast but can be fooled by docs
 *   --agentic  ReAct loop with tool access — Mercury iteratively
 *              greps the repo and opens files until it has ground truth
 *
 * Usage:
 *   node trai_brain/mercury-bridge/ask.js "How does MPM handle BE scale-out?"
 *   node trai_brain/mercury-bridge/ask.js --agentic "Find the partial-close contract bug"
 *
 * Flags:
 *   --agentic              Enable ReAct loop
 *   --top-k=N              Retrieve N starter-context chunks
 *   --max-iterations=N     Agentic mode only: max tool-call iterations
 *   --max-tokens=N         Mercury max tokens per turn
 *   --quiet                Suppress progress logs
 *   --show-chunks          Print retrieved chunk text (not just filenames)
 *   --show-history         Agentic mode only: print the full tool-call trace
 *   --adversarial-review   Agentic mode only: ask Fable to attack Mercury's answer
 *   --reviewers=IDS        Agentic reviewer IDs in dispatch order (comma-separated)
 *   --evidence-source=P:S-E Host-attest a verbatim repo-relative excerpt (repeatable)
 *   --consensus            Agentic mode only: legacy alias for Fable review
 *   --architecture         Agentic mode only: longform architecture review framing
 *   --planning             Agentic mode only: implementation planning/design framing
 *   --check-providers      Warm up Mercury and Fable clients, then exit
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TextDecoder } = require('util');
const { execFileSync } = require('child_process');

// Load .env from repo root so configured Mercury LLM key env is available.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const { ask } = require('./searcher');
const { runReactLoop, formatToolTelemetry } = require('./react-loop');
const { createToolAdapter } = require('./tool-adapter');
const { routeQuery } = require('./query-router');
const { createMercuryLlmClient } = require('./llm-client');
const {
  MERCURY_DOCTRINE_PROMPT,
  assessDoctrineReview,
  extractDiffReferenceNames,
} = require('./doctrine-review');
const {
  reviewModeRequested,
  runFableAdversarialReview,
  runKimiFinalAdjudication,
  buildAttestedPromptProvenance,
  buildMercuryRecheckPrompts,
  formatAdversarialReviewPacket,
  isHardReviewBoundaryError,
  kimiTieBreakerRequired,
  notifyReviewQuarantines,
  reviewQuarantine,
} = require('./adversarial-review');
const { runProviderPreflight } = require('./provider-preflight');
const {
  REVIEWER_REGISTRY,
  ensureReviewerAnswer,
  promptReviewerSelection,
  resolveReviewerSelection,
  runReviewerPanel,
} = require('./reviewer-panel');
const { retrieveSimilarTrace, formatTraceAsHint, captureTrace, markTraceUsed, evictStaleTraces, ensureTraceIndexes, getTraceStats } = require('./trace-memory');
const {
  autoBlastRadiusFailed,
  buildRunLedgerEntry,
  createRawRunId,
  redactSensitiveText,
  resultHasToolFailure,
  writeRawProviderOutput,
  writeRunLedgerEntry,
} = require('./run-ledger');
const MongoStore = require('./mongo-store');
const { embedText } = require('./indexer');
const { retrieveTopK } = require('./searcher');
const { getBlastRadius, formatForMercury } = require('../../tools/serena-bridge');

const UNTRACKED_SERENA_SOURCE_PATHS = Object.freeze([
  'core',
  'modules',
  'brokers',
  'foundation',
  'tools',
  'public/js',
  'public/proof',
  'dashboard',
  'trai_brain/mercury-bridge',
  'run-empire-v2.js',
  'ogzprime-ssl-server.js',
]);

function parseArgs(argv) {
  const args = {
    query: '',
    topK: null,
    maxTokens: null,
    maxIterations: null,
    quiet: false,
    showChunks: false,
    showHistory: false,
    agentic: false,
    adversarialReview: false,
    adversarialReviewExplicit: false,
    consensus: false,
    consensusExplicit: false,
    reviewIntent: 'adversarial',
    retrievalMode: null,   // semantic | hybrid | hybrid-classified
    boostType: null,       // manual content_type boost (e.g. recent_changes)
    explainRoute: false,   // print routing decision and exit
    explainTrace: false,   // print trace hint and exit
    traceStats: false,     // dump trace stats and exit
    pruneTraces: false,    // force eviction and exit
    checkProviders: false, // warm up configured LLM providers and exit
    captureTrace: false,   // opt-in successful trace capture
    evidenceSources: [],   // repeatable host-attested path:start-end descriptors
    reviewers: null,
    reviewersExplicit: false,
  };
  const positional = [];

  for (const arg of argv.slice(2)) {
    if (arg === '--quiet') {
      args.quiet = true;
    } else if (arg === '--show-chunks') {
      args.showChunks = true;
    } else if (arg === '--show-history') {
      args.showHistory = true;
    } else if (arg === '--agentic') {
      args.agentic = true;
    } else if (arg === '--adversarial-review') {
      args.adversarialReview = true;
      args.adversarialReviewExplicit = true;
    } else if (arg === '--no-adversarial-review') {
      args.adversarialReview = false;
      args.adversarialReviewExplicit = true;
    } else if (arg === '--consensus') {
      args.consensus = true;
      args.consensusExplicit = true;
    } else if (arg === '--no-consensus') {
      args.consensus = false;
      args.consensusExplicit = true;
    } else if (arg === '--architecture') {
      args.reviewIntent = 'architecture';
    } else if (arg === '--planning') {
      args.reviewIntent = 'planning';
    } else if (arg.startsWith('--top-k=')) {
      args.topK = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-tokens=')) {
      args.maxTokens = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-iterations=')) {
      args.maxIterations = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--retrieval-mode=')) {
      args.retrievalMode = arg.split('=')[1];
    } else if (arg.startsWith('--boost-type=')) {
      args.boostType = arg.split('=')[1];
    } else if (arg === '--explain-route') {
      args.explainRoute = true;
    } else if (arg === '--explain-trace') {
      args.explainTrace = true;
    } else if (arg === '--trace-stats') {
      args.traceStats = true;
    } else if (arg === '--prune-traces') {
      args.pruneTraces = true;
    } else if (arg === '--check-providers') {
      args.checkProviders = true;
    } else if (arg === '--capture-trace') {
      args.captureTrace = true;
    } else if (arg.startsWith('--evidence-source=')) {
      args.evidenceSources.push(arg.slice('--evidence-source='.length));
    } else if (arg.startsWith('--reviewers=')) {
      args.reviewers = arg.slice('--reviewers='.length);
      args.reviewersExplicit = true;
    } else if (arg.startsWith('--')) {
      console.warn(`[ask] Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  args.query = positional.join(' ').trim();
  return args;
}

function parseEvidenceSourceDescriptor(descriptor) {
  const match = String(descriptor || '').match(/^([^:]+):(\d+)-(\d+)$/);
  if (!match) {
    throw new Error('--evidence-source must use repo-relative-path:start-end');
  }
  const sourcePath = match[1];
  const segments = sourcePath.split('/');
  if (path.posix.isAbsolute(sourcePath) || sourcePath.includes('\\')
      || segments.includes('..') || segments.includes('.') || segments.some(segment => segment === '')) {
    throw new Error(`Evidence source path must be repo-relative without traversal: ${sourcePath}`);
  }
  const lineStart = Number(match[2]);
  const lineEnd = Number(match[3]);
  if (!Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd)
      || lineStart < 1 || lineEnd < lineStart || lineEnd - lineStart + 1 > 150) {
    throw new Error(`Evidence source range must be inclusive, ordered, and at most 150 lines: ${descriptor}`);
  }
  return { path: sourcePath, line_start: lineStart, line_end: lineEnd };
}

function countExactOccurrences(text, excerpt) {
  if (excerpt === '') return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(excerpt, offset)) !== -1) {
    count += 1;
    offset += excerpt.length;
  }
  return count;
}

function resolveEvidenceSources({ repoRoot, query, descriptors = [] } = {}) {
  const rootRealpath = fs.realpathSync(repoRoot);
  const queryText = String(query || '');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const sources = [];
  const quarantines = [];
  for (const descriptor of descriptors) {
    try {
      const parsed = parseEvidenceSourceDescriptor(descriptor);
      const absPath = path.resolve(rootRealpath, ...parsed.path.split('/'));
      const relative = path.relative(rootRealpath, absPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Evidence source escapes repository: ${parsed.path}`);
      }
      const stat = fs.lstatSync(absPath);
      if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(absPath) !== absPath) {
        throw new Error(`Evidence source must be a regular non-symlink file: ${parsed.path}`);
      }
      const artifact = fs.readFileSync(absPath);
      let text;
      try {
        text = decoder.decode(artifact);
      } catch (error) {
        throw new Error(`Evidence source must be valid UTF-8: ${parsed.path}`);
      }
      const lines = text.split('\n');
      if (text.endsWith('\n')) lines.pop();
      if (parsed.line_end > lines.length) {
        throw new Error(`Evidence source range exceeds ${lines.length} lines: ${descriptor}`);
      }
      const excerpt = lines.slice(parsed.line_start - 1, parsed.line_end).join('\n');
      const occurrences = countExactOccurrences(queryText, excerpt);
      if (occurrences !== 1) {
        throw new Error(`Evidence excerpt ${descriptor} must appear exactly once in the query; found ${occurrences}`);
      }
      if (redactSensitiveText(excerpt) !== excerpt) {
        const error = new Error(`Evidence source contains secret-shaped text and cannot be supplied: ${descriptor}`);
        error.code = 'EVIDENCE_SECRET_DETECTED';
        throw error;
      }
      sources.push(Object.freeze({
        ...parsed,
        artifact_sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
        artifact_bytes: artifact.length,
        excerpt_sha256: crypto.createHash('sha256').update(excerpt, 'utf8').digest('hex'),
        excerpt_bytes: Buffer.byteLength(excerpt, 'utf8'),
        excerpt,
      }));
    } catch (error) {
      if (error.code === 'EVIDENCE_SECRET_DETECTED') throw error;
      quarantines.push(reviewQuarantine({
        unit: 'evidence_descriptor',
        name: descriptor,
        absence: 'evidence_descriptor_absent',
        error,
      }));
    }
  }
  Object.defineProperty(sources, 'quarantines', {
    value: Object.freeze(quarantines),
    enumerable: false,
  });
  return Object.freeze(sources);
}

async function runReviewRechecks({
  prompts,
  client,
  toolAdapter,
  starterContext,
  blastRadius,
  maxIterations,
  maxTokens,
  verbose,
  evidenceSources,
  createProviderAudit,
  runLoop = runReactLoop,
  notify = notifyReviewQuarantines,
} = {}) {
  const rechecks = [];
  const quarantines = [];
  for (const [index, recheckPrompt] of (prompts || []).entries()) {
    const name = `mercury_recheck_${index + 1}`;
    const recheckStarted = Date.now();
    try {
      const recheckProvenance = buildAttestedPromptProvenance(recheckPrompt, evidenceSources);
      const recheck = await runLoop({
        client,
        toolAdapter,
        userQuery: recheckPrompt,
        starterContext,
        traceHint: null,
        blastRadius,
        maxIterations,
        maxTokens,
        verbose,
        providerAudit: createProviderAudit(name),
      });
      recheck.totalLatencyMs = Date.now() - recheckStarted;
      recheck.inputProvenance = recheckProvenance;
      recheck.evidenceSources = evidenceSources;
      rechecks.push(recheck);
    } catch (error) {
      if (isHardReviewBoundaryError(error)) throw error;
      const [quarantine] = await notify([reviewQuarantine({
        unit: 'recheck',
        name,
        absence: 'mercury_recheck_answer_absent',
        error,
        attempts: error.providerAttempts || [],
      })]);
      quarantines.push(quarantine);
    }
  }
  return { rechecks, quarantines };
}

function buildMercuryIntentPrompt(query, reviewIntent = 'adversarial') {
  const text = String(query || '').trim();
  if (reviewIntent === 'architecture') {
    return [
      'MERCURY ARCHITECTURE MODE.',
      'This is not a break-my-fix verdict run and not a commit gate.',
      'Use repo tools to build a broad architecture review with evidence, ownership boundaries, data flow, invariants, build-vs-buy analysis, migration path, risks, and strongest criticisms.',
      'Do not compress into a short answer. If evidence is missing, label the gap instead of inventing current repo facts.',
      '',
      MERCURY_DOCTRINE_PROMPT,
      '',
      text,
    ].join('\n');
  }
  if (reviewIntent === 'planning') {
    return [
      'MERCURY PLANNING MODE.',
      'This is not a break-my-fix verdict run and not a commit gate.',
      'Use repo tools to produce an implementation plan with prior art, ownership boundaries, sequencing, required proofs, rollback shape, risks, and open decisions.',
      'Do not edit code. If evidence is missing, label the gap instead of inventing current repo facts.',
      '',
      MERCURY_DOCTRINE_PROMPT,
      '',
      text,
    ].join('\n');
  }
  return `${MERCURY_DOCTRINE_PROMPT}\n\n${text}`;
}

function optionalPositiveInteger(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalNonNegativeInteger(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function configExactInteger(value, configuredValue, name) {
  if (value == null) return configuredValue;
  const parsed = optionalPositiveInteger(value, name);
  if (parsed !== configuredValue) {
    throw new Error(`${name} must match mercury.config.json value ${configuredValue}`);
  }
  return configuredValue;
}

function usage() {
  console.log('');
  console.log('Mercury Bridge — Ask a question about the OGZPrime codebase');
  console.log('');
  console.log('Usage:');
  console.log('  node trai_brain/mercury-bridge/ask.js "your question here"');
  console.log('  node trai_brain/mercury-bridge/ask.js --agentic "your question here"');
  console.log('');
  console.log('Modes:');
  console.log('  (default)   Single-shot RAG — embed query, retrieve top-K, one Mercury call');
  console.log('  --agentic   ReAct loop — Mercury can grep/open files iteratively (more accurate)');
  console.log('');
  console.log('Flags:');
  console.log(`  --top-k=N              Starter-context chunk count (configured ${config.RETRIEVE_TOP_K})`);
  console.log(`  --max-iterations=N     Agentic only: max tool-call loops (configured ${config.AGENTIC_MAX_ITERATIONS})`);
  console.log(`  --max-tokens=N         Mercury max tokens per turn (agentic ${config.AGENTIC_MAX_TOKENS}, single-shot ${config.SINGLE_SHOT_MAX_TOKENS})`);
  console.log('  --quiet                Suppress progress logs');
  console.log('  --show-chunks          Print retrieved chunk text');
  console.log('  --show-history         Agentic only: print full tool-call trace');
  console.log('  --evidence-source=P:S-E Host-attest a verbatim repo-relative excerpt; repeatable, max 150 lines');
  console.log(`  --adversarial-review   Agentic only: force a Fable (${config.CONSENSUS_MODEL}) adversarial review`);
  console.log('  --no-adversarial-review Agentic only: suppress env/config adversarial review for this run');
  console.log('  --consensus            Agentic only: legacy alias for a Fable review');
  console.log('  --no-consensus         Agentic only: suppress config-default legacy consensus for this run');
  console.log('  --architecture         Agentic only: architecture-review framing; final packet is synthesis, not pass/fail');
  console.log('  --planning             Agentic only: planning/design framing; final packet is a build plan, not pass/fail');
  console.log('  --check-providers      Warm up Mercury and Fable clients, then exit');
  console.log('  --capture-trace        Agentic only: manually store a successful investigation trace');
  console.log('                         RAG/chunk writes are never done by ask.js; run indexer.js explicitly.');
  console.log('');
  console.log('Examples:');
  console.log('  node trai_brain/mercury-bridge/ask.js "What does StopLossChecker do?"');
  console.log('  node trai_brain/mercury-bridge/ask.js --agentic --show-history "Find the partial-close contract bug"');
  console.log('');
}

function parseGitNameList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitNameList(repoRoot, args) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseGitNameList(output);
}

function selectCurrentChangeNames({ cached = [], working = [], untracked = [] } = {}) {
  if (cached.length > 0) {
    return [...new Set(cached)].sort();
  }
  return [...new Set([...working, ...untracked])].sort();
}

function currentChangedFiles(repoRoot = config.REPO_ROOT) {
  return selectCurrentChangeNames({
    cached: gitNameList(repoRoot, ['diff', '--name-only', '--cached']),
    working: gitNameList(repoRoot, ['diff', '--name-only']),
    untracked: gitNameList(repoRoot, ['ls-files', '--others', '--exclude-standard', '--', ...UNTRACKED_SERENA_SOURCE_PATHS]),
  });
}

function currentChangeDiff(repoRoot = config.REPO_ROOT) {
  const cached = execFileSync('git', ['diff', '--cached', '--no-ext-diff'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
  if (cached.trim()) return cached;
  return execFileSync('git', ['diff', '--no-ext-diff'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function normalizeRepoRelativePath(repoRoot, relPath) {
  if (!relPath || typeof relPath !== 'string') return null;
  if (relPath.startsWith('/') || relPath.split('/').includes('..')) return null;
  const absPath = path.resolve(repoRoot, relPath);
  const normalizedRoot = path.resolve(repoRoot);
  if (absPath !== normalizedRoot && !absPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    return null;
  }
  return path.relative(normalizedRoot, absPath).replace(/\\/g, '/');
}

function isSerenaSourcePath(relPath) {
  return typeof relPath === 'string'
    && relPath.endsWith('.js')
    && !relPath.endsWith('.bak')
    && !config.isPathIgnoredByMercury(relPath);
}

async function buildCurrentChangeBlastRadius({
  repoRoot = config.REPO_ROOT,
  changedFiles = null,
  currentChangedFilesFn = currentChangedFiles,
  currentDiffFn = currentChangeDiff,
  existsFn = fs.existsSync,
  getBlastRadiusFn = getBlastRadius,
  formatForMercuryFn = formatForMercury,
  findReferencesFn = null,
} = {}) {
  let candidates;
  try {
    candidates = changedFiles || currentChangedFilesFn(repoRoot);
  } catch (err) {
    return {
      text: null,
      meta: [],
      errors: [
        {
          file: '<current_changes>',
          error: err.message,
        },
      ],
      source: 'current_changes',
    };
  }
  const normalizedCandidates = [];
  const targetFiles = [];
  const errors = [];
  for (const candidate of candidates) {
    const relPath = normalizeRepoRelativePath(repoRoot, candidate);
    if (!relPath) continue;
    normalizedCandidates.push(relPath);
    if (!relPath.endsWith('.js') || relPath.endsWith('.bak')) continue;
    if (config.isPathIgnoredByMercury(relPath)) {
      errors.push({ file: relPath, error: 'AST scan blocked by mercury.ignore' });
      continue;
    }
    if (!existsFn(path.join(repoRoot, relPath))) {
      errors.push({ file: relPath, error: 'AST scan target is absent from the working tree' });
      continue;
    }
    targetFiles.push(relPath);
  }

  let diff = '';
  let referenceNames = [];
  try {
    diff = currentDiffFn(repoRoot);
    referenceNames = extractDiffReferenceNames(diff);
  } catch (err) {
    errors.push({ file: '<current_diff>', error: err.message });
  }

  const sections = [];
  const meta = [];
  for (const targetFile of targetFiles) {
    let blastRadius;
    try {
      blastRadius = await getBlastRadiusFn(targetFile);
    } catch (err) {
      errors.push({
        file: targetFile,
        error: err.message,
      });
      continue;
    }
    let formatted;
    try {
      formatted = formatForMercuryFn(blastRadius);
    } catch (err) {
      errors.push({
        file: targetFile,
        error: `format failed: ${err.message}`,
      });
      continue;
    }
    meta.push({
      file: targetFile,
      callerCount: blastRadius.callerCount,
      riskLevel: blastRadius.riskLevel,
      latencyMs: blastRadius.latencyMs,
    });
    sections.push(`## ${targetFile}\n${formatted}`);
  }

  const referenceScans = [];
  for (const name of referenceNames) {
    if (typeof findReferencesFn !== 'function') {
      errors.push({ symbol: name, error: 'find_references adapter unavailable' });
      continue;
    }
    try {
      const result = await findReferencesFn(name);
      if (result && result.error) {
        errors.push({ symbol: name, error: result.error });
      } else {
        referenceScans.push({
          symbol: name,
          source: result && result.source || null,
          precision: result && result.precision || null,
          total: result && Number.isInteger(result.total) ? result.total : null,
          truncated: !!(result && result.truncated),
        });
        sections.push(`## find_references ${name}\n${JSON.stringify(result)}`);
      }
    } catch (err) {
      errors.push({ symbol: name, error: err.message });
    }
  }

  sections.unshift([
    '## CURRENT CHANGE CANDIDATE SET',
    `Changed files: ${normalizedCandidates.length}`,
    ...normalizedCandidates.map(file => `- ${file}`),
    `Touched env/config names: ${referenceNames.length}`,
    ...referenceNames.map(name => `- ${name}`),
  ].join('\n'));

  return {
    text: sections.length > 0 ? sections.join('\n\n') : null,
    meta,
    errors,
    changedFiles: normalizedCandidates,
    changedFileCount: normalizedCandidates.length,
    diff,
    referenceNames,
    referenceScans,
    source: 'current_changes',
  };
}

function panelVerdict(answer, parsed = null) {
  if (parsed) {
    const verdict = String(parsed.verdict || '').toLowerCase();
    if (['pass', 'no_break_found'].includes(verdict) && parsed.blocking !== true) return 'pass';
    if (['found_break', 'blocked'].includes(verdict)) return 'found_break';
    return 'cannot_verify';
  }
  const text = String(answer || '').toLowerCase();
  if (/\b(no concrete break|no break found|did not find|no reachable break)\b/.test(text)) return 'pass';
  if (/\b(found_break|concrete break|reachable break|blocking defect)\b/.test(text)) return 'found_break';
  return 'cannot_verify';
}

function reviewerAbsence(error) {
  const message = String(error && error.message || error || '');
  if (/quota|rate.?limit|HTTP 402|HTTP 429|usage.limit/i.test(message)) return 'quota_or_rate_limit';
  if (/auth|credential|api key|HTTP 401|HTTP 403/i.test(message)) return 'reviewer_credentials_absent';
  return 'reviewer_answer_absent';
}

function priorPanelResult(query, outputs) {
  const successful = [...outputs.values()].filter(output => output && output.answer);
  return {
    answer: successful.length > 0
      ? successful.map(output => `[${output.id}]\n${output.answer}`).join('\n\n')
      : `No prior reviewer output. Independently review the original query:\n${query}`,
    termination: successful.length > 0 ? 'answer_given' : 'not_selected',
    iterations: 0,
    toolTelemetry: null,
    answerQuality: { flags: [], evidence: [] },
    panelSourceLabel: 'Prior selected reviewer evidence',
    panelSourcePath: 'panel://prior-reviewer-evidence',
  };
}

function panelSeatMetadata(id, output) {
  const attempts = id === 'mercury'
    ? (output.providerAttempts || [])
    : (output.attempts || (output.stageReceipt ? [output.stageReceipt] : []));
  const appliedModels = attempts.flatMap(attempt => attempt.applied_models || (attempt.applied_model ? [attempt.applied_model] : []));
  const identityConflict = attempts.some(attempt => attempt.identity_posture && attempt.identity_posture.status === 'identity_conflict');
  const fallbackTransitions = attempts.flatMap(attempt => attempt.model_transitions || []);
  if (id === 'fable' && attempts.some(attempt => attempt.role === 'opus_challenger')) {
    fallbackTransitions.push({
      transition_type: 'fable_seat_fallback',
      from_model: 'fable',
      to_model: 'opus',
      classification: attempts[0] && attempts[0].fallback_classification || null,
    });
  }
  return {
    provider: output.provider || (attempts[attempts.length - 1] && attempts[attempts.length - 1].requested_provider) || null,
    requestedModel: output.model || (attempts[attempts.length - 1] && attempts[attempts.length - 1].requested_model) || null,
    appliedModels: [...new Set(appliedModels)],
    fallbackTransitions,
    unavailable: false,
    failed: false,
    identityConflict,
    verdict: panelVerdict(output.answer, output.parsed),
    doctrineReview: output.doctrineReview || null,
    evidenceChecksPassed: !identityConflict
      && !(output.quarantines || []).some(quarantine => quarantine && quarantine.load_bearing === true),
  };
}

// ─────────────────────────────────────────────────────────────
// Agentic mode — hybrid retrieval (current semantic-only) + ReAct loop
// ─────────────────────────────────────────────────────────────

async function runAgentic(query, opts) {
  const startedAt = new Date();
  const rawRunId = createRawRunId(startedAt);
  const reviewerSelection = opts.reviewerSelection || await resolveReviewerSelection({
    explicit: opts.reviewersExplicit ? opts.reviewers : null,
    interactive: false,
    defaultReviewers: reviewModeRequested(opts)
      ? REVIEWER_REGISTRY.map(reviewer => reviewer.id)
      : ['mercury'],
  });
  const createProviderAudit = stage => ({
    stage,
    attempts: [],
    record(metadata, context) {
      const attempt = this.attempts.length + 1;
      const rawOutput = writeRawProviderOutput({
        repoRoot: config.REPO_ROOT,
        runId: rawRunId,
        stage: this.stage,
        attempt,
        bytes: metadata.rawResponse || Buffer.alloc(0),
      });
      return {
        attempt,
        stage: this.stage,
        status: context.status,
        retry: context.retry,
        requested_provider: metadata.provider || config.MERCURY_LLM_PROVIDER,
        requested_model: metadata.requestedModel || config.MERCURY_LLM_MODEL,
        applied_model: metadata.appliedModel || null,
        started_at: metadata.startedAt || null,
        finished_at: metadata.finishedAt || null,
        latency_ms: metadata.latencyMs == null ? null : metadata.latencyMs,
        termination: metadata.termination || null,
        parse_status: metadata.parseStatus || null,
        raw_output: rawOutput,
        error: context.error || null,
        repo_adjudication: { status: 'pending', authority: 'live_repo_required' },
      };
    },
  });
  const providerAudit = createProviderAudit('mercury');
  const persistReviewRaw = (stage, attempt, bytes) => writeRawProviderOutput({
    repoRoot: config.REPO_ROOT,
    runId: rawRunId,
    stage,
    attempt,
    bytes,
  });
  const verbose = !opts.quiet;
  const maxIterations = configExactInteger(opts.maxIterations, config.AGENTIC_MAX_ITERATIONS, '--max-iterations');
  const maxTokens = configExactInteger(opts.maxTokens, config.AGENTIC_MAX_TOKENS, '--max-tokens');
  const reviewIntent = opts.reviewIntent || 'adversarial';
  const mercuryQuery = buildMercuryIntentPrompt(query, reviewIntent);
  const evidenceSources = resolveEvidenceSources({
    repoRoot: config.REPO_ROOT,
    query,
    descriptors: opts.evidenceSources || [],
  });
  const evidenceQuarantines = await notifyReviewQuarantines(evidenceSources.quarantines);
  const inputProvenance = buildAttestedPromptProvenance(mercuryQuery, evidenceSources);

  // Route the query unless caller has overridden
  const route = routeQuery(query);
  const mode = opts.retrievalMode || route.mode;
  const boostType = opts.boostType != null ? opts.boostType : route.boostType;
  const explicitTopK = optionalNonNegativeInteger(opts.topK, '--top-k');

  // Starter context policy: respect --top-k if caller set it, otherwise route decides
  let topK;
  if (explicitTopK != null) {
    topK = explicitTopK;
  } else if (route.starterContextPolicy === 'skip') {
    topK = 0;
  } else {
    topK = config.RETRIEVE_TOP_K;
  }

  // 1. Retrieve starter context from the existing indexed corpus
  const store = new MongoStore();
  let storeConnected = false;
  let autoBlastRadius = null;

  try {
    await store.connect();
    storeConnected = true;

    const health = await store.healthCheck();
    if (!health.ok) {
      throw new Error(`MongoDB health check failed: ${health.error}`);
    }
    if (health.chunkCount === 0) {
      throw new Error('No chunks in index. Run indexer.js first.');
    }

    // Index freshness for the receipt: a stale RAG index silently narrows
    // coverage routing. Surface it on every dispatch, not on archaeology.
    let indexFreshness = null;
    try {
      const latestStats = await store.stats.find().sort({ _id: -1 }).limit(1).toArray();
      if (latestStats.length > 0) {
        const statsDoc = latestStats[0];
        indexFreshness = {
          indexed_at: (statsDoc.index_freshness && statsDoc.index_freshness.indexed_at) || statsDoc.run_at || null,
          index_head_sha: (statsDoc.index_freshness && statsDoc.index_freshness.head_sha) || null,
          files_walked: statsDoc.files_walked == null ? null : statsDoc.files_walked,
          chunks: statsDoc.chunks_embedded == null ? statsDoc.chunks_produced : statsDoc.chunks_embedded,
        };
      }
    } catch (freshnessErr) {
      indexFreshness = { error: freshnessErr.message };
    }

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Index contains ${health.chunkCount} chunks`);
      console.log(`[MERCURY-BRIDGE] Query router: type=${route.queryType} mode=${mode} boost=${boostType || 'none'} top-k=${topK}`);
      console.log(`[MERCURY-BRIDGE] Rationale: ${route.rationale}`);
    }

    let starterContext = [];
    if (topK > 0) {
      if (verbose) console.log('[MERCURY-BRIDGE] Embedding query for starter context...');
      const queryEmbedding = await embedText(query);
      starterContext = await retrieveTopK(store, queryEmbedding, topK, query, {
        retrievalMode: mode,
        boostType: boostType,
      });
    } else {
      if (verbose) console.log('[MERCURY-BRIDGE] Starter context: skipped (router policy=skip)');
    }

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Starter context: ${starterContext.length} chunks`);
      starterContext.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.file_path}:${c.start_line}-${c.end_line} ` +
          `(${c.kind}: ${c.name || 'unnamed'}) sim=${c.similarity.toFixed(3)}`);
      });
    }

    // 2. Investigation trace memory — retrieve prior hint if available
    let traceHintText = null;
    let traceUsed = null;
    if (config.TRACE_MEMORY_ENABLED) {
      await ensureTraceIndexes(store);
      await evictStaleTraces({ store, verbose });

      const traceResult = await retrieveSimilarTrace({ store, query });
      if (traceResult) {
        traceHintText = formatTraceAsHint(traceResult);
        traceUsed = traceResult.trace;
        if (verbose) {
          console.log(`[MERCURY-BRIDGE] Prior trace hint found (similarity: ${traceResult.similarity.toFixed(2)}, ${traceResult.trace.iterations} iters, used ${traceResult.trace.usage_count}x)`);
        }
      } else if (verbose) {
        console.log('[MERCURY-BRIDGE] No similar prior trace found');
      }
    }

    // 3. Build the tool adapter with both repo access and mongo (for get_chunk)
    const toolAdapter = createToolAdapter({
      repoRoot: config.REPO_ROOT,
      mongoStore: store,
    });

    if (verbose) {
      console.log(`[MERCURY-BRIDGE] Tool adapter ready. Tools: ${Object.keys(toolAdapter.tools).join(', ')}`);
    }

    let blastRadius = opts.blastRadius || null;
    if (!blastRadius) {
      autoBlastRadius = await buildCurrentChangeBlastRadius({
        findReferencesFn: symbol => toolAdapter.execute('find_references', { symbol }),
      });
      blastRadius = autoBlastRadius.text;
      if (verbose) {
        if (autoBlastRadius.meta.length > 0) {
          console.log(`[MERCURY-BRIDGE] Serena current-change blast radius: ${autoBlastRadius.meta.length} file(s)`);
          autoBlastRadius.meta.forEach((meta) => {
            console.log(`  ${meta.file}: ${meta.callerCount} caller(s), risk=${meta.riskLevel}, ${meta.latencyMs}ms`);
          });
        } else {
          console.log('[MERCURY-BRIDGE] Serena current-change blast radius: no changed JS files to scan');
        }
        if (autoBlastRadius.errors.length > 0) {
          console.log(`[MERCURY-BRIDGE] Serena current-change blast radius unavailable for ${autoBlastRadius.errors.length} file(s)`);
          autoBlastRadius.errors.forEach((entry) => {
            console.log(`  ${entry.file}: ${entry.error}`);
          });
        }
      }
    }

    // 4. Dispatch exactly the selected registry seats in declared order.
    let client = null;
    let mercuryResult = null;
    let fableReview = null;
    let fableEvidencePassed = false;
    let kimiReview = null;
    const outputs = new Map();
    const panelRun = await runReviewerPanel({
      selected: reviewerSelection.selected,
      isHardStop: isHardReviewBoundaryError,
      runSeat: async (reviewer) => {
        if (verbose) console.log(`[MERCURY-BRIDGE] Starting reviewer seat: ${reviewer.label}`);
        if (reviewer.id === 'mercury') {
          if (!client) {
            client = createMercuryLlmClient({ systemPrompt: config.AGENTIC_SYSTEM_PROMPT });
            await client.initialize();
          }
          const prior = priorPanelResult(query, outputs);
          const userQuery = outputs.size === 0
            ? mercuryQuery
            : `${mercuryQuery}\n\nPrior selected reviewer outputs to investigate:\n${prior.answer}`;
          const t0 = Date.now();
          const seatResult = await runReactLoop({
            client, toolAdapter, userQuery, starterContext, traceHint: traceHintText,
            blastRadius, maxIterations, maxTokens, verbose, providerAudit,
          });
          ensureReviewerAnswer(seatResult, 'mercury');
          mercuryResult = seatResult;
          mercuryResult.totalLatencyMs = Date.now() - t0;
          mercuryResult.doctrineReview = assessDoctrineReview({
            answer: mercuryResult.answer,
            changedFiles: autoBlastRadius ? autoBlastRadius.changedFiles : [],
            diff: autoBlastRadius ? autoBlastRadius.diff : '',
            telemetry: mercuryResult.toolTelemetry,
            autoScan: autoBlastRadius,
            evidenceSources,
            reviewerId: 'mercury',
          });
          mercuryResult.reviewQuarantines = await notifyReviewQuarantines(
            mercuryResult.doctrineReview.namedAbsences.map(absence => reviewQuarantine({
              unit: 'mercury_doctrine',
              name: absence,
              absence,
            }))
          );
          outputs.set('mercury', { id: 'mercury', ...mercuryResult });
          const metadata = panelSeatMetadata('mercury', mercuryResult);
          metadata.evidenceChecksPassed = !resultHasToolFailure(mercuryResult)
            && !autoBlastRadiusFailed(autoBlastRadius)
            && mercuryResult.doctrineReview.authorityCeiling !== 'UNVERIFIED';
          return metadata;
        }

        if (reviewer.id === 'fable') {
          const prior = mercuryResult || priorPanelResult(query, outputs);
          fableReview = await runFableAdversarialReview({
            query, mercuryResult: prior, reviewIntent,
            persistRaw: persistReviewRaw, evidenceSources,
          });
          if (fableReview.ok !== true) {
            const error = new Error(fableReview.error && fableReview.error.message || 'Fable answer absent');
            error.absence = reviewerAbsence(error);
            error.reviewFailure = fableReview;
            throw error;
          }
          fableReview.mode = reviewModeRequested(opts) || 'adversarial_review';
          fableReview.doctrineReview = assessDoctrineReview({
            answer: fableReview.answer,
            changedFiles: autoBlastRadius ? autoBlastRadius.changedFiles : [],
            diff: autoBlastRadius ? autoBlastRadius.diff : '',
            telemetry: mercuryResult ? mercuryResult.toolTelemetry : {},
            autoScan: autoBlastRadius,
            evidenceSources,
            reviewerId: 'fable',
          });
          fableReview.quarantines = [
            ...(fableReview.quarantines || []),
            ...fableReview.doctrineReview.namedAbsences.map(absence => reviewQuarantine({
              unit: 'fable_doctrine',
              name: absence,
              absence,
            })),
          ];
          fableReview.quarantines = await notifyReviewQuarantines(fableReview.quarantines || []);
          if (mercuryResult && kimiTieBreakerRequired(fableReview, reviewIntent)) {
            const recheckPrompts = buildMercuryRecheckPrompts({
              originalQuery: query,
              mercuryAnswer: mercuryResult.answer,
              fableAnswer: fableReview.answer,
              parsedReview: fableReview.parsed,
              evidenceSources,
            }).slice(0, config.ADVERSARIAL_REVIEW_MAX_RECHECKS);
            fableReview.recheckPrompts = recheckPrompts;
            fableReview.recheckPrompt = recheckPrompts[0] || null;
            const recheckRun = await runReviewRechecks({
              prompts: recheckPrompts, client, toolAdapter, starterContext, blastRadius,
              maxIterations, maxTokens, verbose, evidenceSources, createProviderAudit,
            });
            fableReview.rechecks = recheckRun.rechecks;
            fableReview.recheck = fableReview.rechecks[0] || null;
            fableReview.quarantines.push(...recheckRun.quarantines);
          }
          outputs.set('fable', { id: 'fable', ...fableReview });
          const metadata = panelSeatMetadata('fable', fableReview);
          fableEvidencePassed = metadata.evidenceChecksPassed
            && !!(mercuryResult || evidenceSources.length > 0)
            && fableReview.doctrineReview.authorityCeiling !== 'UNVERIFIED';
          metadata.evidenceChecksPassed = fableEvidencePassed;
          return metadata;
        }

        const prior = mercuryResult || priorPanelResult(query, new Map());
        const review = fableReview || {
          answer: 'No Fable seat selected.',
          parsed: { verdict: 'not_selected', blocking: false },
          rechecks: [],
          recheckPrompts: [],
          panelSourceLabel: 'Fable (not selected)',
          panelSourcePath: 'panel://fable-not-selected',
        };
        kimiReview = await runKimiFinalAdjudication({
          query, mercuryResult: prior, review,
          persistRaw: persistReviewRaw, evidenceSources,
        });
        kimiReview.doctrineReview = assessDoctrineReview({
          answer: kimiReview.answer,
          changedFiles: autoBlastRadius ? autoBlastRadius.changedFiles : [],
          diff: autoBlastRadius ? autoBlastRadius.diff : '',
          telemetry: mercuryResult ? mercuryResult.toolTelemetry : {},
          autoScan: autoBlastRadius,
          evidenceSources,
          reviewerId: 'kimi',
        });
        kimiReview.quarantines = [
          ...(kimiReview.quarantines || []),
          ...kimiReview.doctrineReview.namedAbsences.map(absence => reviewQuarantine({
            unit: 'kimi_doctrine',
            name: absence,
            absence,
          })),
        ];
        kimiReview.quarantines = await notifyReviewQuarantines(kimiReview.quarantines || []);
        outputs.set('kimi', { id: 'kimi', ...kimiReview });
        const metadata = panelSeatMetadata('kimi', kimiReview);
        metadata.evidenceChecksPassed = metadata.evidenceChecksPassed
          && !!(mercuryResult || evidenceSources.length > 0 || fableEvidencePassed)
          && kimiReview.doctrineReview.authorityCeiling !== 'UNVERIFIED';
        return metadata;
      },
    });

    const failedQuarantines = [];
    for (const seat of panelRun.seats.filter(seat => seat.status === 'failed')) {
      const failedOutput = seat.error && (seat.error.reviewFailure || (seat.error.stageAttempt ? {
        attempts: [seat.error.stageAttempt],
        stageReceipt: seat.error.stageAttempt,
      } : null));
      const failedMetadata = failedOutput
        ? panelSeatMetadata(seat.id, failedOutput)
        : (seat.id === 'mercury' ? panelSeatMetadata('mercury', { providerAttempts: providerAudit.attempts }) : null);
      seat.absence = seat.absence === 'reviewer_answer_absent' ? reviewerAbsence(seat.error) : seat.absence;
      failedQuarantines.push(reviewQuarantine({
        unit: 'reviewer_seat', name: seat.id, absence: seat.absence, error: seat.error,
      }));
      seat.failed = true;
      seat.unavailable = true;
      seat.error = seat.error && seat.error.message ? { name: seat.error.name, message: seat.error.message } : null;
      seat.provider = failedMetadata && failedMetadata.provider || null;
      seat.requestedModel = failedMetadata && failedMetadata.requestedModel || null;
      seat.appliedModels = failedMetadata ? failedMetadata.appliedModels : [];
      seat.fallbackTransitions = failedMetadata ? failedMetadata.fallbackTransitions : [];
      seat.verdict = null;
      seat.evidenceChecksPassed = false;
    }
    const notifiedFailures = await notifyReviewQuarantines(failedQuarantines);

    let result = mercuryResult;
    if (!result) {
      const firstOutput = reviewerSelection.selected.map(id => outputs.get(id)).find(Boolean);
      result = firstOutput ? {
        answer: firstOutput.answer,
        termination: 'answer_given',
        iterations: 0,
        totalLatencyMs: firstOutput.latencyMs || 0,
        history: [],
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
        toolsAvailable: [],
        providerAttempts: [],
        answerQuality: { flags: [], evidence: [] },
      } : {
        answer: 'No selected reviewer produced an answer.',
        termination: 'reviewers_unavailable',
        iterations: 0,
        totalLatencyMs: 0,
        history: [],
        toolTelemetry: { byTool: {}, filesOpened: [], runCheckArtifacts: [], runChecks: [] },
        toolsAvailable: [],
        providerAttempts: [],
        answerQuality: { flags: [], evidence: [] },
      };
    }
    result.evidenceSources = evidenceSources;
    result.reviewQuarantines = [
      ...evidenceQuarantines,
      ...(Array.isArray(result.reviewQuarantines) ? result.reviewQuarantines : []),
      ...notifiedFailures,
    ];
    result.inputProvenance = inputProvenance;
    result.reviewerPanel = { ...reviewerSelection, ...panelRun };
    if (autoBlastRadius) result.serenaBlastRadius = autoBlastRadius;
    if (fableReview) {
      if (kimiReview) fableReview.finalReview = kimiReview;
      result.adversarialReview = fableReview;
      result.consensus = fableReview;
      result.adversarialReviewPacket = formatAdversarialReviewPacket({
        originalQuery: query, mercuryResult: mercuryResult || priorPanelResult(query, outputs),
        review: fableReview, reviewIntent,
      });
    }

    // 6. Mark trace as used if we injected one
    if (mercuryResult && traceUsed && result.termination === 'answer_given') {
      await markTraceUsed({ store, traceId: traceUsed._id });
    }

    // 7. Capture successful investigation trace (with dedup + quality)
    if (mercuryResult && config.TRACE_MEMORY_ENABLED && result.termination === 'answer_given') {
      const toolCallSequence = (result.history || []).map(h => ({
        name: h.toolName,
        args: h.toolArgs,
        result_summary: JSON.stringify(h.toolResult || {}).slice(0, 500),
      }));

      const captureResult = await captureTrace({
        store,
        query,
        toolCallSequence,
        finalAnswer: result.answer,
        captureRequested: opts.captureTrace === true,
        metadata: {
          iterations: result.iterations,
          latencyMs: result.totalLatencyMs,
          termination: result.termination,
          captureRequested: opts.captureTrace === true,
        },
      });

      if (verbose) {
        if (captureResult.captured) {
          console.log(`[MERCURY-BRIDGE] Trace ${captureResult.action} (quality=${(captureResult.new_quality || captureResult.quality || 0).toFixed(1)})`);
        } else {
          const reason = captureResult.reason || captureResult.action;
          console.log(`[MERCURY-BRIDGE] Trace not captured: ${reason}`);
          if (reason === 'manual_capture_not_requested') {
            console.log('[MERCURY-BRIDGE] Manual capture mode: rerun with --capture-trace only if this answer should teach trace memory.');
          }
        }
      }
    }

    const ledgerEntry = buildRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      query,
      opts: { ...opts, maxIterations, maxTokens },
      result,
      startedAt,
      finishedAt: new Date(),
      autoBlastRadius,
      evidenceSources,
      inputProvenance,
    });
    result.runLedger = writeRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      entry: ledgerEntry,
    });
    // Keep the full ledger entry on the result: the stdout receipt must carry
    // everything the ledger knows (verdict, quality evidence, tool failures) —
    // the ledger dir is gitignored and bridge-blocked for session reads.
    result.runLedgerEntry = ledgerEntry;
    result.indexFreshness = indexFreshness;

    return result;

  } catch (err) {
    const ledgerEntry = buildRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      query,
      opts: { ...opts, maxIterations, maxTokens },
      error: err,
      startedAt,
      finishedAt: new Date(),
      autoBlastRadius,
      evidenceSources,
      inputProvenance,
    });
    err.mercuryRunLedger = writeRunLedgerEntry({
      repoRoot: config.REPO_ROOT,
      entry: ledgerEntry,
    });
    throw err;
  } finally {
    if (storeConnected) {
      await store.disconnect();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Dispatch receipt — everything the run ledger knows, in stdout,
// every dispatch, quiet mode included. The ledger dir is gitignored
// and bridge-blocked; a receipt that hides in it is not a receipt.
// ─────────────────────────────────────────────────────────────

function printDispatchReceipt(result) {
  const entry = result.runLedgerEntry || {};
  console.log('');
  console.log('═══ RECEIPT ═══');
  console.log(`verdict:         ${entry.verdict || 'unknown'}`);
  const panel = entry.reviewer_panel;
  if (panel) {
    console.log(`reviewers:       ${panel.selected.join(',')} (${panel.source})`);
    console.log(`unselected:      ${panel.unselected.length > 0 ? panel.unselected.join(',') : 'none'}`);
    console.log(`authority:       ${panel.authority.ceiling} agreement=${panel.authority.agreement ? 'yes' : 'no'} qualifying=${panel.authority.qualifyingSeats}`);
    for (const seat of panel.seats) {
      console.log(`  - ${seat.id}: ${seat.status} provider=${seat.provider || 'unavailable'} models=${(seat.appliedModels || []).join(',') || 'none'}${seat.absence ? ` absence=${seat.absence}` : ''}`);
    }
  }

  const doctrine = entry.doctrine_review;
  if (doctrine) {
    console.log(`doctrine:        ${doctrine.authorityCeiling} candidate=${doctrine.candidateSet ? `${doctrine.candidateSet.examined}/${doctrine.candidateSet.total}` : 'absent'}`);
    console.log(`named absences:  ${(doctrine.namedAbsences || []).join(',') || 'none'}`);
    console.log(`named breaks:    ${(doctrine.namedBreaks || []).join(',') || 'none'}`);
  }

  const qualityFlags = Array.isArray(entry.answer_quality) ? entry.answer_quality : [];
  const qualityEvidence = Array.isArray(entry.answer_quality_evidence) && entry.answer_quality_evidence.length > 0
    ? entry.answer_quality_evidence
    : qualityFlags.map((flag) => ({ flag, evidence: null }));
  if (qualityFlags.length === 0) {
    console.log('quality flags:   none');
  } else {
    for (const item of qualityEvidence) {
      console.log(`quality flag:    ${item.flag} — ${item.evidence ? `"${item.evidence}"` : '(no quote captured)'}`);
    }
  }

  const runChecks = Array.isArray(entry.run_checks) ? entry.run_checks : [];
  const assertsWithoutExecution = runChecks.length === 0
    && qualityFlags.some((flag) => /unsupported|uncited/.test(flag));
  console.log(`run checks:      ${runChecks.length} executed${assertsWithoutExecution ? ' — answer asserts outcomes with no execution backing' : ''}`);

  const toolsInvoked = Array.isArray(entry.tools_invoked) ? entry.tools_invoked : [];
  const failedCalls = [];
  let totalCalls = 0;
  for (const tool of toolsInvoked) {
    totalCalls += tool.calls || 0;
    for (const call of tool.call_details || []) {
      if (call.status === 'failed') {
        const reason = call.result && call.result.error ? call.result.error : 'failed';
        failedCalls.push(`${tool.name}(${JSON.stringify(call.args)}): ${reason}`);
      }
    }
  }
  console.log(`tool failures:   ${failedCalls.length}/${totalCalls}`);
  failedCalls.forEach((line) => console.log(`  - ${line}`));
  if (result.toolTelemetry) {
    console.log(`tool calls:      ${formatToolTelemetry(result.toolTelemetry)}`);
  }

  const sourceRefs = entry.source_refs || {};
  const blastFiles = Array.isArray(sourceRefs.auto_blast_radius_files) ? sourceRefs.auto_blast_radius_files.length : 0;
  const blastErrors = Array.isArray(sourceRefs.auto_blast_radius_errors) ? sourceRefs.auto_blast_radius_errors : [];
  console.log(`blast radius:    ${blastFiles} file(s) scanned, ${blastErrors.length} error(s)`);
  blastErrors.forEach((blastError) => console.log(`  - ${blastError.file}: ${blastError.error}`));

  const reviewEntry = entry.adversarial_review;
  if (!reviewEntry) {
    console.log('review layer:    not requested');
  } else if (reviewEntry.ok) {
    console.log(`review layer:    ok — ${reviewEntry.mode || 'adversarial_review'} verdict=${reviewEntry.effective_verdict || 'n/a'}`);
    if (reviewEntry.final_review) {
      const final = reviewEntry.final_review;
      const finalStatus = final.ok ? 'ok' : 'FAILED';
      console.log(`final adjud.:    ${finalStatus} — ${final.mode || 'kimi_final_adjudication'} verdict=${final.effective_verdict || 'n/a'}`);
      const sharedSupport = final.parsed && (final.parsed.consensus || final.parsed.sharedConclusion);
      if (sharedSupport) {
        console.log(`shared support:  ${sharedSupport}`);
      }
      if (final.parsed && final.parsed.contradictions && !/^none\b/i.test(final.parsed.contradictions)) {
        console.log(`contradictions:  ${final.parsed.contradictions}`);
      }
      if (final.parsed && final.parsed.blindSpots && !/^none\b/i.test(final.parsed.blindSpots)) {
        console.log(`blind spots:     ${final.parsed.blindSpots}`);
      }
    }
  } else {
    const reviewError = reviewEntry.error && reviewEntry.error.message
      ? reviewEntry.error.message
      : JSON.stringify(reviewEntry.error);
    console.log(`review layer:    FAILED — ${reviewError}`);
  }

  const quarantines = Array.isArray(entry.review_quarantines) ? entry.review_quarantines : [];
  console.log(`quarantines:     ${quarantines.length}`);
  quarantines.forEach((item) => {
    const notification = item.ntfy || {};
    console.log(`  - ${item.unit}:${item.name} absence=${item.absence} load-bearing=${item.load_bearing === true ? 'yes' : 'no'} ntfy=max/${notification.status || 'unrecorded'}`);
    if (notification.absence) console.log(`    notification absence=${notification.absence}`);
  });

  const dirty = String(entry.dirty_status_summary || '').trim();
  console.log(dirty
    ? `tree state:      DIRTY — ${dirty.split('\n').map((line) => line.trim()).join(', ')}`
    : 'tree state:      clean');

  const freshness = result.indexFreshness;
  if (freshness && !freshness.error) {
    const idxSha = String(freshness.index_head_sha || '').slice(0, 8) || 'unknown';
    const headSha = String(entry.head_sha || '').slice(0, 8) || 'unknown';
    const indexedAt = freshness.indexed_at ? new Date(freshness.indexed_at) : null;
    const staleDays = indexedAt && !Number.isNaN(indexedAt.getTime())
      ? Math.floor((Date.now() - indexedAt.getTime()) / 86400000)
      : null;
    const staleLabel = staleDays == null
      ? ''
      : ` (${staleDays}d ${idxSha !== 'unknown' && idxSha === headSha ? 'old, same head' : 'stale'})`;
    console.log(`index freshness: indexed ${freshness.indexed_at || 'unknown'} @ ${idxSha} — HEAD ${headSha}${staleLabel}`);
  } else {
    console.log(`index freshness: unavailable${freshness && freshness.error ? ` (${freshness.error})` : ''}`);
  }

  if (result.runLedger) {
    console.log(`run ledger:      ${result.runLedger.citation}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Flags that don't require a query
  try {
    if (args.traceStats) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const stats = await getTraceStats(store);
      console.log('Trace memory stats:');
      console.log(`  total:       ${stats.total}`);
      console.log(`  used:        ${stats.used}`);
      console.log(`  protected:   ${stats.protected}`);
      console.log(`  unused:      ${stats.unused}`);
      console.log(`  avg quality: ${stats.avg_quality.toFixed(2)}`);
      await store.disconnect();
      return;
    }

    if (args.pruneTraces) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const result = await evictStaleTraces({ store, verbose: true });
      console.log(`Eviction result: ${JSON.stringify(result)}`);
      await store.disconnect();
      return;
    }

    if (args.checkProviders) {
      const result = await runProviderPreflight({ repoRoot: config.REPO_ROOT });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }

  if (!args.query) {
    usage();
    process.exit(1);
  }

  try {
    // --explain-trace: print trace hint and exit
    if (args.explainTrace) {
      const store = new MongoStore();
      await store.connect();
      await ensureTraceIndexes(store);
      const traceResult = await retrieveSimilarTrace({ store, query: args.query });
      if (traceResult) {
        console.log(`Similarity: ${traceResult.similarity.toFixed(3)}`);
        console.log(`Prior query: "${traceResult.trace.query}"`);
        console.log(`Iterations: ${traceResult.trace.iterations}`);
        console.log(`Quality: ${traceResult.trace.quality_score.toFixed(1)}`);
        console.log(`Usage count: ${traceResult.trace.usage_count}`);
        console.log(`Tool calls: ${traceResult.trace.tool_call_sequence.length}`);
        console.log('');
        console.log(formatTraceAsHint(traceResult));
      } else {
        console.log('No similar prior trace found (threshold: ' + config.TRACE_INJECT_THRESHOLD + ')');
      }
      await store.disconnect();
      return;
    }

    // --explain-route: print routing decision and exit
    if (args.explainRoute) {
      const route = routeQuery(args.query);
      console.log(JSON.stringify(route, null, 2));
      return;
    }

    if (args.agentic) {
      // Agentic mode — ReAct loop with tool access
      args.reviewerSelection = await resolveReviewerSelection({
        explicit: args.reviewersExplicit ? args.reviewers : null,
        interactive: args.reviewersExplicit !== true && process.stdin.isTTY === true && process.stdout.isTTY === true,
        prompt: promptReviewerSelection,
        defaultReviewers: reviewModeRequested(args)
          ? REVIEWER_REGISTRY.map(reviewer => reviewer.id)
          : ['mercury'],
      });
      const result = await runAgentic(args.query, args);

      console.log('');
      console.log('═══ ANSWER ═══');
      console.log('');
      console.log(result.answer);
      console.log('');
      console.log(`[iterations: ${result.iterations} | termination: ${result.termination} | latency: ${result.totalLatencyMs}ms]`);
      printDispatchReceipt(result);
      if (result.exitCode) process.exitCode = result.exitCode;
      if (result.adversarialReview || result.consensus) {
        const review = result.adversarialReview || result.consensus;
        console.log('');
        const reviewTitle = args.reviewIntent === 'architecture'
          ? '═══ FABLE ARCHITECTURE REVIEW ═══'
          : (args.reviewIntent === 'planning'
            ? '═══ FABLE PLANNING REVIEW ═══'
            : (review.mode === 'consensus' ? '═══ FABLE LEGACY REVIEW ═══' : '═══ FABLE ADVERSARIAL REVIEW ═══'));
        console.log(reviewTitle);
        console.log('');
        if (review.ok) {
          console.log(review.answer);
          console.log('');
          console.log(`[${review.mode || 'adversarial_review'}: ${review.provider}/${review.model} | latency: ${review.latencyMs}ms]`);
          const rechecks = Array.isArray(review.rechecks)
            ? review.rechecks
            : (review.recheck ? [review.recheck] : []);
          const recheckPrompts = Array.isArray(review.recheckPrompts)
            ? review.recheckPrompts
            : (review.recheckPrompt ? [review.recheckPrompt] : []);
          for (const [index, recheck] of rechecks.entries()) {
            console.log('');
            console.log(`═══ MERCURY RECHECK ${index + 1} ═══`);
            console.log('');
            console.log(`Prompt:\n${recheckPrompts[index] || review.recheckPrompt || '<empty>'}`);
            console.log('');
            console.log(recheck.answer);
            console.log('');
            console.log(`[recheck iterations: ${recheck.iterations} | termination: ${recheck.termination} | latency: ${recheck.totalLatencyMs}ms]`);
            if (recheck.toolTelemetry) {
              console.log(`[recheck tool telemetry: ${formatToolTelemetry(recheck.toolTelemetry)}]`);
            }
          }
          if (result.adversarialReviewPacket) {
            console.log('');
            console.log('═══ ADVERSARIAL REVIEW PACKET ═══');
            console.log('');
            console.log(result.adversarialReviewPacket);
          }
        } else {
          console.log(`Adversarial review unavailable: ${review.error.message}`);
          console.log(`[${review.mode || 'adversarial_review'}: ${review.provider}/${review.model}]`);
        }
      }

      if (args.showHistory && result.history.length > 0) {
        console.log('');
        console.log('─── TOOL CALL TRACE ───');
        for (const turn of result.history) {
          console.log('');
          console.log(`## Iteration ${turn.iteration} — ${turn.toolName}`);
          console.log(`TOOL: ${turn.toolName}(${JSON.stringify(turn.toolArgs)})`);
          const resultStr = JSON.stringify(turn.toolResult, null, 2);
          console.log(`RESULT: ${resultStr.slice(0, 1000)}${resultStr.length > 1000 ? '...[truncated]' : ''}`);
        }
        console.log('');
        console.log('─── END TRACE ───');
      }

    } else {
      // Legacy single-shot mode — unchanged
      const result = await ask(args.query, {
        topK: args.topK,
        maxTokens: args.maxTokens,
        verbose: !args.quiet,
      });

      if (args.showChunks) {
        console.log('');
        console.log('─── RETRIEVED CHUNKS ───');
        result.chunks.forEach((c, idx) => {
          console.log('');
          console.log(`### [${idx + 1}] ${c.file_path}:${c.start_line}-${c.end_line} (sim=${c.similarity.toFixed(3)})`);
          console.log(c.text);
          console.log('');
        });
        console.log('─── END CHUNKS ───');
      }

      console.log('');
      console.log('═══ ANSWER ═══');
      console.log('');
      console.log(result.answer);
      console.log('');
      console.log(`[latency: ${result.latencyMs}ms | chunks used: ${result.chunks.length}]`);
    }

  } catch (err) {
    // Failure receipt — same doctrine as the success-path RECEIPT block:
    // a dispatch that dies must document itself in the output package.
    console.error('');
    console.error('═══ RECEIPT (DISPATCH FAILED) ═══');
    console.error(`verdict:     tool_failure`);
    console.error(`error:       ${err.message}`);
    console.error(`error name:  ${err.name || 'Error'}`);
    if (err.mercuryRunLedger) {
      console.error(`run ledger:  ${err.mercuryRunLedger.citation}`);
    }
    console.error('[MERCURY-BRIDGE] ERROR:', err.message);
    if (err.message.includes('No chunks in index')) {
      console.error('');
      console.error('Run the indexer first:');
      console.error('  node trai_brain/mercury-bridge/indexer.js');
    }
    if (err.message.includes('MongoDB') || err.message.includes('mongo')) {
      console.error('');
      console.error('Check MongoDB is running:');
      console.error('  sudo systemctl status mongod');
    }
    if (err.message.includes('OPENAI') || err.message.includes('embed') || err.message.includes('Embed endpoint')) {
      console.error('');
      console.error(`Embedding provider: ${config.EMBED_PROVIDER}`);
      console.error(`Embedding endpoint: ${config.EMBED_ENDPOINT}`);
      if (config.EMBED_PROVIDER === 'ollama') {
        console.error('Check local Ollama is running and the configured embed model is pulled.');
      } else if (config.EMBED_ENDPOINT.includes('models.github.ai')) {
        console.error(`Check ${config.EMBED_API_KEY_ENV} has access to the configured GitHub Models embedding model.`);
      } else if (config.EMBED_ENDPOINT.includes('api.openai.com')) {
        console.error(`Check ${config.EMBED_API_KEY_ENV} has active quota/billing, or set embeddings.provider=ollama for local retrieval.`);
      } else {
        console.error('Check embeddings.endpoint, embeddings.model, and embeddings.apiKeyEnv in mercury.config.json.');
      }
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseEvidenceSourceDescriptor,
  resolveEvidenceSources,
  runReviewRechecks,
  runAgentic,
  buildMercuryIntentPrompt,
  buildCurrentChangeBlastRadius,
  currentChangeDiff,
  currentChangedFiles,
  isSerenaSourcePath,
  selectCurrentChangeNames,
};
