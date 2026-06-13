Mercury, break my fix.

Scope: missing startup module / runtime config proof only.

Current branch already has `run-empire-v2.js:334-337` requiring `./core/RuntimeConfigProof` and calling `logRuntimeConfigProof(resolvedConfig, TradingConfig)`, but `core/RuntimeConfigProof.js` and `test/runtime-config-proof.test.js` were untracked. The fix is to commit the missing module/test so startup import is resolvable and the runtime config proof logs redacted effective config evidence.

Relevant code:
- `run-empire-v2.js:334-337`
- `core/RuntimeConfigProof.js:1-177`
- `test/runtime-config-proof.test.js:157-204`

Attack requirements:
1. Find a concrete state where committing this module still lets startup boot-fail because of the import/export shape.
2. Find a concrete state where the proof logs raw broker secrets or raw SignalStack/webhook URL/path.
3. Find a concrete state where the proof fabricates source/value labels instead of using null/redacted presence.
4. Find a concrete state where the proof misleads operators about ConfigLoader vs TradingConfig ownership, especially minTradeConfidence, ATR, risk bypass, eval/TTP limits, profile ownership.
5. Find whether a better current module/gate already provides this same startup proof, making this duplicate/dead code.
6. Decide whether this closes the missing-module mechanism or only hides a symptom.

Use exact file:line evidence. Break the fix.
