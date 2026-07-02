'use strict';

const fs = require('fs');
const path = require('path');
const { BREAK_MY_FIX_FRAME } = require('../shared/break-my-fix-frame');
const policy = require('./policy');
const finishGate = require('./finish-gate');
const taskContract = require('./task-contract');
const editLedger = require('./edit-ledger');
const { emit, readHookInput, sessionIdFromHookInput } = require('./hook-input');

const READ_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'sed', 'awk', 'grep', 'egrep',
  'fgrep', 'rg', 'ripgrep', 'find', 'file', 'stat', 'wc', 'nl', 'tac',
  'od', 'xxd', 'hexdump', 'tar', 'unzip',
]);
const COMMAND_SEPARATORS = new Set(['|', ';', '&&', '||', '(', ')']);
const SHELL_RUNTIMES = new Set(['bash', 'sh', 'zsh', 'fish', 'dash']);
const SCRIPT_RUNTIMES = new Set(['node', 'python', 'python3', 'perl', 'ruby', 'php']);
const SHELL_EVAL_COMMANDS = new Set(['eval', 'source']);
const PRIVILEGED_WRAPPERS = new Set(['sudo', 'doas']);
const COMMAND_WRAPPERS = new Set(['env', 'command', 'nohup', 'time']);
const ALLOWED_NODE_FLAGS = new Set(['--check', '-v', '--version']);
const MUTATING_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()(rm|rmdir|mv|cp|touch|mkdir|chmod|chown|ln|truncate|tee|dd|install)\b/;
const WARDEN_GATED_GIT_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()git\s+(add|commit|push)\b/;
const MUTATING_GIT_COMMAND = /(^|\s|\||;|&&|\|\||\(|`|\$\()git\s+(reset|checkout|restore|clean|revert|cherry-pick|merge|rebase|stash|rm|mv|tag)\b/;
const PACKAGE_MUTATION = /(^|\s|\||;|&&|\|\||\(|`|\$\()(npm|pnpm|yarn)\s+(install|i|update|upgrade|remove|uninstall|audit\s+fix)\b/;
const INLINE_RUNTIME = /(^|\s|\||;|&&|\|\||\(|`|\$\()(node|python|python3|perl|ruby|php)\s+(-e|-p|-c)\b/;
const OUTPUT_REDIRECT = /(^|[^<>])>{1,2}(?![>&])/;
const IN_PLACE_EDIT = /(^|\s|\||;|&&|\|\||\(|`|\$\()(sed|awk|perl|ruby)\s+[^|;&`]*\s-i\b/;
const MERCURY_ASK_SCRIPT = /(^|\s)(node\s+)?(\.\/)?trai_brain[\/\\]mercury-bridge[\/\\]ask\.js\b/;
const MERCURY_REQUIRED_FRAME = BREAK_MY_FIX_FRAME;
const MERCURY_VERIFICATION_FRAMES = [
  { reason: 'verify', pattern: /\bverify\b/i },
  { reason: 'confirm', pattern: /\bconfirm\b/i },
  { reason: 'what_changed', pattern: /\bwhat\s+changed\b/i },
  { reason: 'is_closed', pattern: /\bis\b[^"'`;&|]{0,80}\bclosed\b/i },
  { reason: 'is_correct', pattern: /\bis\s+(this|it|that|the\s+fix|the\s+change)\s+(correct|right|fixed|resolved|closed)\b/i },
  { reason: 'does_this_look', pattern: /\bdoes\s+(this|it|that)\s+look\b/i },
  { reason: 'beam_me_up', pattern: /\bbeam\s+me\s+up\b/i },
];

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

function commandName(token) {
  return path.basename(token || '');
}

function isCommandPosition(tokens, index) {
  return index === 0 || COMMAND_SEPARATORS.has(tokens[index - 1]);
}

function segmentUntilSeparator(tokens, start) {
  const segment = [];
  for (let i = start; i < tokens.length; i++) {
    if (COMMAND_SEPARATORS.has(tokens[i])) break;
    segment.push(tokens[i]);
  }
  return segment;
}

function isAllowedNodeRuntime(tokens, index) {
  const segment = segmentUntilSeparator(tokens, index);
  const firstArg = segment[1] || '';
  if (ALLOWED_NODE_FLAGS.has(firstArg)) return true;
  if (firstArg === 'trai_brain/mercury-bridge/ask.js' || firstArg === './trai_brain/mercury-bridge/ask.js') {
    return true;
  }
  if (
    (firstArg === 'trai_brain/claude-bridge/cli.js' || firstArg === './trai_brain/claude-bridge/cli.js') &&
    segment[2] === 'record-proof'
  ) {
    return true;
  }
  return false;
}

function tokenIsMutatingCommand(token) {
  return ['rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'chmod', 'chown', 'ln', 'truncate', 'tee', 'dd', 'install'].includes(commandName(token));
}

function gitMutationReasonFromSegment(segment) {
  for (let i = 1; i < segment.length; i++) {
    const part = segment[i];
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(part)) {
      i += 1;
      continue;
    }
    if (
      part.startsWith('--git-dir=') ||
      part.startsWith('--work-tree=') ||
      part.startsWith('--namespace=') ||
      part.startsWith('-')
    ) {
      continue;
    }

    const subcommand = commandName(part);
    if (['add', 'commit', 'push'].includes(subcommand)) return 'warden_gated_git_mutation';
    if (['reset', 'checkout', 'restore', 'clean', 'revert', 'cherry-pick', 'merge', 'rebase', 'stash', 'rm', 'mv', 'tag'].includes(subcommand)) {
      return 'git_mutation';
    }
    return null;
  }

  return null;
}

function wrappedCommandReason(segment) {
  for (let i = 0; i < segment.length; i++) {
    const part = segment[i];
    if (!part || part.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(part)) continue;
    const wrapped = commandName(part);
    if (PRIVILEGED_WRAPPERS.has(wrapped)) return `privileged_wrapper:${wrapped}`;
    if (tokenIsMutatingCommand(wrapped)) return `mutating_command:${wrapped}`;
    if (wrapped === 'git') return gitMutationReasonFromSegment(segment.slice(i));
    if (COMMAND_WRAPPERS.has(wrapped)) return wrappedCommandReason(segment.slice(i + 1));
    if (SHELL_RUNTIMES.has(wrapped)) return `shell_runtime:${wrapped}`;
    if (SCRIPT_RUNTIMES.has(wrapped)) return `script_runtime:${wrapped}`;
    return null;
  }
  return null;
}

function archiveMutationReason(name, segment) {
  if (name === 'tar') {
    for (const token of segment) {
      if (token === '--extract') return 'archive_extract:tar';
      if (/^-[A-Za-z]*x[A-Za-z]*$/.test(token)) return 'archive_extract:tar';
    }
  }

  if (name === 'unzip') {
    const readOnly = segment.some((token) => token === '-l' || token === '-t' || token === '-v' || token === '-Z');
    if (!readOnly) return 'archive_extract:unzip';
  }

  return null;
}

function inPlaceEditReason(name, segment) {
  if (!['sed', 'awk', 'perl', 'ruby'].includes(name)) return null;
  const hasInPlaceFlag = segment.some((token) => token === '-i' || /^-i[A-Za-z0-9._-]+$/.test(token) || token === '--in-place' || token.startsWith('--in-place='));
  return hasInPlaceFlag ? 'in_place_edit' : null;
}

function interpreterBypassReason(cmd) {
  const tokens = shellTokens(cmd);

  for (let i = 0; i < tokens.length; i++) {
    if (!isCommandPosition(tokens, i)) continue;
    const name = commandName(tokens[i]);

    if (tokenIsMutatingCommand(name)) return `mutating_command:${name}`;
    if (name === 'git') {
      const gitMutation = gitMutationReasonFromSegment(segmentUntilSeparator(tokens, i));
      if (gitMutation) return gitMutation;
    }
    if (PRIVILEGED_WRAPPERS.has(name)) return `privileged_wrapper:${name}`;
    if (SHELL_RUNTIMES.has(name)) return `shell_runtime:${name}`;
    if (SHELL_EVAL_COMMANDS.has(name)) return `shell_eval:${name}`;
    if (tokens[i] === '.') return 'shell_eval:.';

    if (COMMAND_WRAPPERS.has(name)) {
      const wrappedReason = wrappedCommandReason(segmentUntilSeparator(tokens, i + 1));
      if (wrappedReason) return wrappedReason;
    }

    if (SCRIPT_RUNTIMES.has(name)) {
      if (name === 'node' && isAllowedNodeRuntime(tokens, i)) continue;
      return `script_runtime:${name}`;
    }

    const inPlaceEdit = inPlaceEditReason(name, segmentUntilSeparator(tokens, i + 1));
    if (inPlaceEdit) return inPlaceEdit;

    const archiveMutation = archiveMutationReason(name, segmentUntilSeparator(tokens, i + 1));
    if (archiveMutation) return archiveMutation;

    if (name === 'find') {
      const segment = segmentUntilSeparator(tokens, i + 1);
      if (segment.includes('-delete')) return 'find_delete';
      const execIndex = segment.indexOf('-exec');
      if (execIndex !== -1) {
        const execName = commandName(segment[execIndex + 1]);
        if (tokenIsMutatingCommand(execName) || SHELL_RUNTIMES.has(execName) || SCRIPT_RUNTIMES.has(execName)) {
          return 'find_exec_mutation';
        }
      }
    }

    if (name === 'xargs') {
      const segment = segmentUntilSeparator(tokens, i + 1);
      for (const token of segment) {
        const target = commandName(token);
        if (tokenIsMutatingCommand(target) || SHELL_RUNTIMES.has(target) || SCRIPT_RUNTIMES.has(target)) {
          return 'xargs_mutation';
        }
      }
    }
  }

  return null;
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

function gitCommandSegment(cmd) {
  const tokens = shellTokens(cmd);
  for (let i = 0; i < tokens.length; i++) {
    if (!isCommandPosition(tokens, i)) continue;
    const name = commandName(tokens[i]);
    if (name === 'git') return segmentUntilSeparator(tokens, i);
    if (!COMMAND_WRAPPERS.has(name)) continue;
    const wrapped = segmentUntilSeparator(tokens, i + 1);
    const gitIndex = wrapped.findIndex((token) => commandName(token) === 'git');
    if (gitIndex !== -1) return wrapped.slice(gitIndex);
  }
  return [];
}

function gitSubcommandIndex(segment) {
  for (let i = 1; i < segment.length; i++) {
    const part = segment[i];
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(part)) {
      i += 1;
      continue;
    }
    if (
      part.startsWith('--git-dir=') ||
      part.startsWith('--work-tree=') ||
      part.startsWith('--namespace=') ||
      part.startsWith('-')
    ) {
      continue;
    }
    return i;
  }
  return -1;
}

function isBroadGitAddPath(token) {
  return token === '.' || token === './' || token === '-A' || token === '--all' || token === ':/';
}

function gitAddPaths(segment, subcommandIndex) {
  const paths = [];
  for (let i = subcommandIndex + 1; i < segment.length; i++) {
    const part = segment[i];
    if (!part || part === '--') continue;
    if (part.startsWith('-')) {
      if (isBroadGitAddPath(part)) return null;
      continue;
    }
    if (isBroadGitAddPath(part)) return null;
    paths.push(part);
  }
  return paths.length > 0 ? paths : null;
}

function gitMutationScope(cmd) {
  const segment = gitCommandSegment(cmd);
  const subcommandIndex = gitSubcommandIndex(segment);
  if (subcommandIndex < 0) return { kind: 'broad' };
  const subcommand = commandName(segment[subcommandIndex]);
  if (subcommand === 'push') return { kind: 'push' };
  if (subcommand === 'commit') return { kind: 'staged' };
  if (subcommand === 'add') {
    const paths = gitAddPaths(segment, subcommandIndex);
    return paths ? { kind: 'paths', paths } : { kind: 'broad' };
  }
  return { kind: 'broad' };
}

function mutationReason(cmd) {
  if (OUTPUT_REDIRECT.test(cmd)) return 'output_redirection';
  if (IN_PLACE_EDIT.test(cmd)) return 'in_place_edit';
  if (WARDEN_GATED_GIT_COMMAND.test(cmd)) return 'warden_gated_git_mutation';
  if (MUTATING_GIT_COMMAND.test(cmd)) return 'git_mutation';
  if (PACKAGE_MUTATION.test(cmd)) return 'package_mutation';
  if (INLINE_RUNTIME.test(cmd)) return 'inline_runtime';
  const interpreterBypass = interpreterBypassReason(cmd);
  if (interpreterBypass) return interpreterBypass;
  const mutationMatch = cmd.match(MUTATING_COMMAND);
  if (mutationMatch) return `mutating_command:${mutationMatch[2]}`;
  return null;
}

function mercuryFramingReason(cmd) {
  if (!MERCURY_ASK_SCRIPT.test(cmd)) return null;
  const promptSegment = mercuryPromptSegment(cmd);
  if (!MERCURY_REQUIRED_FRAME.test(promptSegment)) return 'missing_break_my_fix';

  for (const frame of MERCURY_VERIFICATION_FRAMES) {
    if (frame.pattern.test(cmd)) return `verification_framing:${frame.reason}`;
  }

  return null;
}

function mercuryPromptSegment(cmd) {
  const tokens = shellTokens(cmd);
  const scriptIndex = tokens.findIndex((token) => /(^|[\/\\])?ask\.js$/.test(token));
  if (scriptIndex < 0) return '';
  const promptTokens = tokens.slice(scriptIndex + 1).filter((token) => !token.startsWith('--'));
  return promptTokens.join(' ').trim();
}

function assertWardenAllowsGitMutation(input) {
  const sessionId = sessionIdFromHookInput(input);
  if (!sessionId) {
    emit('BLOCKED (claude-bridge Warden): missing session identity. Warden policy fails closed.', 2);
  }

  const cmd = input.tool_input?.command || '';
  const scope = gitMutationScope(cmd);
  if (scope.kind === 'push') return;

  const files = scope.kind === 'paths'
    ? finishGate.changedFilesForPaths(scope.paths)
    : scope.kind === 'staged'
      ? finishGate.stagedFiles()
      : finishGate.changedFiles();
  const editedFiles = scope.kind === 'broad'
    ? editLedger.listEditedFiles()
    : files;

  const result = finishGate.evaluateFinishGate(files, editedFiles);
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
  const input = readHookInput('claude-bridge Bash');
  const ti = input.tool_input || {};
  const cmd = ti.command || '';

  if (typeof cmd !== 'string' || !cmd.trim()) {
    emit('BLOCKED (claude-bridge Bash): missing Bash command. Bash policy fails closed.', 2);
  }

  const bashCheck = taskContract.checkBashAllowed(cmd);
  if (!bashCheck.allowed) {
    emit(
      `BLOCKED (claude task-contract): Bash command violates active task ${bashCheck.taskId}. ` +
      `${bashCheck.reason}${bashCheck.matched ? ` (${bashCheck.matched})` : ''}.`,
      2
    );
  }

  const mercuryFraming = mercuryFramingReason(cmd);
  if (mercuryFraming) {
    emit(
      `BLOCKED (claude Mercury framing): ${mercuryFraming}. ` +
      `Mercury dispatch must visibly include "break my fix" adversarial framing and must not ask Mercury to verify, confirm, compare what changed, or declare a fix closed.`,
      2
    );
  }

  const mutation = mutationReason(cmd);
  if (mutation) {
    if (mutation === 'warden_gated_git_mutation') {
      assertWardenAllowsGitMutation(input);
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
    if (!check.allowed) {
      emit(
        `BLOCKED (claude-bridge policy via Bash): ${check.path || p} is blocked by ${check.reason}. ` +
        `Bash read commands cannot bypass bridge policy.`,
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
module.exports = {
  run,
  extractPaths,
  mutationReason,
  mercuryFramingReason,
  gitMutationScope,
  assertWardenAllowsGitMutation,
};
