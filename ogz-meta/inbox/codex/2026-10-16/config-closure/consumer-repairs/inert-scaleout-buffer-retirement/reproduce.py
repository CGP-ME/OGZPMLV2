#!/usr/bin/env python3
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent
root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text());files=[p/'fixtures/verify-retirement.cjs']
for mode,entries in m['reproductionSources'].items():
 for name,entry in entries.items():
  f=p/'fixtures'/mode/entry['fixture'];f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','cat-file','blob',entry['blob']]));files.append(f)
args=['python3','scripts/test-isolated.py']
for f in files:args+=['--fixture',str(f.relative_to(root))]
subprocess.run(args+['--','node',str((p/'fixtures/verify-retirement.cjs').relative_to(root))],check=True)
