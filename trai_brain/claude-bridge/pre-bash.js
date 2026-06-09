'use strict';

const policy = require('./policy');

function readStdinSync() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function emit(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

const READ_VERBS = /(^|\s|\||;|&&|\(|`|\$\()(cat|head|tail|less|more|sed|awk|grep|egrep|fgrep|rg|ripgrep|find|file|stat|wc|nl|tac|od|xxd|hexdump|tar|unzip)\s+([^\s|;&)`]+)/g;

function extractPaths(cmd) {
  const paths = [];
  let m;
  while ((m = READ_VERBS.exec(cmd)) !== null) {
    const candidate = m[3].replace(/^["']|["']$/g, '');
    if (candidate.startsWith('-')) continue;
    if (!/[\/\.]/.test(candidate)) continue;
    paths.push(candidate);
  }
  return paths;
}

function run() {
  const raw = readStdinSync();
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}
  const ti = input.tool_input || {};
  const cmd = ti.command || '';

  if (!cmd) process.exit(0);

  const paths = extractPaths(cmd);
  for (const p of paths) {
    const check = policy.checkPath(p);
    if (!check.allowed && check.reason === 'mercury_ignored') {
      emit(
        `BLOCKED (claude-bridge ignore via Bash): ${check.path} is mercury.ignore-protected. ` +
        `Bash read commands cannot bypass the ignore policy. ` +
        `If the file is genuinely needed, surface the policy decision to Trey.`,
        2
      );
    }
  }

  process.exit(0);
}

if (require.main === module) run();
module.exports = { run, extractPaths };
