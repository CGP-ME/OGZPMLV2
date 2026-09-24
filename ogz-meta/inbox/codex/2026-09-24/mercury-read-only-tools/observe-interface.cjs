'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
require(path.join(root, 'trai_brain/mercury-bridge/indexer'));
const { createToolAdapter } = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const adapter = createToolAdapter({ repoRoot: root });
const mode = process.argv[2];
async function main() {
  if (!['before', 'after'].includes(mode)) throw new Error('Specify before or after');
  const source = 'trai_brain/mercury-bridge/tool-adapter.js';
  const registry = Object.keys(adapter.tools);
  const schemas = adapter.buildToolSchema().map(s => s.function.name);
  const documented = adapter.buildToolDocs().includes('## run_check');
  const receipt = { at: new Date().toISOString(), mode, registry, schemas, runCheckDocumented: documented,
    sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, source))).digest('hex') };
  if (mode === 'after') {
    // Invoking a removed public name must return the existing unknown-tool result.
    receipt.dispatch = await adapter.execute('run_check', { command: ['node', '--version'] });
    receipt.actualRead = await adapter.execute('open_file', { path: source, start_line: 1, end_line: 20 });
    const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'before.json')));
    receipt.otherToolsUnchanged = JSON.stringify(registry) === JSON.stringify(before.registry.filter(t => t !== 'run_check'))
      && JSON.stringify(schemas) === JSON.stringify(before.schemas.filter(t => t !== 'run_check'));
    receipt.passed = !registry.includes('run_check') && !schemas.includes('run_check') && !documented
      && receipt.dispatch.error?.startsWith('unknown tool: run_check.') && !receipt.actualRead.error && receipt.otherToolsUnchanged;
    if (!receipt.passed) process.exitCode = 2;
  }
  fs.writeFileSync(path.join(__dirname, `${mode}.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ mode, tools: registry.length, runCheckExposed: registry.includes('run_check'),
    runCheckDocumented: documented, passed: receipt.passed, otherToolsUnchanged: receipt.otherToolsUnchanged }));
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
