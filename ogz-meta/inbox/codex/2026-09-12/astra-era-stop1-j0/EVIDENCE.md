# STOP 1 Astra-era J0 evidence

## Audit packet integrity

- Tracked packet: `ogz-meta/inbox/codex/2026-09-12/astra-era-stop1-j0/STOP1-EVIDENCE-6ca25ae8.zip`
- Packet SHA-256: `79852f809c4643ddde7fd5a4d0aee85aa198ff7d7e79dae66b35c6224d25905e`
- Compressed size observed: 7,065,663 bytes.
- Archive inventory: 54 files, 128,909,027 uncompressed bytes.
- `unzip -t`: every member passed; no compressed-data errors.
- Main report: `STOP1-AUDIT-6ca25ae8.md`, 797 lines, SHA-256 `247146f39aead66ebede5ad1346ac19a9ce55d813bbfcf45a01d27441b81e763`.
- Item ledger: 158 rows, SHA-256 `c25aca6bdc6e192408fe2700b46e2f8fe4f64c801c403725dce5623a602f9008`.
- Citation validation: 542 extracted; 454 current-repository citations valid; 88 supplied-document citations excluded from repository resolution; zero reported issues.

The archive's `artifact-consistency.json` refers to `STOP1-CONFIG-EVIDENCE.csv`; the archived file carrying that hash is `source-census/stop1_joined_configuration_evidence_ledger.csv`. `EVIDENCE-README.txt` does not make that attribution. This is a packet naming discrepancy, not evidence that the ledger bytes failed validation.

## Independent current-source checks

The following high-impact audit claims were re-read directly at current HEAD:

1. Webhook route precedes paper simulation: `core/OrderExecutor.js:2809,2853-2858,3418-3428,3603-3605`; non-dry POST: `core/WebhookOrderAdapter.js:142-149`.
2. TTP broker management permission is derived from webhook routing rather than resolved paper mode: `run-empire-v2.js:1369-1389`; orphan close sends through OrderRouter: `core/TtpCutoffEnforcer.js:681-704`.
3. Alpaca endpoint is selected from adapter mode: `brokers/AlpacaAdapter.js:47-61,457-483`.
4. RiskManager is fetched and constructed unconditionally: `run-empire-v2.js:448,643-646`; required-module propagation/validation: `core/ModuleAutoLoader.js:183-197,257-276`.
5. SingletonLock checks existence and then atomically replaces the file: `core/SingletonLock.js:48-108`; `core/AtomicWrite.js:25-28`.
6. SingletonLock registers immediate exit handlers: `core/SingletonLock.js:119,144-166`; runner shutdown is asynchronous: `run-empire-v2.js:3516-3586`.
7. Fingerprint uses a top-level key array as JSON replacer: `foundation/ConfigLoader.js:1444-1454`.
8. Current sizing multiplies `maxPositionSize` and applies share adjustment after dollar capping: `core/OrderExecutor.js:2392-2413,3104-3128`.
9. SessionRouter startup enters failed-safe and returns before installing its scheduled interval: `core/SessionRouter.js:275-315`; failed-safe pauses globally: `:1385-1456`; transition completion resumes globally: `:1550-1563`; StateManager pause/resume changes global `isTrading`: `core/StateManager.js:2554-2618`.
10. Initial activation rejects any REST-reported position/order before subscription: `core/SessionRouter.js:1333-1359,1694-1709,1746-1773`.
11. Crypto activation subscribes only `cryptoSymbols[0]`: `core/SessionRouter.js:1705-1709`.
12. One-trade candidate update rejects a changed frozen-policy hash and does not save independently: `core/StateManager.js:2850-2884`; `update_stop_loss` was found in UI sources but not in the inspected bot message handler.
13. Symbol halt reset deletes the current record by symbol without matching prior record identity: `core/StateManager.js:4162-4174`.
14. ConfigLoader parses `.env` into a local object: `foundation/ConfigLoader.js:473-481`; notifier modules capture `process.env` independently at import: `utils/telegramNotifier.js:44-52`, `utils/discordNotifier.js:48-54`.

## Item-ledger investigation dispositions

- 107 `REMAINING AND AUTHORIZED` rows.
- 12 `CONTRADICTORY` rows.
- 9 `LANDED BUT INCOMPLETE` rows.
- 1 `LANDED BUT INCORRECT` row: L1.
- 7 `REMAINING BUT REQUIRES TREY'S RULING` rows, reduced to four distinct questions in `RULINGS-REQUIRED.md`.
- 8 `BELONGS TO ANOTHER STOP` rows.
- 7 `STALE` rows.
- 7 `NO LIVE BEHAVIORAL EFFECT` rows.

These are lineage/item rows, not 158 independent fixes or 107 commits.

Every unresolved row remains assigned investigation work. A ledger label such as `REMAINING AND AUTHORIZED` records the audit's disposition; it is not an implementation instruction and does not clear the audit's proposed design.

## Proof limits

No bot boot, test, PM2 operation, provider call, broker call, webhook call, order, state migration, notification, or phone delivery was performed for J0. Source reachability and constructed sequences do not prove that the private running process exercised those states. Conversely, absence of a runtime incident does not invalidate a source-proven reachable path.

## Footer

WHAT I DID: validated the packet; read the 797-line report; inspected the item-ledger dispositions; checked the highest-risk source paths at current HEAD.

WHAT I DID NOT DO: treat generated census candidates as proven live readers; treat historical reviewer claims as authority; operate the bot or external services.

WHAT I ASSUMED: packet hashes and current source remain stable until J0 is reviewed; every implementation packet re-verifies its cited lines at the then-current revision.
