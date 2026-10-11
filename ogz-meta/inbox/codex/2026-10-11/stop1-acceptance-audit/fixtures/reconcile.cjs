'use strict';
const fs=require('fs');
const path=require('path');
const dir=path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const census=read('source-census.json');
const packets=['strategies.coverage.json','execution.coverage.json','services.coverage.json','auxiliary.coverage.json','indicators-memory.json','strategies-deep.json','strategies-secondary.json','profiles.json'];
const evidence=[];
for(const packet of packets){
  if(!fs.existsSync(path.join(dir,packet)))continue;
  const data=read(packet);
  for(const row of (Array.isArray(data)?data:data.rows||data.per_key_rows||[])){
    if(!row.owner||!row.key)throw new Error(`Audit evidence row lacks owner/key: ${packet}`);
    let key=row.key;
    if(row.owner==='config/internals.json')key=key.replace(/^internals\./,'');
    if(row.owner==='config/settings.json')key=key.replace(/^settings\./,'');
    evidence.push({...row,key,packet});
  }
}
const rows=census.leaves.map(leaf=>{
  const exact=evidence.filter(r=>r.owner===leaf.owner&&r.key===leaf.key);
  const prefix=evidence.filter(r=>r.owner===leaf.owner&&leaf.key.startsWith(r.key+'.')&&/^\d+(\.|$)/.test(leaf.key.slice(r.key.length+1)));
  const candidates=exact.length?exact:prefix;
  const last=candidates[candidates.length-1];
  return {...leaf,status:last?.status||'NOT_REVIEWED',evidencePacket:last?.packet||null,evidence:last?.evidence||last?.citation||last?.reader||[],effect:last?.effect||null,initializedCaller:last?.initializedCaller||null,arrayGroup:exact.length?null:last?.key||null};
});
const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
const missing=rows.filter(r=>r.status==='NOT_REVIEWED');
const header={head:census.head,method:'Every canonical leaf/empty-container inventoried. Final per-key source-effect dispositions reconcile bounded agent passes. Array elements inherit only an explicitly reviewed containing array. Statuses are source evidence, not full runtime acceptance. Evidence is in evidencePacket at the same owner/key, or arrayGroup when specified.',total:rows.length,counts};
fs.writeFileSync(path.join(dir,'coverage-detailed.private.json'),JSON.stringify({...header,rows},null,2)+'\n');
const index=rows.map(({owner,key,status,evidencePacket,arrayGroup})=>({owner,key,status,evidencePacket,...(arrayGroup?{arrayGroup}:{})}));
fs.writeFileSync(path.join(dir,'coverage.json'),JSON.stringify({...header,rows:index},null,2)+'\n');
console.log(JSON.stringify({total:rows.length,counts,missing:missing.map(r=>r.owner+':'+r.key)},null,2));
