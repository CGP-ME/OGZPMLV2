'use strict';

const fs = require('fs');
const path = require('path');
const policy = require('./policy');
const finishGate = require('./finish-gate');
const taskContract = require('./task-contract');

function readStdinSync() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function emit(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

const READ_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'sed', 'awk', 'grep', 'egrep',
  'fgrep', 'rg', 'ripgrep', 'find', 'file', 'stat', 'wc', 'nl', 'tac',
  'od', 'xxd', 'hexdump', 'tar', 'unzip',
]);
const COMMAND_SEPARATORS = new Set(['|', ';', '&&', '||', '(', ')']);
const MUTATING_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()(rm|rmdir|mv|cp|touch|mkdir|chmod|chown|ln|truncate|tee|dd|install)\b/;
const WARDEN_GATED_GIT_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()git\s+(add|commit|push)\b/;
const MUTATING_GIT_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()git\s+(reset|checkout|restore|clean|revert|cherry-pick|merge|rebase|stash|rm|mv|tag)\b/;
const PACKAGE_MUTATION = /(^|\s|\||;|&&|\|\||\(|`|\$\()(npm|pnpm|yarn)\s+(install|i|update|upgrade|remove|uninstall|audit\s+fix)\b/;
const INLINE_RUNTIME = /(^|\s|\||;|&&|\|\||\(|`|\$\()(node|python|python3|perl|ruby|php)\s+(-e|-p|-c)\b/;
const OUTPUT_REDIRECT = /(^|[^<>])>{1,2}(?![>&])/;
const IN_PLACE_EDIT = /(^|\s|\||;|&&|\|\||\(|`|\$\()(sed|perl|ruby)\s+[^|;&`]*\s-i\b/;

function shellTokens(cmd) {
  const tokens = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const next = cmd[i + 1] || '';

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(ch + next);
      i += 1;
      continue;
    }

    if (ch === '|' || ch === ';' || ch === '(' || ch === ')') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(ch);
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isPathLike(token) {
  if (!token || token.startsWith('-')) return false;
  if (token.includes('/') || token.startsWith('.') || /\.[A-Za-z0-9]+$/.test(token)) return true;
  return fs.existsSync(path.resolve(policy.REPO_ROOT, token));
}

function extractPaths(cmd) {
  const paths = [];
  const tokens = shellTokens(cmd);

  for (let i = 0; i < tokens.length; i++) {
    if (!READ_COMMANDS.has(tokens[i])) continue;

    for (let j = i + 1; j < tokens.length; j++) {
      const candidate = tokens[j];
      if (COMMAND_SEPARATORS.has(candidate)) break;
      if (isPathLike(candidate)) paths.push(candidate);
    }
  }

  return [...new Set(paths)];
}

function mutationReason(cmd) {
  if (OUTPUT_REDIRECT.test(cmd)) return 'output_redirection';
  if (IN_PLACE_EDIT.test(cmd)) return 'in_place_edit';
  if (WARDEN_GATED_GIT_COMMAND.test(cmd)) return 'warden_gated_git_mutation';
  if (MUTATING_GIT_COMMAND.test(cmd)) return 'git_mutation';
  if (PACKAGE_MUTATION.test(cmd)) return 'package_mutation';
  if (INLINE_RUNTIME.test(cmd)) return 'inline_runtime';
  const mutationMatch = cmd.match(MUTATING_COMMAND);
  if (mutationMatch) return `mutating_command:${mutationMatch[2]}`;
  return null;
}

function assertWardenAllowsGitMutation() {
  const result = finishGate.evaluateFinishGate();
  if (!result.allowed) {
    emit(
      `BLOCKED (claude-bridge Warden): git mutation requires completed Warden proof first. ` +
      `${result.reason}. ` +
      `Run adversarial Mercury, P0 when required, and record .claude/session-state/hot-path-proof.json before git add/commit/push.`,
      2
    );
  }
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const ti = input.tool_input || {};
  const cmd = ti.command || '';

  if (!cmd) process.exit(0);

  const bashCheck = taskContract.checkBashAllowed(cmd);
  if (!bashCheck.allowed) {
    emit(
      `BLOCKED (claude task-contract): Bash command violates active task ${bashCheck.taskId}. ` +
      `${bashCheck.reason}${bashCheck.matched ? ` (${bashCheck.matched})` : ''}.`,
      2
    );
  }

  const mutation = mutationReason(cmd);
  if (mutation) {
    if (mutation === 'warden_gated_git_mutation') {
      assertWardenAllowsGitMutation();
      process.exit(0);
    }
    emit(
      `BLOCKED (claude-bridge Bash mutation): ${mutation}. ` +
      `Bash is for inspection and verification only. Use Edit/Write so read, scope, and pipeline gates can enforce the change.`,
      2
    );
  }

  const paths = extractPaths(cmd);
  for (const p of paths) {
    const check = policy.checkPath(p);
    if (!check.allowed && check.reason === 'claude_bridge_ignored') {
      emit(
        `BLOCKED (claude-bridge ignore via Bash): ${check.path} is claude-bridge ignore-policy protected. ` +
        `Bash read commands cannot bypass the ignore policy. ` +
        `If the file is genuinely needed, surface the policy decision to Trey.`,
        2
      );
    }
    if (check.allowed) {
      const taskCheck = taskContract.checkPathAllowed('read', check.path);
      if (!taskCheck.allowed) {
        emit(
          `BLOCKED (claude task-contract): Bash read ${taskCheck.path || check.path} violates active task ${taskCheck.taskId}. ` +
          `${taskCheck.reason}${taskCheck.matched ? ` (${taskCheck.matched})` : ''}.`,
          2
        );
      }
    }
  }

  process.exit(0);
}

if (require.main === module) run();
module.exports = { run, extractPaths, mutationReason, assertWardenAllowsGitMutation };
