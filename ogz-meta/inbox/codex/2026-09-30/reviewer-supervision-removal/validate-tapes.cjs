'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const root=path.resolve(__dirname,'../../../../..');
const {inspectLine,loadBurnedTokenHashes}=require(path.join(root,'scripts/scan-secrets.js'));
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'TAPES.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashes=loadBurnedTokenHashes(),errors=[],findings=[],classified=[],records=[];
for(const r of manifest.records){
  const stored=fs.readFileSync(path.join(__dirname,r.artifact)),plain=zlib.gunzipSync(stored),original=fs.readFileSync(path.join(root,r.source));
  const checks={original:sha(original)===r.original,redacted:sha(plain)===r.redacted,compressed:sha(stored)===r.compressed,
    originalBytes:original.length===r.originalBytes,redactedBytes:plain.length===r.redactedBytes,storedBytes:stored.length===r.storedBytes};
  if(Object.values(checks).some(v=>!v))errors.push({artifact:r.artifact,checks});
  records.push({artifact:r.artifact,...checks});
  const lines=plain.toString('utf8').split('\n');
  for(let i=0;i<lines.length;i++){
    const raw=inspectLine(r.artifact,i+1,lines[i],hashes);
    if(!raw.length)continue;
    const normalized=lines[i].replace(/("apiKeySource"\s*:\s*)"none"/g,'"providerAuthMetadata":"none"');
    const remaining=inspectLine(r.artifact,i+1,normalized,hashes);
    findings.push(...remaining);
    if(raw.length>remaining.length)classified.push({artifact:r.artifact,line:i+1,
      reason:'Original Fable CLI initialization metadata apiKeySource:"none" describes absent key source; it is not a credential.',
      originalFindings:raw,remainingFindings:remaining,storedBytesAltered:false});
  }
}
const result={manifestSha256:sha(fs.readFileSync(path.join(__dirname,'TAPES.json'))),artifacts:records.length,
  valid:errors.length===0&&findings.length===0,hashErrors:errors,remainingSecretFindings:findings,
  metadataFalsePositives:classified,scannerInputOnlyNormalization:'Exact JSON apiKeySource:"none" metadata; stored tapes unchanged.',records};
fs.writeFileSync(path.join(__dirname,'TAPE-VALIDATION.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({artifacts:records.length,valid:result.valid,hashErrors:errors.length,remainingSecretFindings:findings.length,metadataFalsePositives:classified.length}));
if(!result.valid)process.exitCode=1;
