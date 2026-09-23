'use strict';

// Non-transmitting receipt for the actual caller producer, adapter and serializer.
// Does not import the bot, call a provider, connect MongoDB, or change source.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../../../../..');
const sourcePath = path.join(root, 'tools/serena-bridge.js');
const localRequire = createRequire(sourcePath);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const baseline = '95d7e29a63cff4cb5154f365d02eea0182cfa4ae';
const previousSource = execFileSync('git', ['show', `${baseline}:tools/serena-bridge.js`], {
  cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});
const currentSource = fs.readFileSync(sourcePath, 'utf8');

function loadExactSource(source, filename) {
  const mod = { exports: {} };
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, require: createRequire(filename),
    setTimeout, clearTimeout,
  }, { filename });
  return mod.exports;
}

function delivery(result, allowed, serialize) {
  const serialized = serialize(result);
  const received = JSON.parse(serialized);
  const lines = (received.text || '').split('\n')
    .filter(line => line.startsWith('- ') && line !== '- (none)');
  const expected = allowed.map(c => `- ${c.source}:${c.line}  \`${c.type}\` -> \`${c.target}\``);
  return {
    returnedCount: result.callerCount,
    returnedTruncated: result.truncated,
    deliveredCount: lines.length,
    serializedChars: serialized.length,
    contextCompacted: received._mercury_context_compacted === true,
    missing: expected.filter(line => !lines.includes(line)),
    unexpected: lines.filter(line => !expected.includes(line)),
    serializedSha256: sha(serialized),
    result,
  };
}

async function main() {
  const { getCallers } = localRequire('./dep-scanner');
  const policy = localRequire('../trai_brain/repository-policy');
  const { createToolAdapter } = localRequire('../trai_brain/mercury-bridge/tool-adapter');
  const { stringifyToolResultForHistory } = localRequire('../trai_brain/mercury-bridge/react-loop');
  const beforeBridge = loadExactSource(previousSource, sourcePath);
  const adapter = createToolAdapter({ repoRoot: root });
  const results = [];
  for (const target of ['foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json']) {
    const raw = getCallers(target);
    const allowed = raw.filter(c => !policy.isPathIgnoredByMercury(c.source));
    const before = await beforeBridge.getBlastRadius(target);
    const beforeResult = {
      source: 'serena_blast_radius', file: before.file, callerCount: before.callerCount,
      riskLevel: before.riskLevel, truncated: before.truncated, latencyMs: before.latencyMs,
      text: beforeBridge.formatForMercury(before),
    };
    const after = await adapter.execute('serena_blast_radius', { path: target });
    results.push({ target, rawCount: raw.length, allowedCount: allowed.length,
      allowedCallers: allowed,
      callerFiles: [...new Set(allowed.map(c => c.source))].map(file => ({
        path: file, sha256: sha(fs.readFileSync(path.join(root, file))),
      })),
      before: delivery(beforeResult, allowed, stringifyToolResultForHistory),
      after: delivery(after, allowed, stringifyToolResultForHistory),
    });
  }
  // Replay the same repaired producer bytes against the preserved candidate's
  // real scanner/policy. This is not a transplant, provider run or new index.
  const candidateRoot = '/opt/ogzprime/OGZPMLV2_STOP1_REBUILD_20260922_ecY4OI';
  const candidateRequire = createRequire(path.join(candidateRoot, 'tools/serena-bridge.js'));
  const candidatePolicy = candidateRequire('../trai_brain/repository-policy');
  const candidateRaw = candidateRequire('./dep-scanner').getCallers('foundation/ConfigLoader.js');
  const candidateAllowed = candidateRaw.filter(c => !candidatePolicy.isPathIgnoredByMercury(c.source));
  const replay = loadExactSource(currentSource, path.join(candidateRoot, 'tools/serena-bridge.js'));
  const replayResult = await replay.getBlastRadius('foundation/ConfigLoader.js');
  const candidateReplay = {
    root: candidateRoot, rawCount: candidateRaw.length, allowedCount: candidateAllowed.length,
    excludedCount: candidateRaw.length - candidateAllowed.length,
    ...delivery({ ...replayResult, text: replay.formatForMercury(replayResult) }, candidateAllowed, JSON.stringify),
  };
  const report = {
    observedAt: new Date().toISOString(), root, baseline,
    beforeSourceSha256: sha(previousSource), afterSourceSha256: sha(currentSource),
    loadedSources: ['tools/dep-scanner.js', 'trai_brain/repository-policy.js', 'mercury.ignore',
      'trai_brain/mercury-bridge/tool-adapter.js', 'trai_brain/mercury-bridge/react-loop.js']
      .map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) })),
    results, candidateReplay,
    limitations: [
      'Before-source replay shares current scanner/policy bytes; the earlier actual before-edit invocation is separately recorded in EVIDENCE.md.',
      'The recovered candidate was read only; its source and indexed context were not updated.',
      'Delivery completeness applies only to discovered allowed static caller entries, not all config values, dynamic consumers, or migration correctness.',
      'Zero direct imports for the JSON files does not establish zero consumers; ConfigLoader reads them through filesystem paths.',
      'No provider review, bot execution, complete coverage approval, PM2 action, reindex or broker action occurred.',
      'Larger tool results may still be compacted by the existing context serializer; this receipt reports actual compaction for these targets only.',
    ],
  };
  report.deliveryMatches = results.every(r => r.after.missing.length === 0
    && r.after.unexpected.length === 0 && !r.after.contextCompacted
    && r.after.returnedCount === r.allowedCount && !r.after.returnedTruncated)
    && candidateReplay.missing.length === 0 && candidateReplay.unexpected.length === 0
    && candidateReplay.returnedCount === candidateAllowed.length;
  console.log(JSON.stringify(report, null, 2));
  if (!report.deliveryMatches) process.exitCode = 1;
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
