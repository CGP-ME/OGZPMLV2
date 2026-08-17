'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_RUN_LEDGER_DIR = path.join('ogz-meta', 'cognition-history', 'mercury-runs');
const RUN_LEDGER_DIR = resolveRunLedgerDir(process.env.MERCURY_RUN_LEDGER_DIR || DEFAULT_RUN_LEDGER_DIR);
const PROMPT_EXCERPT_MAX = 2000;

function resolveRunLedgerDir(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error('MERCURY_RUN_LEDGER_DIR must be a repo-relative directory without .. segments');
  }
  return normalized;
}

const ANSWER_EXCERPT_MAX = 1000;

function isoTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('invalid ledger timestamp');
  }
  return date.toISOString();
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function truncateText(value, maxChars) {
  const text = String(value == null ? '' : value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...[truncated ${text.length - maxChars} chars]`;
}

function redactSensitiveText(value) {
  return String(value == null ? '' : value)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]')
    .replace(/\b((?:[A-Z0-9_]*)(?:API[_-]?KEY|API[_-]?SECRET|AUTH[_-]?TOKEN|TOKEN|SECRET|PASSWORD|WEBHOOK[_-]?URL|SIGNALSTACK[_-]?WEBHOOK[_-]?URL|DSN)\b\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]')
    .replace(/\bhttps:\/\/app\.signalstack\.com\/hook\/[^\s"',)]+/gi, 'https://app.signalstack.com/hook/[REDACTED]')
    .replace(/\bhttps:\/\/[^/\s"',)]+\/hook\/[^\s"',)]+/gi, 'https://[REDACTED]/hook/[REDACTED]');
}

function sanitizeForLedger(value) {
  if (value == null) return value;
  if (typeof value === 'string') return redactSensitiveText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeForLedger);
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, raw] of Object.entries(value)) {
      if (/(secret|token|password|api[_-]?key|api[_-]?secret|webhook[_-]?url|dsn)/i.test(key)) {
        // Numbers and booleans are config caps, never credentials. The bare
        // /token/ key match was scrubbing options.maxTokens, which made
        // Dispatch Law compliance (--max-tokens=7750) unverifiable post-hoc.
        clean[key] = (typeof raw === 'number' || typeof raw === 'boolean' || raw == null || raw === '')
          ? raw
          : '[REDACTED]';
      } else {
        clean[key] = sanitizeForLedger(raw);
      }
    }
    return clean;
  }
  return String(value);
}

function gitText(repoRoot, args, fallback = null) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    return fallback;
  }
}

function readRepoState(repoRoot) {
  return {
    branch: gitText(repoRoot, ['branch', '--show-current'], 'unknown') || 'detached',
    head_sha: gitText(repoRoot, ['rev-parse', 'HEAD'], 'unknown') || 'unknown',
    dirty_status_summary: gitText(repoRoot, ['status', '--short', '--untracked-files=no'], '') || '',
  };
}

function compactToolStats(toolTelemetry = {}) {
  const byTool = toolTelemetry.byTool || {};
  const calls = Array.isArray(toolTelemetry.calls) ? toolTelemetry.calls : [];
  return Object.keys(byTool).sort().map((name) => ({
    name,
    calls: byTool[name].calls || 0,
    succeeded: byTool[name].succeeded || 0,
    failed: byTool[name].failed || 0,
    call_details: calls
      .filter((call) => call && call.name === name)
      .map((call) => ({
        iteration: call.iteration == null ? null : call.iteration,
        status: call.status || 'unknown',
        args: call.args || {},
        result: call.result || {},
      })),
  }));
}

function resultHasToolFailure(result) {
  const telemetry = result && result.toolTelemetry ? result.toolTelemetry : null;
  if (!telemetry) return false;
  if (telemetry.failed > 0) return true;
  if (Array.isArray(telemetry.calls) && telemetry.calls.some((call) => call && call.status === 'failed')) {
    return true;
  }
  const byTool = telemetry.byTool || {};
  return Object.values(byTool).some((stats) => stats && stats.failed > 0);
}

function autoBlastRadiusFailed(autoBlastRadius) {
  return !!(autoBlastRadius && Array.isArray(autoBlastRadius.errors) && autoBlastRadius.errors.length > 0);
}

function classifyMercuryVerdict({ result = null, error = null, autoBlastRadius = null } = {}) {
  if (error) return 'tool_failure';
  // Tool-probe failures no longer mask the run as inconclusive. Fail loud, not
  // fail closed: the run is classified by its actual outcome and the failed-probe
  // count stays visible in telemetry. (Old inconclusive_toolfail short-circuit removed.)
  if (
    result
    && result.consensus
    && result.consensus.ok !== true
  ) {
    return 'consensus_failed';
  }
  const review = result && (result.adversarialReview || result.consensus);
  if (review && review.finalReview) {
    if (review.finalReview.ok !== true) return 'consensus_failed';
    const finalParsed = review.finalReview.parsed || {};
    const finalVerdict = String(finalParsed.verdict || '').toLowerCase();
    if (finalVerdict === 'models_disagree') return 'models_disagree';
    if (finalVerdict === 'found_break') return 'found_break';
    if (finalVerdict === 'blocked') return 'blocked';
    if (finalParsed.blocking || finalVerdict === 'needs_more_evidence') return 'cannot_verify';
    if (['pass', 'no_break_found'].includes(finalVerdict)) return 'no_break_found';
    return 'cannot_verify';
  }
  if (review && review.ok === true && review.parsed && review.parsed.blocking) {
    return 'cannot_verify';
  }
  if (!result || result.termination !== 'answer_given') return 'blocked';

  const answer = String(result.answer || '').toLowerCase();
  if (/\b(no concrete break|could not find|cannot find|no break found|did not find|no reachable break|no evidence of|there is no code path|no code path|no concrete code path|no concrete execution path|no evidence [^.]*bypass|no code path [^.]*bypass)\b/.test(answer)) {
    return 'no_break_found';
  }
  if (/\b(cannot verify|cannot prove|unable to verify|unable to prove|insufficient evidence|cannot answer)\b/.test(answer)) {
    return 'cannot_verify';
  }
  if (/\b(concrete break|reachable break|bypass|race|corrupt|bug|regression|leak|unsafe|failure mode|can still)\b/.test(answer)) {
    return 'found_break';
  }
  return 'cannot_verify';
}

function parsedReviewClassification(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const clean = {};
  for (const key of [
    'consensus',
    'contradictions',
    'partial',
    'unique',
    'blindSpots',
    'verdict',
    'blocking',
    'parseWarnings',
    'disagreement',
    'requiredRecheck',
    'recheckPrompt',
    'nextCheck',
    'sharedConclusion',
    'mercurySupported',
    'fableSupported',
    'kimiSupported',
    'citedReasoning',
  ]) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      clean[key] = parsed[key];
    }
  }
  return clean;
}

function buildFinalReviewLedgerSummary(finalReview) {
  if (!finalReview) return null;
  const redactedAnswer = finalReview.answer ? redactSensitiveText(finalReview.answer) : null;
  const parsed = parsedReviewClassification(finalReview.parsed);
  return {
    mode: finalReview.mode || 'kimi_final_adjudication',
    enabled: finalReview.enabled === true,
    ok: finalReview.ok === true,
    provider: finalReview.provider || null,
    model: finalReview.model || null,
    latency_ms: finalReview.latencyMs == null ? null : finalReview.latencyMs,
    error: finalReview.error || null,
    parsed,
    effective_verdict: parsed && parsed.verdict ? parsed.verdict : null,
    answer_excerpt: redactedAnswer
      ? truncateText(redactedAnswer, ANSWER_EXCERPT_MAX)
      : null,
    answer_full: redactedAnswer,
  };
}

function buildReviewLedgerSummary(review, { effectiveVerdictOverride = null } = {}) {
  if (!review) return null;
  const rechecks = Array.isArray(review.rechecks)
    ? review.rechecks
    : (review.recheck ? [review.recheck] : []);
  const recheckPrompts = Array.isArray(review.recheckPrompts)
    ? review.recheckPrompts
    : (review.recheckPrompt ? [review.recheckPrompt] : []);
  const redactedAnswer = review.answer ? redactSensitiveText(review.answer) : null;
  const redactedRecheckPrompt = review.recheckPrompt ? redactSensitiveText(review.recheckPrompt) : null;
  const redactedRecheckPrompts = recheckPrompts.map((prompt) => redactSensitiveText(prompt));
  const parsed = parsedReviewClassification(review.parsed);
  const rawParsedVerdict = parsed && parsed.verdict ? parsed.verdict : null;
  const effectiveVerdict = effectiveVerdictOverride || rawParsedVerdict;

  return {
    mode: review.mode || 'adversarial_review',
    enabled: review.enabled === true,
    ok: review.ok === true,
    provider: review.provider || null,
    model: review.model || null,
    latency_ms: review.latencyMs == null ? null : review.latencyMs,
    error: review.error || null,
    parsed,
    effective_verdict: effectiveVerdict,
    raw_parsed_verdict: rawParsedVerdict,
    max_rechecks: recheckPrompts.length || null,
    recheck_prompt_excerpt: redactedRecheckPrompt
      ? truncateText(redactedRecheckPrompt, ANSWER_EXCERPT_MAX)
      : null,
    recheck_prompt_full: redactedRecheckPrompt,
    recheck_prompts: redactedRecheckPrompts.map((prompt) => truncateText(prompt, ANSWER_EXCERPT_MAX)),
    recheck_prompts_full: redactedRecheckPrompts,
    recheck: review.recheck ? {
      termination: review.recheck.termination || null,
      iterations: review.recheck.iterations == null ? null : review.recheck.iterations,
      latency_ms: review.recheck.totalLatencyMs == null ? null : review.recheck.totalLatencyMs,
      answer_excerpt: review.recheck.answer
        ? truncateText(redactSensitiveText(review.recheck.answer), ANSWER_EXCERPT_MAX)
        : null,
      answer_full: review.recheck.answer ? redactSensitiveText(review.recheck.answer) : null,
    } : null,
    rechecks: rechecks.map((recheck) => ({
      termination: recheck.termination || null,
      iterations: recheck.iterations == null ? null : recheck.iterations,
      latency_ms: recheck.totalLatencyMs == null ? null : recheck.totalLatencyMs,
      answer_excerpt: recheck.answer
        ? truncateText(redactSensitiveText(recheck.answer), ANSWER_EXCERPT_MAX)
        : null,
      answer_full: recheck.answer ? redactSensitiveText(recheck.answer) : null,
    })),
    final_review: buildFinalReviewLedgerSummary(review.finalReview),
    answer_excerpt: redactedAnswer
      ? truncateText(redactedAnswer, ANSWER_EXCERPT_MAX)
      : null,
    answer_full: redactedAnswer,
  };
}

function buildRunLedgerEntry({
  repoRoot,
  query,
  opts = {},
  result = null,
  error = null,
  startedAt,
  finishedAt = new Date(),
  autoBlastRadius = null,
} = {}) {
  const startedIso = isoTimestamp(startedAt || finishedAt);
  const finishedIso = isoTimestamp(finishedAt);
  const verdict = classifyMercuryVerdict({ result, error, autoBlastRadius });
  const repoState = readRepoState(repoRoot);
  const telemetry = result && result.toolTelemetry ? result.toolTelemetry : {};
  const reviewSummary = buildReviewLedgerSummary(result && (result.adversarialReview || result.consensus));
  const answerQualityFlags = result && result.answerQuality && Array.isArray(result.answerQuality.flags)
    ? result.answerQuality.flags
    : [];
  const answerQualityEvidence = result && result.answerQuality && Array.isArray(result.answerQuality.evidence)
    ? result.answerQuality.evidence
    : [];

  return sanitizeForLedger({
    schema_version: 1,
    work_id: opts.workId || null,
    run_id: `${finishedIso.replace(/[:.]/g, '-')}-${hashText(`${repoState.head_sha}:${query}:${startedIso}`).slice(0, 12)}`,
    created_at: finishedIso,
    started_at: startedIso,
    branch: repoState.branch,
    head_sha: repoState.head_sha,
    dirty_status_summary: repoState.dirty_status_summary,
    prompt_hash: hashText(query),
    prompt_excerpt: truncateText(redactSensitiveText(query), PROMPT_EXCERPT_MAX),
    attack_scope: opts.attackScope || 'agentic_query',
    source_refs: {
      auto_blast_radius_source: autoBlastRadius ? autoBlastRadius.source : null,
      auto_blast_radius_files: autoBlastRadius && Array.isArray(autoBlastRadius.meta)
        ? autoBlastRadius.meta.map((entry) => ({
          file: entry.file,
          callerCount: entry.callerCount,
          riskLevel: entry.riskLevel,
        }))
        : [],
      auto_blast_radius_errors: autoBlastRadius && Array.isArray(autoBlastRadius.errors)
        ? autoBlastRadius.errors
        : [],
    },
    options: {
      retrievalMode: opts.retrievalMode || null,
      topK: opts.topK == null ? null : opts.topK,
      maxIterations: opts.maxIterations == null ? null : opts.maxIterations,
      maxTokens: opts.maxTokens == null ? null : opts.maxTokens,
      captureTrace: opts.captureTrace === true,
    },
    tools_invoked: compactToolStats(telemetry),
    files_opened: Array.isArray(telemetry.filesOpened) ? telemetry.filesOpened : [],
    run_check_artifacts: Array.isArray(telemetry.runCheckArtifacts) ? telemetry.runCheckArtifacts : [],
    run_checks: Array.isArray(telemetry.runChecks) ? telemetry.runChecks : [],
    answer_quality: answerQualityFlags,
    answer_quality_evidence: answerQualityEvidence,
    adversarial_review: reviewSummary,
    consensus: reviewSummary,
    termination: result ? result.termination : null,
    iterations: result ? result.iterations : null,
    latency_ms: result ? result.totalLatencyMs : null,
    verdict,
    error: error ? {
      name: error.name || 'Error',
      message: error.message || String(error),
    } : null,
    answer_excerpt: result && result.answer
      ? truncateText(redactSensitiveText(result.answer), ANSWER_EXCERPT_MAX)
      : null,
  });
}

function countLines(absPath) {
  if (!fs.existsSync(absPath)) return 0;
  const text = fs.readFileSync(absPath, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function writeRunLedgerEntry({
  repoRoot,
  entry,
  now = new Date(),
} = {}) {
  if (!repoRoot) throw new Error('repoRoot is required');
  if (!entry || typeof entry !== 'object') throw new Error('ledger entry is required');

  const createdAt = isoTimestamp(entry.created_at || now);
  const day = createdAt.slice(0, 10);
  const relDir = RUN_LEDGER_DIR;
  const absDir = path.join(repoRoot, relDir);
  const relPath = path.join(relDir, `${day}.jsonl`).replace(/\\/g, '/');
  const absPath = path.join(repoRoot, relPath);
  fs.mkdirSync(absDir, { recursive: true });

  const lineNumber = countLines(absPath) + 1;
  const line = `${JSON.stringify(sanitizeForLedger({ ...entry, created_at: createdAt }))}\n`;
  fs.appendFileSync(absPath, line, 'utf8');

  return {
    path: relPath,
    citation: `${relPath}:${lineNumber}`,
    line: lineNumber,
  };
}

module.exports = {
  DEFAULT_RUN_LEDGER_DIR,
  RUN_LEDGER_DIR,
  buildRunLedgerEntry,
  classifyMercuryVerdict,
  resultHasToolFailure,
  autoBlastRadiusFailed,
  redactSensitiveText,
  sanitizeForLedger,
  writeRunLedgerEntry,
};
