'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const packet=__dirname,root=path.resolve(packet,'../../../../..');
const {inspectLine,loadBurnedTokenHashes}=require(path.join(root,'scripts/scan-secrets.js'));
const burned=loadBurnedTokenHashes(),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(packet,'TAPES.json'),'utf8'));
const checked=new Map(),errors=[],findings=[],metadataFalsePositives=[];
for(const row of manifest.records){
 if(row.absence){errors.push({source:row.source,error:row.absence});continue;}
 if(!checked.has(row.artifact)){
  const compressed=fs.readFileSync(path.join(packet,row.artifact)),redacted=zlib.gunzipSync(compressed);
  checked.set(row.artifact,{compressed:hash(compressed),redacted:hash(redacted),storedBytes:compressed.length,redactedBytes:redacted.length});
  const lines=redacted.toString('utf8').split('\n');
  for(let i=0;i<lines.length;i++)for(const finding of inspectLine(row.artifact,i+1,lines[i],burned)){
   // Existing scanner treats metadata apiKeySource="none" as a credential.
   // Classify only the exact benign metadata line; every other hit stays visible.
   const metadataValues=[...lines[i].matchAll(/"apiKeySource"\s*:\s*"([^"]*)"/g)].map(match=>match[1]);
   if(finding.reason==='JSON credential apiKeySource contains a non-placeholder value' && metadataValues.length>0 && metadataValues.every(value=>value==='none'))metadataFalsePositives.push({...finding,verifiedValues:metadataValues});
   else findings.push(finding);
  }
 }
 const actual=checked.get(row.artifact);
 for(const key of ['compressed','redacted','storedBytes','redactedBytes'])if(actual[key]!==row[key])errors.push({source:row.source,error:'mismatch_'+key});
 const marker=row.source.lastIndexOf('#line=');
 let original;
 if(marker>=0){const source=row.source.slice(0,marker),line=Number(row.source.slice(marker+6));original=Buffer.from(fs.readFileSync(path.join(root,source),'utf8').split('\n')[line-1]+'\n');}
 else original=fs.readFileSync(path.join(root,row.source));
 if(hash(original)!==row.original)errors.push({source:row.source,error:'original_hash_mismatch'});
}
const result={result:errors.length||findings.length?'FAIL':'PASS',records:manifest.records.length,uniquePayloads:checked.size,errors,findings,metadataFalsePositives};
fs.writeFileSync(path.join(packet,'TAPE-VALIDATION.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=1;
