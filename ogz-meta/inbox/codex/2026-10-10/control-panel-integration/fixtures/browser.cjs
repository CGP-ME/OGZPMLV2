'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),parser=require('@babel/parser');
const packet=path.resolve(__dirname,'..');
const {sourceRoot:root,tree}=JSON.parse(fs.readFileSync(path.join(packet,'final-reviewed-source-receipt.json')));
assert(root.startsWith(path.join(packet,'root-scratch')+path.sep), 'Browser acceptance must use the isolated source export');
const originalSettings=fs.readFileSync(path.join(root,'config/settings.json'));
const {chromium}=require('/home/linuxuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const results={tree,checks:[],limitations:['Isolated real settings owner and production auth/relay handlers; no broker process, orders, PM2 restart, or deployment.']};
const check=(name)=>{results.checks.push(name);console.log('PASS '+name);};
function method(file,name){const src=fs.readFileSync(path.join(root,file),'utf8');let found;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ClassMethod'&&n.key.name===name)found=src.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parser.parse(src));assert(found);return found;}
(async()=>{
 let server,browser;
 try{
 server=await require('./server.cjs').start(root);
 const C=server.ConfigLoader, initial=C.getSettingsView(), initialDisk=JSON.parse(fs.readFileSync(server.settingsPath));
 const EMA=require(path.join(root,'modules/EMATrendRetest'));const retained=new EMA(C.get('strategies.EMATrendRetest'),C.get('exitContracts.EMATrendRetest'));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const resp=await page.goto(server.url+'/control-panel.html');assert.match(resp.headers()['cache-control'],/no-store/);
 await page.locator('#cpSignIn:not([hidden])').waitFor();
 assert.equal((await context.request.get(server.url+'/api/dashboard/session-ticket')).status(),401);
 await page.locator('#cpToken').fill('invalid-fixture-token');await page.locator('#cpSubmit').click();await page.waitForFunction(()=>document.querySelector('#cpError').textContent==='Token rejected.');
 await page.locator('#cpToken').fill(server.token);await page.locator('#cpSubmit').click();await page.locator('#cpSignOut:not([hidden])').waitFor();
 const owner=page.getByLabel('Settings bot owner');await page.waitForFunction(()=>document.querySelector('select[aria-label="Settings bot owner"]').options.length>1);
 await owner.selectOption({index:1});
 assert.match(await owner.innerText(),new RegExp(initial.profile));
 assert.equal(errors.length,0);check('Actual session cookie/ticket login, no-store and OGZ.init without dashboard panels');
 const search=page.getByLabel('Search settings');
 async function field(p){await search.fill(p);return page.locator('#setting-'+p.replace(/[^a-zA-Z0-9_-]/g,'-'));}
 await (await field('strategies.EMATrendRetest.emaPeriods')).fill('3, 5');
 const profilePath='pipeline.enableRSI',changedToggle=!initial.fields[profilePath].value;await (await field(profilePath)).click();
 await page.getByRole('button',{name:'Review changes',exact:true}).click();assert.equal(await page.locator('.settings-review-row').count(),2);
 const save=page.getByRole('button',{name:'Save edited settings',exact:true});await save.click();
 await page.waitForFunction(()=>document.querySelector('.settings-status').textContent.startsWith('Bot confirmed settings saved and applied'));
 const disk=JSON.parse(fs.readFileSync(server.settingsPath));assert.equal(disk.strategies.EMATrendRetest.emaPeriods,'3, 5');assert.equal(disk.launchProfiles[initial.profile].pipeline.enableRSI,changedToggle);
 for(const [name,p] of Object.entries(initialDisk.launchProfiles))if(name!==initial.profile)assert.deepEqual(disk.launchProfiles[name],p);
 assert.equal(C.getSettingsView().configuration.settings,initial.configuration.settings+1);check('Browser saved shared field and active-profile switch through actual ConfigLoader; other profiles unchanged');
 const candles=[];for(let i=0;i<22;i++){const c=100+i*.4;candles.push({o:c-.1,h:c+.25,l:c-.25,c,v:100000,t:Date.UTC(2026,5,15,13,30+i)});}candles[21]={o:108.3,h:108.7,l:107.5,c:108.45,v:100000,t:Date.UTC(2026,5,15,13,51)};candles.push({o:108.5,h:109.4,l:108.4,c:109.2,v:100000,t:Date.UTC(2026,5,15,13,52)});
 const signal=retained.evaluate({priceHistory:candles},C.get('strategies.EMATrendRetest'),C.get('exitContracts.EMATrendRetest'));assert(signal);assert([3,5].includes(signal.signalData.emaPeriod));assert.deepEqual(retained.getState().emaPeriods,[3,5]);
 const apply=new Function('ConfigLoader',`return ({${method('core/StrategyOrchestrator.js','_applyPipelineToggles')}})._applyPipelineToggles;`)(C);const rsi={name:'RSI'},ctx={registeredStrategies:[rsi],builtinStrategies:new Set([rsi])};apply.call(ctx);assert.equal(ctx.strategies.includes(rsi),changedToggle);check('Retained EMA consumer uses saved periods; actual orchestrator method honors saved profile switch');
 await page.reload();await page.waitForFunction(()=>document.querySelector('select[aria-label="Settings bot owner"]')?.options.length>1);await owner.selectOption({index:1});assert.equal(await (await field('strategies.EMATrendRetest.emaPeriods')).inputValue(),'3, 5');check('Reload reads persisted settings through session ticket');
 await (await field('strategies.EMATrendRetest.emaPeriods')).fill('4, 6');
 const external=JSON.parse(fs.readFileSync(server.settingsPath));external.fees.slippage+=0.0001;fs.writeFileSync(server.settingsPath,JSON.stringify(external,null,2)+'\n');
 await save.click();await page.waitForFunction(()=>document.querySelector('.settings-status').textContent.startsWith('Save not confirmed'));
 assert.equal(await (await field('strategies.EMATrendRetest.emaPeriods')).inputValue(),'4, 6');
 C.load({force:true,silent:true,loadDotenv:false});await page.getByRole('button',{name:'Refresh connected bots',exact:true}).click();
 const rebase=page.getByRole('button',{name:'Use refreshed configuration for these edits',exact:true});await rebase.waitFor();await rebase.click();await save.click();await page.waitForFunction(()=>document.querySelector('.settings-status').textContent.startsWith('Bot confirmed settings saved and applied'));check('Out-of-band change rejects stale save; draft survives refresh and explicit rebase then saves');
 await search.fill('fees.slippage');await page.screenshot({path:path.join(packet,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(packet,'mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));check('Desktop/mobile layout captured with no horizontal overflow');await page.setViewportSize({width:1440,height:1000});
 await (await field('strategies.EMATrendRetest.emaPeriods')).fill('5, 7');server.holdSettings(true);await save.click();await new Promise(r=>setTimeout(r,100));server.disconnectDashboards();await page.waitForFunction(()=>/outcome|unknown|disconnected/i.test(document.querySelector('.settings-status').textContent));server.holdSettings(false);
 await page.waitForFunction(()=>window.OGZ.get('Socket').isConnected());await new Promise(r=>setTimeout(r,200));assert.equal(await (await field('strategies.EMATrendRetest.emaPeriods')).inputValue(),'5, 7');assert.equal(JSON.parse(fs.readFileSync(server.settingsPath)).strategies.EMATrendRetest.emaPeriods,'4, 6');check('Disconnect mid-save preserves draft, reports unknown outcome and does not retry');
 const baseline=server.frames.filter(f=>f.type==='auth').length;
 console.log('Beginning 95-second real idle connection observation');await new Promise(r=>setTimeout(r,95000));assert.equal(server.frames.filter(f=>f.type==='auth').length,baseline);assert(server.frames.some(f=>f.type==='ping'));assert(!server.frames.some(f=>['asset_change','request_historical'].includes(f.type)));assert.equal(errors.length,0);check('95 seconds without market frames: heartbeat stays live, no reconnect or market subscription');
 await page.locator('#cpSignOut').click();await page.locator('#cpSignIn:not([hidden])').waitFor();assert.equal((await context.request.get(server.url+'/api/dashboard/session-ticket')).status(),401);assert.equal(await page.evaluate(()=>localStorage.getItem('ogz.dashboard.wsToken')),null);check('Sign out clears session cookie and browser credential');
 results.status='pass';
 }catch(e){results.status='fail';results.error=e.stack;console.error(e.stack);process.exitCode=1;}finally{fs.writeFileSync(path.join(packet,'browser-acceptance.json'),JSON.stringify(results,null,2)+'\n');if(browser)await browser.close();if(server)await server.close();fs.writeFileSync(path.join(root,'config/settings.json'),originalSettings);}
})();
