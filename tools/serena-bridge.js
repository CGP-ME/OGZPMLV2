'use strict';

/**
 * serena-bridge.js — Blast Radius Enrichment for Mercury
 *
 * Wraps tools/dep-scanner.js to give Mercury structured "who imports this
 * file" context before it attacks a proposed change. Mercury does not know
 * which callers a change affects; Serena (dep-scanner) does. Serial flow:
 * Serena first, Mercury second. 15-second timeout with fallback so a slow
 * scan never blocks an attack.
 *
 * Spec: ogz-meta/ledger/spec fixes/CC-SPEC-SERENA-MERCURY-INTEGRATION_1.md
 */

const {
  getCallers,
  getClassFields,
  getEventEmitters,
  getEventSubscribers,
  getMethodCallers,
  getPropertyReferences,
} = require('./dep-scanner');

const MAX_CALLERS_IN_PROMPT = 30;
const SERENA_TIMEOUT_MS = 15000;

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

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Serena timeout (${timeoutMs}ms)`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

// ─────────────────────────────────────────────────────────────────────
// WebSocket Event Blast Radius — for frontend/backend contract audits.
// Browser panels load via <script> tags + OGZ.register/.get, not require(),
// so getCallers() returns 0 for them. Event blast-radius answers the
// useful question for WS contract changes: who emits this event type, and
// who subscribes to it? Used by Mercury to reason about shape mismatches
// between backend payloads and frontend handlers.
// ─────────────────────────────────────────────────────────────────────

function classifyEventRisk(emitterCount, subscriberCount) {
  if (emitterCount === 0 && subscriberCount === 0) return 'orphan';
  if (emitterCount === 0) return 'dead-subscribers';
  if (subscriberCount === 0) return 'dead-emitters';
  if (subscriberCount <= 2) return 'low';
  if (subscriberCount <= 6) return 'medium';
  return 'high';
}

async function getEventBlastRadius(eventType, options = {}) {
  const timeoutMs = options.timeoutMs || SERENA_TIMEOUT_MS;
  const start = Date.now();

  const work = new Promise((resolve, reject) => {
    try {
      const emitters = getEventEmitters(eventType);
      const subscribers = getEventSubscribers(eventType);
      resolve({
        eventType,
        emitters,
        subscribers,
        emitterCount: emitters.length,
        subscriberCount: subscribers.length,
        riskLevel: classifyEventRisk(emitters.length, subscribers.length),
        summary: `Event '${eventType}': ${emitters.length} emitter(s), ${subscribers.length} subscriber(s)`,
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

function formatEventBlastForMercury(blastRadius) {
  const { eventType, emitters, subscribers, riskLevel, summary } = blastRadius;
  const lines = [
    `## Event Blast Radius — '${eventType}'`,
    ``,
    `**Risk level:** ${riskLevel}`,
    `**Summary:** ${summary}`,
    ``,
    `**Emitters (file:line) — backend write sites:**`,
  ];

  if (emitters.length === 0) {
    lines.push(`- (none — event never emitted; subscribers wait forever)`);
  } else {
    for (const e of emitters) lines.push(`- ${e.source}:${e.line}`);
  }

  lines.push(``, `**Subscribers (file:line) — frontend read sites:**`);

  if (subscribers.length === 0) {
    lines.push(`- (none — event has no consumers; emission is wasted)`);
  } else {
    for (const s of subscribers) lines.push(`- ${s.source}:${s.line}`);
  }

  return lines.join('\n');
}

function formatScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) return 'repo';
  return scope.join(', ');
}

async function getSymbolBlastRadius(property, options = {}) {
  const timeoutMs = options.timeoutMs || SERENA_TIMEOUT_MS;
  const start = Date.now();
  const work = new Promise((resolve, reject) => {
    try {
      const result = getPropertyReferences(property, options);
      resolve({
        ...result,
        property,
        scope: options.scope || [],
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      reject(err);
    }
  });

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Serena timeout (${timeoutMs}ms)`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatSymbolBlastForMercury(result) {
  const lines = [
    `## Symbol References — ${result.property}`,
    ``,
    `**Parser:** ${result.parser}`,
    `**Scope:** ${formatScope(result.scope)}`,
    `**Total references:** ${result.total}` + (result.truncated ? ` (truncated)` : ''),
    `**Files scanned:** ${result.filesScanned}`,
    ``,
    `**References (file:line op receiver):**`,
  ];

  if (!result.references || result.references.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const ref of result.references) {
      const receiver = ref.receiver ? ` ${ref.receiver}` : '';
      lines.push(`- ${ref.file}:${ref.line}  \`${ref.op}\`${receiver}  \`${ref.context}\``);
    }
  }

  if (result.errors && result.errors.length > 0) {
    lines.push(``, `**Parse errors:**`);
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- ${err.file}: ${err.error}`);
    }
  }

  return lines.join('\n');
}

async function getMethodBlastRadius(method, options = {}) {
  const timeoutMs = options.timeoutMs || SERENA_TIMEOUT_MS;
  const start = Date.now();
  const work = new Promise((resolve, reject) => {
    try {
      const result = getMethodCallers(method, options);
      resolve({
        ...result,
        method,
        scope: options.scope || [],
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      reject(err);
    }
  });

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Serena timeout (${timeoutMs}ms)`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatMethodBlastForMercury(result) {
  const lines = [
    `## Method Callers — ${result.method}`,
    ``,
    `**Parser:** ${result.parser}`,
    `**Scope:** ${formatScope(result.scope)}`,
    `**Total callers:** ${result.total}` + (result.truncated ? ` (truncated)` : ''),
    `**Files scanned:** ${result.filesScanned}`,
    ``,
    `**Callers (file:line op receiver):**`,
  ];

  if (!result.callers || result.callers.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const caller of result.callers) {
      const receiver = caller.receiver ? ` ${caller.receiver}` : '';
      lines.push(`- ${caller.file}:${caller.line}  \`${caller.op}\`${receiver}  \`${caller.context}\``);
    }
  }

  if (result.errors && result.errors.length > 0) {
    lines.push(``, `**Parse errors:**`);
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- ${err.file}: ${err.error}`);
    }
  }

  return lines.join('\n');
}

async function getClassSurface(className, options = {}) {
  const timeoutMs = options.timeoutMs || SERENA_TIMEOUT_MS;
  const start = Date.now();
  const work = new Promise((resolve, reject) => {
    try {
      const result = getClassFields(className, options);
      resolve({
        ...result,
        scope: options.scope || [],
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      reject(err);
    }
  });

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Serena timeout (${timeoutMs}ms)`)), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatClassSurfaceForMercury(result) {
  const lines = [
    `## Class Surface — ${result.className}`,
    ``,
    `**Parser:** ${result.parser}`,
    `**Scope:** ${formatScope(result.scope)}`,
    `**Matches:** ${result.total}` + (result.truncated ? ` (truncated)` : ''),
    `**Files scanned:** ${result.filesScanned}`,
  ];

  if (!result.classes || result.classes.length === 0) {
    lines.push(``, `- (none)`);
  } else {
    for (const cls of result.classes) {
      lines.push(``, `**${cls.file}:${cls.line}**`);
      lines.push(`- fields: ${cls.fields.map((item) => `${item.name}:${item.line}`).join(', ') || '(none)'}`);
      lines.push(`- getters: ${cls.getters.map((item) => `${item.name}:${item.line}`).join(', ') || '(none)'}`);
      lines.push(`- setters: ${cls.setters.map((item) => `${item.name}:${item.line}`).join(', ') || '(none)'}`);
      lines.push(`- methods: ${cls.methods.map((item) => `${item.name}:${item.line}`).join(', ') || '(none)'}`);
    }
  }

  if (result.errors && result.errors.length > 0) {
    lines.push(``, `**Parse errors:**`);
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- ${err.file}: ${err.error}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  getBlastRadius,
  formatForMercury,
  getSymbolBlastRadius,
  formatSymbolBlastForMercury,
  getMethodBlastRadius,
  formatMethodBlastForMercury,
  getClassSurface,
  formatClassSurfaceForMercury,
  getEventBlastRadius,
  formatEventBlastForMercury,
  MAX_CALLERS_IN_PROMPT,
  SERENA_TIMEOUT_MS,
};
