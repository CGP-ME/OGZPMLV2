import pathlib,subprocess,json
p=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text())
fixture_files=[p/'fixtures/verify-trai-blend-owner.cjs']
for side,files in m['reproductionSources'].items():
 for name,blob in files.items():
  target=p/'fixtures'/side/name; target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(subprocess.check_output(['git','cat-file','blob',blob])); fixture_files.append(target)
 target=p/'fixtures'/side/'env.js'; target.write_text('\n'.join(key+'=fixture-only' for key in ['WEBSOCKET_AUTH_TOKEN','ALPACA_API_KEY','ALPACA_API_SECRET','KRAKEN_API_KEY','KRAKEN_API_SECRET'])+'\n'); fixture_files.append(target)
for side in m['reproductionSources']:
 args=['python3','scripts/test-isolated.py']
 for f in fixture_files: args += ['--fixture',str(f.relative_to(root))]
 args += ['--','env','SOURCE='+side,'node',str((p/'fixtures/verify-trai-blend-owner.cjs').relative_to(root))]
 subprocess.run(args,cwd=root,check=True)
