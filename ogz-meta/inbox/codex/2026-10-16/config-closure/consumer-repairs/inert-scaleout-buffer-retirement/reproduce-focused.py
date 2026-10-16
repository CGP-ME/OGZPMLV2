#!/usr/bin/env python3
import json,subprocess,argparse
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('variant',choices=['baseline','candidate']);args=parser.parse_args()
p=Path(__file__).resolve().parent;root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text());ref=m['reviewBase' if args.variant=='baseline' else 'reviewCandidate'];files=list(json.loads((p/'focused-source-manifest.json').read_text())['files'])
cmd=['python3','scripts/test-isolated.py','--fixture',str((p/'fixtures/run-focused.cjs').relative_to(root))]
for file in files:
 f=p/'fixtures/focused'/file;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','show',ref+':'+file]));cmd+=['--fixture',str(f.relative_to(root))]
raise SystemExit(subprocess.call(cmd+['--','node',str((p/'fixtures/run-focused.cjs').relative_to(root))]))
