'use strict';
// Exercise the real child-process pipe, without invoking a provider or bot.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const Module = require('module');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const sourcePath = 'trai_brain/mercury-bridge/llm-client.js';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function load(source) {
  const filename = path.join(root, sourcePath);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(source + '\nmodule.exports.observeExecFileAsync = execFileAsync;\n', filename);
  return instance.exports;
}
async function main() {
  const beforeSource = execFileSync('git', ['show', 'HEAD:' + sourcePath], { cwd: root, encoding: 'utf8' });
  const afterSource = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const before = load(beforeSource), after = load(afterSource);
  const prompt = 'source evidence π\n'.repeat(20000);
  const reader = 'const fs=require("fs"),c=require("crypto"),b=fs.readFileSync(0);process.stdout.write(JSON.stringify({bytes:b.length,sha256:c.createHash("sha256").update(b).digest("hex")}));';
  let oldError;
  try { await before.observeExecFileAsync(process.execPath, ['-e', reader, prompt], { timeout: 5000 }); }
  catch (error) { oldError = error.code; }
  const result = await after.observeExecFileAsync(process.execPath, ['-e', reader], { input: prompt, timeout: 5000 });
  const received = JSON.parse(result.stdout);
  const short = await after.observeExecFileAsync(process.execPath, ['-e', 'process.stdout.write("no-input-ok")'], { timeout: 5000 });
  let childFailure;
  try { await after.observeExecFileAsync(process.execPath, ['-e', 'process.stderr.write("named-child-failure");process.exit(7)'], { input: prompt, timeout: 5000 }); }
  catch (error) { childFailure = { code: error.code, stderr: String(error.stderr) }; }
  let pipeFailure;
  try { await after.observeExecFileAsync(process.execPath, ['-e', 'process.stdin.destroy();process.exit(0)'], { input: prompt.repeat(20), timeout: 5000 }); }
  catch (error) { pipeFailure = error.code; }
  let captured;
  const client = new after.ClaudeCodeConsensusClient({ provider: 'claude-code', model: 'fable', permissionMode: 'dontAsk',
    execFileAsync: async (command, args, options) => { captured = { args, input: options.input }; const error = new Error('LOCAL_CAPTURE_ONLY'); throw error; } });
  client.executableTrust = { realpath: '/unused-local-capture' };
  try { await client.runClaudeCodeWithMetadata(prompt, 'read-only'); }
  catch (error) { if (error.message !== 'LOCAL_CAPTURE_ONLY') throw error; }
  const receipt = { at: new Date().toISOString(), providerCalls: 0, beforeSourceSha256: sha(beforeSource), afterSourceSha256: sha(afterSource),
    oldError, input: { bytes: Buffer.byteLength(prompt), sha256: sha(prompt) }, received,
    noInputPreserved: short.stdout === 'no-input-ok', childFailure, pipeFailure,
    productionCall: { promptAbsentFromArgv: !captured.args.includes(prompt), inputMatches: captured.input === prompt,
      toolsDisabled: captured.args[captured.args.indexOf('--tools') + 1] === '', strictMcp: captured.args.includes('--strict-mcp-config') },
    limits: ['Real OS argv/pipe boundary only; the child is a synthetic byte reader, not Claude or a model review. No full-chain or bot acceptance.'] };
  receipt.passed = oldError === 'E2BIG' && received.bytes === receipt.input.bytes && received.sha256 === receipt.input.sha256
    && receipt.noInputPreserved && childFailure?.code === 7 && childFailure.stderr === 'named-child-failure'
    && pipeFailure === 'EPIPE' && Object.values(receipt.productionCall).every(Boolean);
  fs.writeFileSync(path.join(__dirname, 'transport-observation.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.passed) process.exitCode = 2;
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
