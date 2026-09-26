'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const {getBlastRadius}=require(path.join(clone,'tools/serena-bridge'));
const {scanRepo}=require(path.join(clone,'tools/serena-symbol-scanner'));
(async()=>{
  fs.mkdirSync(path.join(packet,'private'),{mode:0o700});
  const inherited=cp.execFileSync('git',['diff','--binary','--','modules/TimeSeriesMomentum.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js'],{cwd:root,maxBuffer:8e6});
  fs.writeFileSync(path.join(packet,'private/inherited-before.patch'),inherited,{flag:'wx',mode:0o600});
  const scan=scanRepo(clone);
  const record={at:new Date().toISOString(),boundary:'Existing Mercury dependency/Serena AST tools; static candidates, not execution completeness',
    filesScanned:scan.filesScanned,filesParsed:scan.filesParsed,errors:scan.errors,fileReceipts:scan.fileReceipts,
    references:scan.propertyRefs.filter(r=>['lookback','trendPeriod','atrPeriod','minReturn','atrStopMult','allowShorts','trailAtrMult','tsmLookback'].includes(r.property)),
    callers:scan.methodCalls.filter(r=>['evaluate','saveSettings','createExitContract','_updateTrailingStopState'].includes(r.method)),
    blast:await Promise.all(['modules/TimeSeriesMomentum.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js'].map(p=>getBlastRadius(p)))};
  const bytes=JSON.stringify(record,null,2)+'\n';fs.writeFileSync(path.join(packet,'private/blast.json'),bytes,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({filesScanned:record.filesScanned,filesParsed:record.filesParsed,errors:record.errors,references:record.references.length,
    callers:record.callers.length,blast:record.blast.map(x=>({file:x.file,callers:x.callerCount,truncated:x.truncated})),sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
})();
