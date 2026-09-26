# Evidence

No production activation or browser-rendering receipt exists for this cut. The inherited 139-field draft and September 23 fixtures are leads, not proof for these bytes.

## Exact candidate and commands

Production patch: fixtures/production.patch, against parent 9070d1cf41e162ed3bca5a0bb76e59a077a76b33. Independent verification pull's HEAD was 87db958ac6da992313b3bc197ccf5a46e9f2aa53; the intervening commit changes only the previous packet, not these four sources. Baseline and candidate manifests are retained in the review invocation/completion tapes. The main repo authors/commits; the existing pull is an isolated verification source, not a new worktree.

SHA-256 of each exercised and reviewed candidate:

- foundation/ConfigLoader.js: 7c371a11701acd0be034623c581bdb6fd2133d3b48d0f7de5b25caf40fe99ca3
- core/WebSocketManager.js: f324513c29f26c9bd31124eb3589e23b3c54c540e344cfd71af7167f3641dab7
- ogzprime-ssl-server.js: ccd308db9a6c83d2ef6105ae6edb92a7f0841e5436d465593bfcee39f41b3cf2
- run-empire-v2.js: 2dc3105eb3d9d22cdd3ecb3983a018f958720169ed1df1b0ac0fbc333019c4cf

Run `node ogz-meta/inbox/codex/2026-09-26/stop1-ui-settings/fixtures/observe.cjs`. Final original output directory: private/observation-1PJW6x. It reported 8 save-request observations. The receipt is exported as tapes/observation--receipt.json.gz; full consumer results and console records are alongside it. Uses actual candidate ConfigLoader/atomic writer/WebSocketManager, the actual relay connection callback, and existing session-ticket helper, with disposable canonical files and fixture sockets. It is not an application boot or a deployed network/browser receipt.

Observed: two distinct owners returned views; only the selected owner persisted/applied; active paper confidence changed to 0.61 without creating an overridden root key or changing production-profile confidence; a fresh loader produced the same configuration fingerprint; stale identity, unsupported paths, invalid types, unknown owner, and deliberate temp-file write failure were reported without replacing the loaded snapshot; zero and false survived; untrusted bot-identification and unauthenticated saves did not forge/reroute a settings receipt. Known field values only are returned; no credential map is sent.

Actual candidate runner getter changed 0.5 to 0.61. The existing TradingLoop min-confidence diagnostic for confidence 0.55 changed from admitted to refused using those inputs. Other gate methods were fixture-supplied; this is not a full trade decision.

Actual StrategyOrchestrator.evaluate with its real registered RSI, actual IndicatorEngine, and 500 recorded TSLA bars: global ATR minimum 100% filtered 53 signals. Disabling the filter or setting its minimum to zero removed those 53 ATR rejections, then the committed exit-hint consumer threw 53 times per case on RSI's omitted stopLossPercent. This is a named existing producer defect, not 53 successful entries. Failed exploratory observations are preserved under private/observation-*; the final receipt intentionally retains the downstream errors. No signal fixture replaced this failure, and no exit code fix is bundled.

## Adversarial and source limits

Provider preflight: Mercury-2, Claude Code Fable (applied claude-fable-5), Kimi-k3 ready. One run at a time, max-tokens=7750, no iteration cap. Exact commands are in invocation.json tapes. Investigation 2026-09-26T03-59-29-032Z-1c5112505063 ended disagree over missing implementation/coverage; it is not acceptance. Candidate 2026-09-26T04-08-08-311Z-79ca8bbdd9a0 ended pass after Fable demanded the writer and consumer evidence and the tool-using recheck disproved Mercury's first allegations. Source identities stayed unchanged throughout each run.

Host AST candidate scan: 130 files scanned, 129 parsed; ogz-meta/ogz-run.js parse error remains named. Supplementary evidence-source descriptors were quarantined by the committed ingestion path; recheck opened the needed writer and consumer sources directly. Do not claim all candidate files or dynamic consumers fully reviewed. No indexer or shared database was used: explicit source snapshots only.

`npm run scan:secrets` on the verification tree returned 31 findings, all outside the four production paths (historical packets/test fixtures, including apparent manifest-hash pattern matches). This is not a clean repository-wide secret scan. No unrelated cleanup was performed; no global token-containment claim follows. No public HTML/token/session implementation was changed.

`node fixtures/export.cjs` produced 88 compressed tape/receipt files, 7,308,891 bytes. Every file passed redactSensitiveText; original, redacted and compressed hashes are in tapes/MANIFEST.json. Every compressed/redacted hash was rechecked; zero current known-credential matches remained. Private originals and inherited-before.patch are retained, not pushed. The inherited patch SHA-256 is 4da407ad0761bfb95ca4b53420c1867f5eee0a0f861acee730cb44085470b8b8.

Not proved: final complete UI settings inventory, frontend rendering, actual deployed save round trip, multi-process concurrent writes to the same settings file, full order execution, or Stop 1 acceptance. The UI packet does not certify unrelated inherited trading behavior.

Precommit scoped scan: `node scripts/scan-secrets.js --staged` reports one finding at tapes/MANIFEST.json:399. Independently checked: the value is a 64-hex `redactedSha256`, re-hashing the decompressed artifact reproduces it exactly; the scanner's burned-token-prefix regex matches a substring at offset 25 inside that digest. It is not a credential. This false positive remains reported; neither scanner rules nor enforcement were bypassed or weakened. All four staged production blobs exactly match the candidate SHA-256 values above, and their scoped diff passes `git diff --cached --check`.
