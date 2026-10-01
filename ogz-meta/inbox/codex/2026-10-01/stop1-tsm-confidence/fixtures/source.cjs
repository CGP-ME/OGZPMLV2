'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),diff=require('diff'),assert=require('assert/strict');
const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),packet=path.resolve(__dirname,'..');
const baseline='8eabf0f4e61d4edd4cdae974a19c6fdbf41400e2';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const dependencies=[
 '../ema-crossover-confidence/fixtures/module.patch',
 '../ema-crossover-confidence/fixtures/loader-final-head.patch',
 '../ema-crossover-confidence/fixtures/producers.patch',
 '../ema-crossover-confidence/fixtures/role-ownership.patch',
 '../ma-sr-confidence/module.patch',
 '../ma-sr-confidence/loader-dependent.patch',
 '../ma-sr-confidence/cap-boundary.patch',
 '../ma-sr-confidence/producers.patch',
 '../liquidity-confidence/fixtures/module.patch',
 '../liquidity-confidence/fixtures/loader.patch',
 '../liquidity-confidence/fixtures/producers.patch',
];
function createSource({includeOwn=true,tree=process.env.TSM_REVIEW_TREE}={}){
 const patches={},modified=new Set(),cache=new Map(),loaded={};let sourceDir;
 if(tree!==undefined){assert.match(tree,/^[0-9a-f]{40}$/i);assert.equal(cp.execFileSync('git',['cat-file','-t',tree],{cwd:root,encoding:'utf8'}).trim(),'tree');}
 const ref=tree||baseline,gitRead=file=>cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:30e6});
 const tracked=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only',ref],{cwd:root,encoding:'utf8'}).trim().split('\n'));
 if(!tree){
  const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'dependency-lock.json'),'utf8'));
  const patchPaths=[...dependencies,...(includeOwn?['fixtures/loader.patch']:[])];
  for(const name of patchPaths){const text=fs.readFileSync(path.resolve(packet,name),'utf8');patches[name]=hash(text);if(name in lock)assert.equal(patches[name],lock[name],`dependency changed: ${name}`);for(const p of diff.parsePatch(text))modified.add(p.oldFileName.replace(/^a\//,''));}
  fs.mkdirSync(path.join(packet,'private'),{recursive:true});sourceDir=fs.mkdtempSync(path.join(packet,'private/source-'));
  for(const file of modified){const target=path.join(sourceDir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,gitRead(file));}
  for(const name of patchPaths)cp.execFileSync('git',['apply','-C0',`--directory=${path.relative(root,sourceDir)}`,path.resolve(packet,name)],{cwd:root,stdio:['ignore','pipe','pipe']});
 }
 function source(file){if(!cache.has(file))cache.set(file,!tree&&modified.has(file)?fs.readFileSync(path.join(sourceDir,file),'utf8'):gitRead(file));return cache.get(file);}
 const relevant=[...new Set([...modified,'foundation/ConfigLoader.js','modules/TimeSeriesMomentum.js','core/StrategyOrchestrator.js','core/IndicatorCalculator.js','core/CandleHelper.js','core/AtomicWrite.js','config/settings.json','config/internals.json'])];
 const selection=tree?{mode:'immutable_review_tree',tree,patchesApplied:false}:{mode:includeOwn?'baseline_dependencies_and_lane':'baseline_dependencies_only',baseline,patchesApplied:true};
 return{root,packet,tracked,source,loaded,manifest:()=>({selection,patches,sourceSha256:Object.fromEntries(relevant.map(file=>[file,hash(source(file))])),loadedSourceSha256:{...loaded}}),hash};
}
module.exports={createSource,root,packet,dependencies,hash};
