# Evidence

- before.json: 18 registered tools, run_check advertised in registry/schema/docs.
- after.json: 17 registered tools; other tool names/order unchanged in registry and native schema; run_check absent from docs; direct dispatch returns the existing unknown-tool result; actual open_file read still succeeds.
- `node --check trai_brain/mercury-bridge/tool-adapter.js`: exit 0.
- `git diff --check -- trai_brain/mercury-bridge/tool-adapter.js mercury.config.json`: exit 0.
- Producer: mercury.config.json:236,242 now supplies the read-only rule and execution-receipt distinction. Consumer: tool-adapter.js public execute resolves only the retained registry. Private run_check has no exported route.

These are real adapter-boundary observations, not proof of full reviewer behavior. No claim that this observation is an independent review or a complete security audit.
