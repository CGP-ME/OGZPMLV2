'use strict';

/**
 * serena-bridge.js — Blast Radius Enrichment for Mercury
 *
 * Wraps tools/dep-scanner.js to give Mercury structured "who imports this
 * file" context before it attacks a proposed change. Mercury does not know
 * which callers a change affects; Serena (dep-scanner) does. Serial flow:
 * Serena first, Mercury second. 5-second timeout with fallback so a slow
 * scan never blocks an attack.
 *
 * Spec: ogz-meta/ledger/spec fixes/CC-SPEC-SERENA-MERCURY-INTEGRATION_1.md
 */

const { getCallers } = require('./dep-scanner');

const MAX_CALLERS_IN_PROMPT = 30;
const SERENA_TIMEOUT_MS = 5000;

function classifyRisk(callerCount) {
  if (callerCount === 0) return 'isolated';
  if (callerCount <= 3) return 'low';
  if (callerCount <= 10) return 'medium';
  return 'high';
}

function summarize(filePath, callers) {
  if (callers.length === 0) {
    return `${filePath} has no callers in the production tree (entry point, dynamically loaded, or unused).`;
  }
  const sample = callers.slice(0, 3).map(c => c.source).join(', ');
  return `${filePath} is required by ${callers.length} file(s)` +
    (callers.length > 3 ? ` including ${sample}` : `: ${sample}`) + '.';
}

async function getBlastRadius(filePath, options = {}) {
  const timeoutMs = options.timeoutMs || SERENA_TIMEOUT_MS;
  const start = Date.now();

  const work = new Promise((resolve, reject) => {
    try {
      const callers = getCallers(filePath);
      const truncated = callers.length > MAX_CALLERS_IN_PROMPT;
      resolve({
        file: filePath,
        callers,
        callerCount: callers.length,
        truncated,
        riskLevel: classifyRisk(callers.length),
        summary: summarize(filePath, callers),
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      reject(err);
    }
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Serena timeout (${timeoutMs}ms)`)), timeoutMs)
  );

  return Promise.race([work, timeout]);
}

function formatForMercury(blastRadius) {
  const { file, callers, callerCount, truncated, riskLevel, summary } = blastRadius;
  const shown = callers.slice(0, MAX_CALLERS_IN_PROMPT);

  const lines = [
    `## Blast Radius — ${file}`,
    ``,
    `**Risk level:** ${riskLevel}`,
    `**Caller count:** ${callerCount}` +
      (truncated ? ` (showing first ${MAX_CALLERS_IN_PROMPT})` : ''),
    ``,
    `**Summary:** ${summary}`,
    ``,
    `**Callers (file:line):**`,
  ];

  if (shown.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const c of shown) {
      lines.push(`- ${c.source}:${c.line}  \`${c.type}\` -> \`${c.target}\``);
    }
  }

  return lines.join('\n');
}

module.exports = {
  getBlastRadius,
  formatForMercury,
  MAX_CALLERS_IN_PROMPT,
  SERENA_TIMEOUT_MS,
};
