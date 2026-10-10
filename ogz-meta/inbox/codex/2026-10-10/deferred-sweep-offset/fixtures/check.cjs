'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const packet=path.resolve(__dirname,'..'),receipt=JSON.parse(fs.readFileSync(path.join(packet,'final-reviewed-source-receipt.json'))),root=receipt.sourceRoot;
assert(root.startsWith(packet+'/root-scratch/'));
process.env.PROFILE='paper';process.env.WEBSOCKET_AUTH_TOKEN='fixture-token';process.env.ALPACA_API_KEY='fixture-key';process.env.ALPACA_API_SECRET='fixture-secret';
const C=require(root+'/foundation/ConfigLoader'),SMS=require(root+'/modules/SmartMoneySweep'),Base=require(root+'/fixtures-baseline/modules/SmartMoneySweep');
const settingsPath=root+'/config/settings.json',original=fs.readFileSync(settingsPath),report={tree:receipt.tree,checks:[]};
try {
 C.load({silent:true,loadDotenv:false});const canonical=C.get('strategies.SmartMoneySweep');
 const fixture={...canonical,vpLookbackBars:30,vpRthOnly:false,useSessionFilter:false,cashSessionStartHour:0,cashSessionStartMinute:0,cashSessionEndHour:23,cashSessionEndMinute:59};
 const base=new Base(()=>fixture),candidate=new SMS(()=>fixture);let signals=0;const history=[];
 for(let i=0;i<240;i++){const p=100+Math.sin(i*.37)*1.3+Math.cos(i*.13)*.5;history.push({o:p-.13,c:p+.11,h:p+.5,l:p-.5,v:100+(i%13)*20,t:Date.UTC(2026,0,5,14,0)+i*60000});const a=base.update(history.at(-1),history),b=candidate.update(history.at(-1),history);assert.deepEqual(b,a,'canonical three-bar output parity at '+i);if(a)signals++;}assert(signals>0);report.checks.push({canonicalThreeBarReplay:240,identicalSignals:signals});
 const vp={val:99,vah:101,poc:100,lvnLevels:[]},bars=Array.from({length:40},(_,i)=>({o:100,c:100,h:100.5,l:99.5,v:100,t:Date.UTC(2026,0,5,15,0)+i*60000}));bars[35]={...bars[35],l:98};
 const retained=new SMS(()=>C.get('strategies.SmartMoneySweep'));assert.equal(Object.values(retained._detectSweeps(bars,vp)).some(x=>x.long),false);
 const view=C.getSettingsView(),field='strategies.SmartMoneySweep.sweepMaxOffset';assert(view.fields[field].editable);
 const saved=C.saveSettings({requestId:'sweep-four',expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes:{[field]:4}});assert.equal(saved.applied,true,JSON.stringify(saved));assert.equal(JSON.parse(fs.readFileSync(settingsPath)).strategies.SmartMoneySweep.sweepMaxOffset,4);
 retained.observe(bars.at(-1),bars);const detected=retained._detectSweeps(bars,vp);assert.equal(detected[4].long,true);assert.equal(Object.keys(detected).length,4);report.checks.push({realSave:4,retainedDetectionOffset:4});
 const fixture3={...fixture,sweepMaxOffset:3},fixture4={...fixture,sweepMaxOffset:4};let changedSignal=null;
 for(let k=0;k<180&&!changedSignal;k++){
  const rows=Array.from({length:40},(_,i)=>{const p=100+Math.sin((i+k)*.23)*2;return {o:p-.1,c:p+.1,h:p+.5,l:p-.5,v:100+(i%7)*40,t:Date.UTC(2026,0,5,15,0)+i*60000};});
  const a=new SMS(()=>fixture3),b=new SMS(()=>fixture4),aSig=a.update(rows.at(-1),rows),bSig=b.update(rows.at(-1),rows);
  if(!aSig&&bSig){changedSignal={case:k,signal:bSig,consumedOffset:b.barIndex-(bSig.direction==='buy'?b.lastLongSweepBar:b.lastShortSweepBar)};assert.equal(changedSignal.consumedOffset,4);assert(bSig.overrideLevels);}
 }
 assert(changedSignal,'full update must discover a previously excluded fourth-bar signal');report.checks.push({actualUpdate:changedSignal});
 const shortBars=bars.map(x=>({...x}));shortBars[35].l=99.5;shortBars[35].h=102;assert.equal(retained._detectSweeps(shortBars,vp)[4].short,true);report.checks.push({shortDetectionOffset:4});
 const v2=C.getSettingsView();assert(C.saveSettings({requestId:'sweep-one',expectedRevision:v2.configuration.settings,expectedSettingsHash:v2.configuration.settingsHash,changes:{[field]:1}}).applied);retained.observe(bars.at(-1),bars);assert.deepEqual(Object.keys(retained._detectSweeps(bars,vp)),['1']);report.checks.push({savedLookbackContractsTo:1});
 const wideCap={...fixture4,maxLossPct:10,slBufferPct:0};const stopOwner=new SMS(()=>wideCap);
 const longLevels=stopOwner._computeExitLevels('buy',100,bars,1,vp,1),shortLevels=stopOwner._computeExitLevels('sell',100,shortBars,1,vp,1);
 assert.equal(longLevels.stopLoss,98);assert.equal(shortLevels.stopLoss,102);
 report.checks.push({fourthBarStopGeometry:{long:longLevels.stopLoss,short:shortLevels.stopLoss}});
 report.status='pass';console.log(JSON.stringify(report));
}finally{fs.writeFileSync(settingsPath,original);fs.writeFileSync(path.join(packet,'behavior.json'),JSON.stringify(report,null,2)+'\n');}
