import pathlib,subprocess,json
p=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text())
for side,blob in [('source-baseline',m['baselineLogger']),('source-candidate',m['files']['ogz-meta/claudito-logger.js'])]:
 target=p/'fixtures'/side/'claudito-logger.js';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(subprocess.check_output(['git','cat-file','blob',blob]))
 runner=p/'fixtures/verify-proof-broker.cjs'
 subprocess.run(['python3','scripts/test-isolated.py','--fixture',str(runner.relative_to(root)),'--fixture',str(target.relative_to(root)),'--','env','SOURCE='+side,'node',str(runner.relative_to(root))],cwd=root,check=True)
