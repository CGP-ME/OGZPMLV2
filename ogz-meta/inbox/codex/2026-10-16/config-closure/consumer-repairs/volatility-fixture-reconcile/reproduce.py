import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent;root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip());m=json.loads((p/'source-manifest.json').read_text());args=['python3','scripts/test-isolated.py','--fixture',str((p/'fixtures/run-test.cjs').relative_to(root))]
for file,blob in m['files'].items():
 f=p/'fixtures/exact'/file;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(subprocess.check_output(['git','cat-file','blob',blob]));args+=['--fixture',str(f.relative_to(root))]
raise SystemExit(subprocess.call(args+['--','node',str((p/'fixtures/run-test.cjs').relative_to(root))]))
