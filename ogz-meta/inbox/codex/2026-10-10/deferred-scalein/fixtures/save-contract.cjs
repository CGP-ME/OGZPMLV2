'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const packet=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(packet+'/final-reviewed-source-receipt.json')),root=source.sourceRoot;
assert(root.startsWith(packet+'/root-scratch/'));process.chdir(root);
process.env.PROFILE='paper';process.env.WEBSOCKET_AUTH_TOKEN='fixture-token';process.env.ALPACA_API_KEY='fixture-key';process.env.ALPACA_API_SECRET='fixture-secret';
const settingsPath=root+'/config/settings.json',original=fs.readFileSync(settingsPath);
try{
const C=require(root+'/foundation/ConfigLoader');C.load({silent:true,loadDotenv:false});
const {ExitContractManager}=require(root+'/core/ExitContractManager'),ecm=new ExitContractManager();
const beforeRSI=ecm.createExitContract('RSI',{}, {timeframe:'15m'}),beforeNW=ecm.createExitContract('NoWickImbalance',{}, {timeframe:'15m'});
const fields=['exitContracts.default.scaleIn.requireProfitConfirmation','exitContracts.NoWickImbalance.scaleIn.requireProfitConfirmation'],view=C.getSettingsView();
for(const key of fields){assert.equal(view.fields[key].type,'boolean');assert.equal(view.fields[key].effect,'new_trades_only');}
const result=C.saveSettings({requestId:'scale-in-toggle-proof',expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes:Object.fromEntries(fields.map(key=>[key,false]))});assert.equal(result.applied,true,JSON.stringify(result));
const afterRSI=ecm.createExitContract('RSI',{}, {timeframe:'15m'}),afterNW=ecm.createExitContract('NoWickImbalance',{}, {timeframe:'15m'});
for(const contract of [beforeRSI,beforeNW])assert.equal(contract.scaleIn.requireProfitConfirmation,true);
for(const contract of [afterRSI,afterNW])assert.equal(contract.scaleIn.requireProfitConfirmation,false);
const disk=JSON.parse(fs.readFileSync(settingsPath));assert.equal(disk.exitContracts.default.scaleIn.requireProfitConfirmation,false);assert.equal(disk.exitContracts.NoWickImbalance.scaleIn.requireProfitConfirmation,false);
fs.writeFileSync(packet+'/save-contract-proof.json',JSON.stringify({tree:source.tree,status:'pass',savedFields:fields,newRSI:afterRSI.scaleIn,newNoWick:afterNW.scaleIn,existingContractsRetainedTrue:true},null,2)+'\n');console.log('PASS actual ConfigLoader save -> new ECM contracts; existing contract policies unchanged');
}finally{fs.writeFileSync(settingsPath,original);}
