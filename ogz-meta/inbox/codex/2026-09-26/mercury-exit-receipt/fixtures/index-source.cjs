'use strict';
// Execute receipt observations against the exact Git-index JS, not dirty source.
const Module = require('module');
const path = require('path');
const { execFileSync } = require('child_process');
const root = process.cwd();
const original = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => {
  const rel = path.relative(root, filename).replace(/\\/g, '/');
  if (!rel.startsWith('../') && !rel.startsWith('node_modules/') && !rel.startsWith('ogz-meta/inbox/')) {
    const content = execFileSync('git', ['show', `:${rel}`],
      { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 8 * 1024 * 1024 }).toString();
    return module._compile(content, filename);
  }
  return original(module, filename);
};
