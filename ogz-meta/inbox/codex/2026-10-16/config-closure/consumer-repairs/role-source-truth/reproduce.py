import pathlib,subprocess,json
p=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
m=json.loads((p/'source-manifest.json').read_text())
fixture_files=[p/'fixtures/verify-role-source-truth.cjs']
for side,files in m['reproductionSources'].items():
 for name,blob in files.items():
  target=p/'fixtures'/side/(name.replace('/','__')+'.cjs'); target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(subprocess.check_output(['git','cat-file','blob',blob]));fixture_files.append(target)
args=['python3','scripts/test-isolated.py']
for f in fixture_files: args += ['--fixture',str(f.relative_to(root))]
args += ['--','node',str((p/'fixtures/verify-role-source-truth.cjs').relative_to(root))]
subprocess.run(args,cwd=root,check=True)
