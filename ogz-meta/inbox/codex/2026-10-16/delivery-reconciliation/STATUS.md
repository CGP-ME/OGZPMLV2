# Delivery and acceptance reconciliation — 2026-10-16

The broad claims “Stop 1 complete”, “everything pushed” and “everything works end to end” are not supported by the current evidence. Many individual fixes are pushed; prepared work, source review, isolated behavior checks and running-process acceptance were repeatedly conflated. This record corrects those distinctions. It does not claim to reconstruct every statement in every unavailable prior conversation.

## Confirmed gaps

| ID | Work / claim affected | Actual status and evidence | What remains |
| --- | --- | --- | --- |
| D01 | Whole Stop 1 ownership, provenance and behavior acceptance | October 11 mapped all 2,549 then-current leaves/containers, not 2,549 customer controls. The map explicitly includes worktree source and remaining behavior checks. `../../2026-10-11/stop1-completion-map/README.md` (see links below), lines 3–27 and source boundary. | Reconcile each original mapped group with delivered changes and actual remaining checks; no blanket acceptance from a key census. Keep existing finding IDs. |
| D02 | “All changes pushed” | Local production deltas remain in config, loader, sizing, policy/receipt, pattern and backtest files; remaining-source-inventory.json pins the post-delivery observation. These exact bytes are not certified by similarly named older commits. | Separate each authorized change, verify consumers/behavior, review and deliver; preserve other agents' work. No wholesale staging. |
| D03 | Restored account startup | Committed startup treated balance zero as absence and could reseed cash/erase positions. Existing correction was local. | Corrected and pushed in fc7abf312b99ad5461e19180a2b8d18b331ecb54; isolated proof and clean Mercury. Runtime not activated. |
| D04 | Ledger reconciliation | Four production files and focused test were staged but unpushed. Delivered in 9c2e3f59 after current-source isolated proof, clean Mercury and Astra GO. | Source delivery complete; runtime activation remains pending. Report-only USD cash comparison, not whole-account loss protection. |
| D05 | New 50% daily account-loss rule | Not implemented. Existing generic venue rail was removed; that removal did not implement its replacement. | Recurring correctly scoped whole-account valuation, persisted NY-day anchor and explicit breach/resume acknowledgement. Paper uses its own simulation ledger. Kraken whole-account valuation remains unproven; USD cash is not equity. |
| D06 | Environment migration/reload | 206 original assignments, 22 retained credentials, 184 archived names. Bounded reader reconciliation is delivered. Repeated role snapshots prove archive non-interference, not semantic proof for every historical variable. Relay/supervisor reload remains held. | Finish historical-value/reader evidence where unresolved; after approved source closure perform approved service recreation and runtime provenance. No reload in this pass. |
| D07 | Immediate exit defect | 773020ed fixes the standalone pipeline diagnostic's null coercion. It does not demonstrate the live trading defect fixed. | Reproduce and fix the active exit producer/consumer path. Do not call diagnostic acceptance live acceptance. |
| D08 | Session transfers / pause recovery | Source flattening/reconciliation/hydration work exists; joint paper walkthrough is not accepted. SessionRouter resume calls remain unowned and can clear another pause. Thirty-minute wind-down is a separate behavior from the approved flat-before-transfer requirement. | Correct pause ownership and reconcile wind-down intent; verify actual flatness/state/history/learning/dashboard scope together. Five symbol-reconciliation hold categories still lack demonstrated recovery; do not delete unresolved-order protection blindly. |
| D09 | MTF every selected symbol/frame | Current stocks router subscribes each configured symbol/evaluation frame. Kraken transport subscribes native intervals, but router crypto startup/transition selects cryptoSymbols[0]. Alpaca native stream is 1m with REST-backed requested closed bars. | Verify/fix all selected crypto symbols through the actual connected feed and evaluation path. Existing Alpaca/hydration repairs below are delivered, not new missing work. Post-reboot acceptance is separate. |
| D10 | Dashboard controls and receipts | Bot-side awaited pause/resume mutation receipts and pause-state projection are pushed. This does not prove browser-to-relay-to-owner command delivery or overlap/reconnect behavior. | Fable/Opus frontend audit/integration remains separately owned. Do not declare all v2 controls working from a census or backend test. |
| D11 | Old diagnostics | Phase7 configuration reader is migrated; full CLI still references missing core/OptimizedTradingBrain.js. | Reconcile the diagnostic entry point without expanding into the deferred backtest project. |
| D12 | Reviewer freshness | Exact-source reviews have pinned trees. Global Mercury index freshness was not established after embedding-credit failure. | Do not claim globally current indexed context; retain exact review source identity. No unrelated harness repair authorized here. |
| D13 | Live webhook fill classification | Current OrderExecutor fill producer labels webhook execution simulated at base fc7abf31:4527,5110, despite _isLiveWebhookExecutionRoute at 919–920. The new reconciliation receipt initially copied this classification. | New receipt classification is corrected in delivered 9c2e3f59. Existing fill/journal classification remains a separate defect; no complete webhook accounting acceptance. |
| D14 | Verification-tool reconciliation | Existing session-router suites still depend on obsolete isTrading mocks and incomplete runtime contexts. Pinned base and candidate have the same 38 failing tests/13 passes; a complete regression-suite pass has not been established by recent source removals. | Reconcile test/rehearsal producers to the actual pause/configuration contracts. Keep focused passed evidence separate from failed full-suite evidence. |

The October 15 daily-loss/trading-stop findings contain historical statements about unawaited receipts and dummy global-halt methods. Those particular statements were superseded by 792e8af4 and 8eeb0c35. They are not open again simply because those old documents still exist.

## Remaining local production groups

These groups describe observed deltas, not approval to ship every byte or proof of a prior claim about each one.

| Group | Actual local content | Delivery / scope boundary |
| --- | --- | --- |
| Settings authority and configuration | Loader launch-mode constraints; hot-edit/strategy/sizing validators; fee/absolute-cap/exposure values; confidence descriptor rearrangement | Undelivered. sizingConfigurationProblem, editableSettingValueProblem and strategyConfigurationProblem currently have definitions but no callers. Values, these dormant helpers and intended live activation need verification. Do not silently ship zero fees or new sizing restrictions as migration. |
| Sizing and exposure | OrderExecutor equity/exposure sizing; TradingLoop account-wide max positions and per-asset restriction | Undelivered. Producer/consumer behavior and authorized sizing policy must be checked together. |
| Configuration provenance receipts | Loader getReceipt export; frozen policy configuration; decision/autopsy/ledger/dashboard entry identity | Undelivered. Merely having a source map does not prove each decision identifies the configuration it used. |
| Exit/indicator transport | RSI period and Donchian ATR period transport; zero fraction handling; nullable TP/hold fields | Undelivered pieces. Existing strategy-owned exit implementation is not automatically undone; prove these remaining values reach their intended consumers. |
| Pattern feature inputs | Flat MACD, zero MACD, BB percentage normalization, up/down trend vocabulary | Undelivered corrections in existing active path. This is distinct from deferred pattern-pack/ML feature build. |
| Backtest tooling and worker paths | Runner completion records and descriptor paths for journals/performance/snapshot/TrAI | Local only; backtesting remains a later stop under Trey's instruction. Do not roll it into env cleanup. |

Unrelated dirty frontend/relay/Mercury harness files are preserved and are not included in backend delivery claims. The inventory is an observed working tree; ownership must not be guessed from file proximity.

## Confirmed delivered work — do not redo

- f0eff88f: independent isTrading enable authority removed.
- cced6986: journal failures no longer control trading; b75734e7: auth-counter quarantine/flatten removed; ea226fb4: generic venue rail removed; e39129f0: sticky broker-read veto removed; 5b6a3db7: credential-prefix holds removed.
- 8eeb0c35: constant false/null global-halt methods and callers removed.
- 792e8af4: awaited bot-side pause/resume receipts and actual pause projection.
- 2da57107: helper isolation; real runtime data and PM2/credentials inaccessible inside the prescribed helper launcher. Arbitrary host commands remain outside that boundary.
- 38552ef6: PID disconnected and preserved intentionally; do not reactivate it as unfinished work.
- 008e884b: strategy exit volatility lookback consumer; c5de35e3: historical candle/indicator storage repair; 713b5f31: destination history hydration.
- 4f75871c: Alpaca requested completed-timeframe delivery. Source: brokers/AlpacaAdapter.js:724–759,1175–1207. It uses REST for non-1m closed bars, not a native stream per requested frame.
- bcc7acd7, 773020ed, bacb1f4e, aa6acf30, 3a482b7d, b83dfd51: the bounded archived-env reader corrections.
- Session-risk action declarations were removed on Trey's ruling; they are not missing features to rebuild.

Runtime source activation remains separate. Read-only PM2 observation during this reconciliation: bot PID 2943769/restart count 0; websocket PID 3935053; supervisor PID 3935117. No restart, reload, resume, live order or new state reset performed in this pass.

## Explicitly deferred work

Broader pattern memory/ML activation, clean backtest learning packs/export/recovery and frontend/backtesting later stops remain deferred as instructed. Existing active pattern-input bugs are still repairs, not a reason to activate the deferred grand system. Preserving PID and documenting dormant controls is intentional, not a hidden delivery failure.

## Evidence index

- [Original complete key map and its limitations](../../2026-10-11/stop1-completion-map/README.md).
- [Original 29-item follow-up list; keep these IDs](../../2026-10-06/config-migration-followups.md).
- [Env-reader closure and explicit limits](../../2026-10-15/env-reader-census/SUMMARY.md).
- [Whole-account rule integration gaps](../../2026-10-15/account-daily-loss/FINDINGS.md).
- [Trading-stop inventory; historical supersessions identified above](../../2026-10-15/trading-stop-audit/FINDINGS.md).
- [Restored startup correction delivered this pass](../restored-balance-delivery/REVIEW.md).
- [Before-delivery source inventory](source-inventory.json).
- [Remaining source differences after delivery](remaining-source-inventory.json).
- [Ledger reconciliation delivery](../ledger-delivery/REVIEW.md).

Source references are inspection evidence, not a new exhaustive behavioral certification. A later commit can close an individual row without proving the other rows. The final Stop 1/2 acceptance claim remains withdrawn until the required checks are actually complete.
