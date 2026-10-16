#!/usr/bin/env python3
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent
root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text()); files=[p/'fixtures/probe.cjs']
for mode,entries in m['reproductionSources'].items():
 for name,blob in entries.items():
  f=p/'fixtures'/mode/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','cat-file','blob',blob]));files.append(f)
args=['python3','scripts/test-isolated.py']
for f in files:args+=['--fixture',str(f.relative_to(root))]
for mode in ['baseline','candidate']:
 subprocess.run(args+['--','node',str((p/'fixtures/probe.cjs').relative_to(root)),mode],check=True)
