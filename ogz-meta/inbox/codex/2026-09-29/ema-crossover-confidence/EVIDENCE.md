# Evidence and reproduction

Run from repo root in this order:

```bash
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/build.cjs
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/observe.cjs
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/integrated-save.cjs
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/producer-integration.cjs
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/reload-policy-probe.cjs
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/role-ownership-probe.cjs
```

build-receipt.json/source-manifest.json pin the baseline, exact four clean patches and resulting nine source hashes. Builder reads committed Git blobs and applies module.patch, loader-final-head.patch, producers.patch and role-ownership.patch under generated fixture directories. No worktree is created. No .env is read; fixture credentials are non-secret local strings.

- behavior.json: identical original/candidate baseline; all five leaves alter scoring after publication on 1,600 recorded TSLA candles; directions and crossover state unchanged; three retained instances preserve state references and values.
- integrated-save.log: actual ConfigLoader.saveSettings and AtomicWrite persist a revision, update three retained detectors, reject three invalid saves without publication, and reload valid persisted values.
- producer-integration.log: Acorn extracts and executes all four actual patched production EMA constructor expressions and the runner's actual SymbolTradingContext options producer. Four retained instances warm on 400 recorded candles and consume actual saveSettings publication. This is constructor/dataflow integration without booting unrelated services.
- reload-policy-probe.log: valid numeric strings remain accepted; an unchanged string survives another-leaf save. Invalid pair plus twenty invalid leaf values are explicitly rejected on force replacement. All eleven mutable globals retain identity; public canonical getters, receipt and cached role stay coherent. Later save works after external disk correction; valid force load and original initial-load behavior remain unchanged.

The recorded dataset path/hash appears in behavior.json. Source duplicates are reproducible generated artifacts, not delivery files.

Role correction qualification: role-ownership-result.json proves the original forced bot-to-dashboard regression on the exact exposed EMA tree and its correction. Both role-change directions reject before candidate building, preserving all eleven globals/disk/receipts. Initial bot/dashboard behavior and same-role reload are unchanged; a retained EMA detector continues 100 recorded bars and a subsequent valid same-role confidence change affects 221 signals. That exact-tree probe has its own source identity, separate from this packet’s clean-baseline builder. All existing EMA qualifications were rerun against the four-patch builder.

Root repeated role-ownership-probe.cjs and the exact review-tree proof. Final selected loader SHA256094320239c2f40eb5cb323c1a328f88954ef840dcdb871b916fa6a9876cbfaaf equals the staged blob; REVIEW-TREE-PROOF.json records selected tree59fb0aa1231b5dbd52db9cae870a2844ab757fa4 and per-source hashes. Production copies in generated fixture directories are regenerated after proof, not delivered.

Delivery checks: 105 compressed redacted tapes have matching SHA-256 hashes and no missing receipts. Decompressed scan has two metadata-only false positives (apiKeySource field with literal value none); narrowly normalizing scanner input leaves zero findings, with stored bytes unchanged. Full staged secret scan passed. The eight whitespace warnings are required blank context lines in reproducible unified-diff artifacts; production diff whitespace check passes. Three fixture logs are explicitly included despite the generic log ignore rule.
