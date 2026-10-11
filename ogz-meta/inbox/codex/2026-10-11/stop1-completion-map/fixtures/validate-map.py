from pathlib import Path
import json,hashlib,collections,base64
base=Path(__file__).resolve().parent.parent
repo=base.parents[4]
def read(path): return json.loads(path.read_text())
def leaves(value,prefix=""):
    if isinstance(value,dict) and value: return [p for k,v in value.items() for p in leaves(v,f"{prefix}.{k}" if prefix else k)]
    if isinstance(value,list) and value: return [p for i,v in enumerate(value) for p in leaves(v,f"{prefix}.{i}")]
    return [prefix]
expected={(owner,key) for owner in ['config/settings.json','config/internals.json'] for key in leaves(read(repo/owner))}
index=read(base/'map-index.json'); found=[]; issues=[]
for group in index['groups']:
    path=base/group['file']
    if base64.b64encode(hashlib.sha256(path.read_bytes()).digest()).decode()!=group['sha256Base64']: issues.append('content hash mismatch '+str(path))
    rs=[json.loads(line) for line in path.read_text().splitlines()]
    if len(rs)!=group['entries']: issues.append('group count mismatch '+str(path))
    for row in rs:
        pair=(row['owner'],row['key']); found.append(pair)
        for field in ['purpose','initialization','consumer','effect','precedence','sourceStatus','nextCheck']:
            if not row.get(field): issues.append('empty field '+str(pair)+' '+field)
        if row['completionStatus']!='source_mapped_runtime_acceptance_not_claimed': issues.append('unexpected completion claim '+str(pair))
counts=collections.Counter(found)
missing=sorted(expected-set(found)); extra=sorted(set(found)-expected); duplicates=[pair for pair,count in counts.items() if count>1]
ui=read(base/'ui-bindings.json'); current_owners={owner:read(repo/owner) for owner in ['config/settings.json','config/internals.json']}
for row in ui['rows']:
    if not row['coveredCanonicalKeys'] or not row['valueMatchesOwner']: issues.append('UI owner mismatch '+row['key'])
    for key in row['coveredCanonicalKeys']:
        if (row['owner'],key) not in expected: issues.append('missing UI target '+key)
census=read(base.parent/'stop1-acceptance-audit/source-census.json')
changed=[s['file'] for s in census['sources'] if hashlib.sha256((repo/s['file']).read_bytes()).hexdigest()!=s['sha256']]
for s in ui['summary']['sources']:
    if hashlib.sha256((repo/s['file']).read_bytes()).hexdigest()!=s['sha256']: changed.append(s['file'])
result={'passed':not(issues or missing or extra or duplicates or changed),'canonicalEntries':len(expected),'mappedEntries':len(found),'missing':missing,'extra':extra,'duplicates':duplicates,'issues':issues,'uiDescriptors':len(ui['rows']),'changedSourceFiles':sorted(set(changed)),'scope':'Completeness, required evidence columns, exact UI targets and unchanged source bytes. Semantic/source review is separate; this is not runtime acceptance.'}
(base/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
raise SystemExit(0 if result['passed'] else 1)
