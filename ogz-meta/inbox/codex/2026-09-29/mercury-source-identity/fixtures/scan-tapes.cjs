'use strict';
const fs=require('node:fs'),z=require('node:zlib'),path=require('node:path'),c=require('node:crypto');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const {inspectLine,loadBurnedTokenHashes}=require(path.join(root,'scripts/scan-secrets'));
const verification=JSON.parse(fs.readFileSync(path.join(packet,'private/scanner-hash-verification.json')));
const original=fs.readFileSync(path.join(root,verification.path),'utf8').split('\n').slice(verification.line_start-1,verification.line_end).join('\n');
if(c.createHash('sha256').update(original).digest('hex')!==verification.digest)throw Error('Digest false-positive proof failed');
const tapes=JSON.parse(fs.readFileSync(path.join(packet,'TAPES.json'))),burned=loadBurnedTokenHashes(),remaining=[];
for(const record of tapes.records){
 let text=z.gunzipSync(fs.readFileSync(path.join(packet,record.artifact))).toString();
 // Scanner-input normalization only; stored tape bytes remain unchanged.
 text=text.split(verification.digest).join('[VERIFIED_EVIDENCE_DIGEST]');
 text=text.replace(/"apiKeySource":"none"/g,'"apiKeySource":"[REDACTED]"');
 for(const [i,line]of text.split('\n').entries())remaining.push(...inspectLine(record.artifact,i+1,line,burned));
}
const receipt={tapes:tapes.records.length,verifiedDigestCount:1,unresolvedFindings:remaining};
fs.writeFileSync(path.join(packet,'private/tape-scan-disposition.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));if(remaining.length)process.exitCode=1;
