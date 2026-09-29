// Parent launches only after staging and recording the exact candidate identity.
'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict'), Module = require('node:module');
const root = path.resolve(__dirname, '../../../../..');
const harness = '6bcfad8a25f72cb9e1eb946e854695913b2133c4';
const query = 'Mercury, break my fix. The selected change supplies captured source during candidate and final claim adjudication and preserves source-backed claim decisions through review rechecks. Require current source evidence for findings.';
const options = {maxTokens:7750, reviewersExplicit:true, reviewers:'mercury,fable,kimi'};
const args = process.argv.slice(2);
if (args.includes('--describe')) {
  console.log(JSON.stringify({harness, query, options, identitySchema:{candidate:'immutable Git tree or commit SHA',base:'immutable Git tree or commit SHA',harness:'optional; must equal the pinned harness SHA'},launch:'node review.cjs --identity CANDIDATE.json',check:'add --check to verify identity without providers or writes'},null,2));
} else {
  const identityAt = args.indexOf('--identity');
  const identityPath = identityAt < 0 ? path.join(__dirname,'CANDIDATE.json') : path.resolve(args[identityAt+1] || '');
  const identity = JSON.parse(fs.readFileSync(identityPath,'utf8'));
  assert(/^[a-f0-9]{40}$/.test(identity.candidate), 'An immutable candidate SHA is required');
  assert(/^[a-f0-9]{40}$/.test(identity.base), 'An immutable base SHA is required');
  assert(!identity.harness || identity.harness === harness, 'The review harness must remain pinned to committed 6bcfad8a');
  const git = argv => cp.execFileSync('git',argv,{cwd:root,encoding:'utf8',maxBuffer:64000000});
  const hash = content => crypto.createHash('sha256').update(content).digest('hex');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'IMPLEMENTATION.json')));
  const patch = fs.readFileSync(path.join(__dirname,'head-plus-repair.patch'));
  assert.equal(hash(patch),manifest.patch_sha256,'Repair patch changed');
  const candidateTree = git(['rev-parse',`${identity.candidate}^{tree}`]).trim();
  const baseTree = git(['rev-parse',`${identity.base}^{tree}`]).trim();
  for (const file of manifest.files) {
    assert.equal(hash(git(['show',`${identity.candidate}:${file.path}`])),file.implementation_sha256,`Candidate differs from qualified repair: ${file.path}`);
    assert.equal(hash(git(['show',`${identity.base}:${file.path}`])),file.base_sha256,`Baseline implementation changed: ${file.path}`);
  }
  assert.equal(git(['diff',identity.base,identity.candidate,'--','trai_brain/mercury-bridge/tool-adapter.js']),'','Unrelated tool-adapter edits entered candidate');
  const receipt = {harness,identity_file:path.relative(root,identityPath),candidate:identity.candidate,base:identity.base,candidate_tree:candidateTree,base_tree:baseTree,patch_sha256:manifest.patch_sha256,implementation_files:manifest.files.map(file=>({path:file.path,sha256:file.implementation_sha256})),query,options};
  if (args.includes('--check')) console.log(JSON.stringify({...receipt,provider_calls:0,writes:0},null,2));
  else {
    const privateDir = path.join(__dirname,'private');
    fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
    const invocation = path.join(privateDir,`review-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    fs.mkdirSync(invocation,{mode:0o700});
    process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root,path.join(invocation,'ledger'));
    const save = (name,value) => fs.writeFileSync(path.join(invocation,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
    save('invocation.json',receipt);
    const tracked = new Set(git(['ls-tree','-r','--name-only','-z',harness]).split('\0'));
    const previous = Module._extensions['.js'];
    Module._extensions['.js'] = (mod,file) => {
      const relative = path.relative(root,file).split(path.sep).join('/');
      if(tracked.has(relative) && !relative.startsWith('node_modules/')) return mod._compile(git(['show',`${harness}:${relative}`]),file);
      return previous(mod,file);
    };
    require(path.join(root,'trai_brain/mercury-bridge/ask')).runAgentic(query,{...options,reviewRef:identity.candidate,reviewBase:identity.base}).then(result=>{
      save('result.json',result);
      console.log(JSON.stringify({result:path.relative(root,path.join(invocation,'result.json')),termination:result.termination,run:result.runLedgerEntry?.run_id,verdict:result.runLedgerEntry?.verdict,consensusOk:result.consensus?.ok},null,2));
    }).catch(error=>{save('error.json',{message:error.message});console.error('Review failed; inspect the private error receipt.');process.exitCode=1;});
  }
}
