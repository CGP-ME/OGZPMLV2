'use strict';

const fs = require('fs');
const path = require('path');

const { RUN_LEDGER_DIR } = require('./run-ledger');

function readJsonl(absPath) {
  if (!fs.existsSync(absPath)) return [];
  return fs.readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function listLedgerFiles(repoRoot) {
  const absDir = path.join(repoRoot, RUN_LEDGER_DIR);
  if (!fs.existsSync(absDir)) return [];
  return fs.readdirSync(absDir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .map((name) => path.join(absDir, name));
}

function readRunLedgers(repoRoot) {
  return listLedgerFiles(repoRoot).flatMap((file) => readJsonl(file));
}

function increment(map, key, amount = 1) {
  const normalized = key || 'unknown';
  map[normalized] = (map[normalized] || 0) + amount;
}

function appendRun(map, key, runId) {
  const normalized = key || 'unknown';
  if (!Array.isArray(map[normalized])) map[normalized] = [];
  map[normalized].push(runId);
}

function buildDigest(rows = [], canaries = []) {
  const byVerdict = {};
  const runsByVerdict = {};
  const tools = {};
  const toolFailures = {};
  const answerQualityFlags = {};
  const codeClaimWithoutOpenFile = [];
  const ruleCandidates = {};

  for (const row of rows) {
    const runId = row.run_id || row.created_at || 'unknown-run';
    increment(byVerdict, row.verdict);
    appendRun(runsByVerdict, row.verdict, runId);
    for (const tool of row.tools_invoked || []) {
      increment(tools, tool.name, tool.calls || 0);
      if ((tool.failed || 0) > 0) {
        increment(toolFailures, tool.name, tool.failed);
      }
    }
    for (const flag of row.answer_quality || []) {
      increment(answerQualityFlags, flag);
    }
    const opened = Array.isArray(row.files_opened) ? row.files_opened : [];
    const answer = String(row.answer_excerpt || '');
    if (opened.length === 0 && /\b[\w./-]+\.[A-Za-z0-9][A-Za-z0-9._-]*:\d+/.test(answer)) {
      codeClaimWithoutOpenFile.push(runId);
    }
    if (row.next_rule_candidate) {
      increment(ruleCandidates, row.next_rule_candidate);
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    total_runs: rows.length,
    by_verdict: byVerdict,
    runs_by_verdict: runsByVerdict,
    tool_invocations: tools,
    tool_failures: toolFailures,
    answer_quality_flags: answerQualityFlags,
    code_claim_without_open_file: codeClaimWithoutOpenFile,
    repeated_rule_candidates: Object.fromEntries(
      Object.entries(ruleCandidates).filter(([, count]) => count > 1)
    ),
    canaries: {
      defined: canaries.length,
      names: canaries.map((canary) => canary.name).sort(),
    },
  };
}

function loadCanaries(repoRoot) {
  const absPath = path.join(repoRoot, 'ogz-meta', 'cognition', 'mercury-canaries.json');
  if (!fs.existsSync(absPath)) return [];
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function formatDigestMarkdown(digest) {
  return [
    '# Mercury Substrate Digest',
    '',
    `Generated: ${digest.generated_at}`,
    `Total runs: ${digest.total_runs}`,
    '',
    '## Verdicts',
    JSON.stringify(digest.by_verdict, null, 2),
    '',
    '## Runs by Verdict',
    JSON.stringify(digest.runs_by_verdict, null, 2),
    '',
    '## Tool Invocations',
    JSON.stringify(digest.tool_invocations, null, 2),
    '',
    '## Tool Failures',
    JSON.stringify(digest.tool_failures, null, 2),
    '',
    '## Answer Quality Flags',
    JSON.stringify(digest.answer_quality_flags, null, 2),
    '',
    '## Attention Items',
    `Code claims without open_file: ${digest.code_claim_without_open_file.length}`,
    '',
    '## Canaries',
    `Defined: ${digest.canaries.defined}`,
    digest.canaries.names.map((name) => `- ${name}`).join('\n') || '- none',
    '',
  ].join('\n');
}

module.exports = {
  buildDigest,
  formatDigestMarkdown,
  loadCanaries,
  readRunLedgers,
};
