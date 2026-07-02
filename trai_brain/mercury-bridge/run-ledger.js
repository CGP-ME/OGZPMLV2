'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RUN_LEDGER_DIR = path.join('ogz-meta', 'cognition-history', 'mercury-runs');
const PROMPT_EXCERPT_MAX = 500;
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
        clean[key] = raw == null || raw === '' ? raw : '[REDACTED]';
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
  return Object.keys(byTool).sort().map((name) => ({
    name,
    calls: byTool[name].calls || 0,
    succeeded: byTool[name].succeeded || 0,
    failed: byTool[name].failed || 0,
  }));
}

function classifyMercuryVerdict({ result = null, error = null } = {}) {
  if (error) return 'tool_failure';
  if (
    result
    && result.consensus
    && result.consensus.ok !== true
  ) {
    return 'consensus_failed';
  }
  if (!result || result.termination !== 'answer_given') return 'blocked';

  const answer = String(result.answer || '').toLowerCase();
  if (/\b(no concrete break|could not find|cannot find|no break found|did not find|no reachable break)\b/.test(answer)) {
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

function isCommitBlockingVerdict(verdict) {
  return verdict !== 'no_break_found';
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
  const verdict = classifyMercuryVerdict({ result, error });
  const repoState = readRepoState(repoRoot);
  const telemetry = result && result.toolTelemetry ? result.toolTelemetry : {};
  const answerQualityFlags = result && result.answerQuality && Array.isArray(result.answerQuality.flags)
    ? result.answerQuality.flags
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
    consensus: result && result.consensus ? {
      enabled: result.consensus.enabled === true,
      ok: result.consensus.ok === true,
      provider: result.consensus.provider || null,
      model: result.consensus.model || null,
      latency_ms: result.consensus.latencyMs == null ? null : result.consensus.latencyMs,
      error: result.consensus.error || null,
      answer_excerpt: result.consensus.answer
        ? truncateText(redactSensitiveText(result.consensus.answer), ANSWER_EXCERPT_MAX)
        : null,
    } : null,
    termination: result ? result.termination : null,
    iterations: result ? result.iterations : null,
    latency_ms: result ? result.totalLatencyMs : null,
    verdict,
    commit_blocking: isCommitBlockingVerdict(verdict),
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
  RUN_LEDGER_DIR,
  buildRunLedgerEntry,
  classifyMercuryVerdict,
  redactSensitiveText,
  sanitizeForLedger,
  writeRunLedgerEntry,
};
