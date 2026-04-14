'use strict';

const path = require('path');
const fs = require('fs');

const prompts = require('./prompts');
const parsers = require('./parsers');

const ACTIVITY_LOG = path.join(__dirname, '..', 'logs', 'ai-activity.jsonl');

// Prompt builders keyed by role
const PROMPT_BUILDERS = {
  entomologist: prompts.buildEntomologistPrompt,
  exterminator: prompts.buildExterminatorPrompt,
  critic: prompts.buildCriticPrompt,
  forensics: prompts.buildForensicsPrompt,
  architect: prompts.buildArchitectPrompt,
  fixer: prompts.buildFixerPrompt,
};

// Output parsers keyed by format
const OUTPUT_PARSERS = {
  structured_bugs: parsers.parseEntomologistOutput,
  structured_proposals: parsers.parseExterminatorOutput,
  structured_critique: parsers.parseCriticOutput,
  structured_risks: parsers.parseForensicsOutput,
  structured_plan: parsers.parseArchitectOutput,
  structured_edits: parsers.parseFixerOutput,
};

function logActivity(entry) {
  try {
    const dir = path.dirname(ACTIVITY_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ACTIVITY_LOG, JSON.stringify(entry) + '\n');
  } catch (_) { /* best effort */ }
}

/**
 * Call Mercury as the cognition layer for a Claudito stage.
 *
 * @param {object} params
 * @param {string} params.role - Stage role (entomologist|exterminator|critic|forensics)
 * @param {string} params.task - Human-readable task description
 * @param {object} params.target - Target data (files, issue, bugs, proposals, context)
 * @param {string} params.outputFormat - Parser key (structured_bugs|structured_proposals|etc)
 * @param {object} [params.options] - Mercury options (maxIterations, quiet, etc)
 * @returns {Promise<{success: boolean, data: object, iterations: number, duration_ms: number, trace_id: string|null}>}
 */
async function callMercury({ role, task, target, outputFormat, options = {} }) {
  const t0 = Date.now();
  const maxRetries = 3;

  // Build prompt from role template
  const buildPrompt = PROMPT_BUILDERS[role];
  if (!buildPrompt) {
    return { success: false, reason: `unknown role: ${role}`, data: null, iterations: 0, duration_ms: 0, trace_id: null };
  }

  const prompt = buildPrompt(target);

  // Load runAgentic lazily (avoid circular deps, heavy init)
  const { runAgentic } = require(path.join(__dirname, '..', '..', 'trai_brain', 'mercury-bridge', 'ask.js'));

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await runAgentic(prompt, {
        quiet: options.quiet ?? true,
        maxIterations: options.maxIterations ?? 10,
        maxTokens: options.maxTokens ?? 7750,
      });

      const duration_ms = Date.now() - t0;

      // Parse Mercury's answer
      const parser = OUTPUT_PARSERS[outputFormat];
      const data = parser ? parser(result.answer) : { raw: result.answer };

      // Log activity
      logActivity({
        timestamp: new Date().toISOString(),
        actor: 'claudito',
        stage: role,
        task,
        mission_id: options.missionId || null,
        duration_ms,
        iterations: result.iterations,
        termination: result.termination,
        result_summary: summarizeResult(role, data),
        files_touched: target.files || [],
      });

      return {
        success: true,
        data,
        iterations: result.iterations,
        duration_ms,
        trace_id: null, // trace capture happens inside runAgentic
      };

    } catch (err) {
      const isRetryable = err.message && (
        err.message.includes('429') ||
        err.message.includes('503') ||
        err.message.includes('timeout') ||
        err.message.includes('ECONNRESET')
      );

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[COGNITION] Mercury ${role} attempt ${attempt + 1} failed (${err.message}), retrying in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const duration_ms = Date.now() - t0;

      logActivity({
        timestamp: new Date().toISOString(),
        actor: 'claudito',
        stage: role,
        task,
        mission_id: options.missionId || null,
        duration_ms,
        event: 'mercury_failure',
        error: err.message,
      });

      return {
        success: false,
        reason: err.message,
        data: null,
        iterations: 0,
        duration_ms,
        trace_id: null,
      };
    }
  }
}

function summarizeResult(role, data) {
  if (!data) return 'no data';
  switch (role) {
    case 'entomologist':
      return `Found ${(data.bugs || []).length} bugs (confidence: ${data.confidence || '?'})`;
    case 'exterminator':
      return `${(data.proposals || []).length} fix proposals`;
    case 'critic':
      return `Verdict: ${data.overall_verdict || '?'}, ${(data.reviews || []).length} reviews`;
    case 'forensics':
      return `${(data.risks || []).length} risks, ${(data.silent_bugs || []).length} silent bugs`;
    case 'architect':
      return `Plan: ${(data.plan?.files || []).length} files, ${(data.plan?.ordering || []).length} ordering steps`;
    case 'fixer':
      return `${(data.edits || []).length} verified edits`;
    default:
      return 'completed';
  }
}

module.exports = { callMercury };
