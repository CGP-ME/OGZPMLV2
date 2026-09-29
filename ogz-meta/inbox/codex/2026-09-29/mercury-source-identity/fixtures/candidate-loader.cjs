'use strict';
// Load tracked implementation bytes from one immutable Git tree, retaining normal
// module resolution for installed dependencies. Never execute evidence-view files.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../../../../..');
const tree = process.env.MERCURY_HARNESS_TREE;
if (!tree || !/^[a-f0-9]{40}$/.test(tree)) throw Error('Fixture requires an explicit immutable implementation tree');
const tracked = new Set(cp.execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', tree], {cwd: root, encoding: 'utf8'}).split('\0'));
const previous = Module._extensions['.js'];
Module._extensions['.js'] = (mod, file) => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (tracked.has(relative) && !relative.startsWith('node_modules/')) {
    const source = cp.execFileSync('git', ['show', tree + ':' + relative], {cwd: root, encoding: 'utf8', maxBuffer: 64000000});
    return mod._compile(source, file);
  }
  return previous(mod, file);
};
console.log('[fixture] implementation tree ' + tree);
