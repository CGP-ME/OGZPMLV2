const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const Module = require('node:module');
const {root, manifest, sources} = require('./build-implementation.cjs');
const overrides = new Map(manifest.files.map(file=>[file.path,file]));
const tracked = new Set(cp.execFileSync('git',['ls-tree','-r','--name-only','-z',manifest.base_commit],{cwd:root,encoding:'utf8'}).split('\0'));
const previous = Module._extensions['.js'];
Module._extensions['.js'] = (mod,file) => {
 const relative=path.relative(root,file).split(path.sep).join('/');
 if(overrides.has(relative)) {
  const content=sources.get(relative);
  if(crypto.createHash('sha256').update(content).digest('hex')!==overrides.get(relative).implementation_sha256) throw Error('Fixture implementation hash mismatch: '+relative);
  return mod._compile(content,file);
 }
 if(tracked.has(relative) && !relative.startsWith('node_modules/')) return mod._compile(cp.execFileSync('git',['show',manifest.base_commit+':'+relative],{cwd:root,encoding:'utf8',maxBuffer:64000000}),file);
 return previous(mod,file);
};
global.__mercuryQualificationImplementation=manifest;
