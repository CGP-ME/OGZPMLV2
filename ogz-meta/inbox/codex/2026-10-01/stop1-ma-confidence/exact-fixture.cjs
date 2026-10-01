'use strict';
// Execute unchanged historical fixture bytes against the exact staged tree;
// only its output destination is redirected into today's accountability packet.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict'),crypto=require('crypto');
const originalPacket=path.resolve(__dirname,'../../2026-09-29/ma-sr-confidence');
const names={integration:'integration-cap-qualified.cjs',cap:'cap-boundary.cjs'};
const name=names[process.argv[2]];assert.ok(name,'Choose integration or cap');
const identity=JSON.parse(fs.readFileSync(path.join(__dirname,'CANDIDATE.json'),'utf8'));
assert.match(identity.candidate,/^[a-f0-9]{40}$/);
process.env.MA_REVIEW_TREE=identity.candidate;
delete process.env.MA_CAP_CORRECTION;
process.env.MA_CAP_EXPECT_CORRECTED='1';
const write=fs.writeFileSync.bind(fs);
for(const method of ['writeFileSync','mkdirSync','mkdtempSync']){const original=fs[method];fs[method]=function(destination,...args){const mapped=typeof destination==='string'&&destination.startsWith(originalPacket+path.sep)?path.join(__dirname,path.relative(originalPacket,destination)):destination;return original.call(fs,mapped,...args);};}
const file=path.join(originalPacket,name),source=fs.readFileSync(file,'utf8');
write(path.join(__dirname,'delivery',name+'.exact-identity.json'),JSON.stringify({fixture:file,fixtureSha256:crypto.createHash('sha256').update(source).digest('hex'),candidate:identity.candidate,patchOverlay:false,outputRouting:__dirname},null,2)+'\n');
const fixture=new Module(file,module);fixture.filename=file;fixture.paths=Module._nodeModulePaths(path.dirname(file));fixture._compile(source,file);
