# STOP 1 BOUNDARY — MISSION SPEC — CONFIG CUT + RULED CHANGES

**Frozen tree:** `e54a8b8` on `codex/multi-asset-symbol-state`.
**Branch:** one branch, `codex/multi-asset-symbol-state` (Trey's law; the earlier fix-branch line was a workaround and is withdrawn Sept 6). Freeze means CODE frozen: the walk reads the code tree at `e54a8b8` and no code change lands until the stop-1 boundary, both readers cold-pull PASS, and Trey says land. Packets and records under `ogz-meta/inbox/` are not code and land on the branch as produced.
**Packet:** Ruling 7 — MISSION / WORK / EVIDENCE / REVIEW / TAPE-HASHES in `ogz-meta/inbox/<agent>/<date>/stop1-config/`.
**Attachment (the sort, ground truth for placement):** `STOP1-CONFIG-SORT-2026-09-05-FABLE.md` (both readers' findings, executed evidence, every value's proposed home).
**Second read:** Sol's slice-5 read received Sept 6 — agrees on all surfaces; two tightenings adopted in 1.6. Any disagreement goes to Trey, not adjudicated by the executor.
**Status:** HOLD — do not execute until 0.1b lands and is cold-pulled and Trey names the executor and says go. All rulings in as of Sept 8. Sol signed off on HEAD b364d364 as the stop-1 surgery baseline (Sept 8).

Every sentence below is either Trey's ruling (marked RULED, with date) or a mechanical consequence of one. Nothing here is the executor's judgment. If a value doesn't fit the sort, the executor stops and asks; it does not decide.

---

## PART 1 — THE CUT (RULED Sept 4–6: two files, keys in .env, one PROFILE, nothing silent)

### 1.1 Files after the cut
- `config/settings.json` — every value a customer or Trey changes without code. The UI maps to this file. Includes `PROFILE` (the customer swaps profiles; RULED Sept 6).
- `config/internals.json` — static system values changed only with a code change.
- `.env` — credentials only: `KRAKEN_API_KEY`, `KRAKEN_API_SECRET`, `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `SENTRY_DSN`, `SIGNALSTACK_WEBHOOK_URL`, `WEBSOCKET_AUTH_TOKEN`, `NTFY_TOPIC`, `INCEPTION_API_KEY`. Nothing else. `.env` never leaves the box; the setup UI writes it (key first, then unlock settings).
- Deleted as behavioral sources: `config/features.json` (its 73 values move per the sort), `config/trading.config.json` (its 1,692 values move per the sort; the file is removed once empty), `profiles/*.env` (5 decoy files, no reader), the pm2 env block's behavioral stamps.

### 1.2 Placement
Per the sort's category table, updated by slice 5. Summary of buckets:
- SETTINGS: sizing & exposure; entries & confidence; exits (all four current layers, kept as-is per strategy until stop 6 collapses them — moved, not merged); strategies (every block incl. `allowShorts`); regime/volume boost weights; symbols/brokers/sessions/timeframes; fees **keyed per broker**; eval (TTP) policy as its own block; TrAI; tier/mode/dashboard toggles; every `features.json` toggle and setting; tuning profiles as **named presets**; the 27 real hardcoded parameters (table in the sort) and Sol's 12 constructor literals; **new:** warning thresholds and the daily-loss timeout (1.4).
- INTERNALS: timings, buffers, paths, liveness windows, backtest plumbing, message-queue sizes, warmup bar count, dashboard display constants, tier scaling tables.
- DELETE: the 23 pm2 stamps with no live reader (three methods agree: Fable grep, Amp AST census, Sol tree search), `regimeMultipliers` table (no reader), the `profiles` trading-profile table (banner-only reader; the banner line goes with it), the duplicate sizing block (one owner per concept — executor names which of `positionSizing.*` / `entryLogic.sizing.*` / env `BASE_POSITION_*` is the owner from the reader census, keeps that one, deletes the rest, and records the choice).
- Also cleaned in the same pass: sweep/backtest tooling (`matrix-sweep.js`, `parallel-backtest.js`, `tools/backtest-worker-env.js`) that still writes or passes any deleted key.

### 1.3 The loader after the cut
- Reads `settings.json` + `internals.json` + `.env`. One `load()` at boot. Everyone else calls `get()`. The runtime re-loads in `PatternMemoryBank.js:161` and `UnifiedPatternMemory.js:184` are removed; they read the loaded snapshot.
- `PROFILE` comes from `settings.json`. Mode (paper/live/backtest and every flag derived from it) is derived from `PROFILE` inside the loader and exposed read-only. The eight mode stamps (`EXECUTION_MODE`, `PAPER_TRADING`, `LIVE_TRADING`, `CONFIRM_LIVE_TRADING`, `BACKTEST_MODE`, `ALPACA_MODE`, `CANDLE_SOURCE`, `STATE_FILE`) are deleted as inputs; their three direct readers (`SingletonLock.js:26-28`, `BotStateFrame.js`, `instrument.js:57`) and `run-empire-v2.js:1772-1778` read the derived values from the loader.
- Every direct `process.env` read in code reachable from `run-empire-v2.js` is rewired to `ConfigLoader.get` (Amp's census is the denominator; includes `ENABLE_DPS`, `TRADING_TIER`, `MultiAssetManager`, `UnifiedPatternMemory` bucket resolution, `ogzprime-ssl-server.js:1319`).
- **Refusal (RULED Sept 5, refined by Sol's note Sept 5):** if any key defined in `settings.json` or `internals.json` is present in process env or `.env`, the loader refuses boot and names the key. Ordinary OS variables are not in scope. No warning, no fallback.
- Source tracking stays: every resolved value reports `settings` / `internals` / `env` / `derived`.
- Strict parsing (Sol S3): a malformed value refuses boot naming the key; no half-parse, no silent default. JSON-derived values are labeled with their path, not `default`.
- One read surface (Sol S6): `BASE_CONFIG`, `getAll()`, `getExitContract()`, `getTimeframeConfig()` either return the loaded snapshot or are deleted. No second config object built at import time.
- Snapshot completeness (Sol S2): every tracked value uses the value/source envelope; `strategies.EMASMACrossover`, `pipeline.positionMode`, `positionSizing.maxPositions` no longer come back `undefined`.
- Warnings surface (Sol S7): anything the loader puts in `warnings`/`errors` is printed at boot and emitted on the trace bus. `load({silent:true})` no longer hides them.
- Fingerprint fixed (Sol S1): the fingerprint covers every nested value. Proof: change one nested value, fingerprint changes.
- `ecosystem.config.js` env block for `ogz-prime-v2`: `NODE_ENV` and the `.env` credential pass-throughs only. Every behavioral stamp deleted, including the five that currently come from the box `.env` via pm2's dotenv pre-read (`STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, `TRAILING_STOP_PERCENT`, `WEBHOOK_ORDERS_ENABLED`, `WEBHOOK_DRY_RUN`) — those values migrate to their file first.

### 1.6 Manifest first, then cut (Sol, Sept 6 — adopted)
**Mission 0 — LEAF MANIFEST (read-only, precedes the cut, dispatchable now):** the executor produces one manifest with a row per leaf, disposition per row, no inheritance from parents:
- every leaf of `trading.config.json` (1,692), including every `tuningProfiles.definitions.*.env.*`, every `strategies.*` nested value (`weights.*`, `dynamicLevelMultipliers.*`, `modes.*.*`, `confluenceBoost.*`, `partialExit.*`), every `exitContracts.*` field per strategy, every `regimeBoosts` / `volumeProfileBoosts` / `regimeMultipliers` / `pid` / `profiles` / `feeProfiles` leaf, every `launchProfiles.*` leaf;
- every leaf of `features.json` (73);
- every pm2 stamp (116) and every env key the loader or any bypass reads (Amp's census is the denominator);
- **DECISION-LITERAL SURFACE:** every numeric/boolean/string literal or constructor default on a live path that changes signal qualification, confidence/confluence, regime weighting, sizing, entry timing, stop/target/trailing, position limits, MTF qualification, pattern qualification, fees/slippage, or risk/eval behavior. Denominator: Codex's Aug 16 census (105 numeric-default matches, 319 uppercase constants, 1,705 literal fallbacks) plus the families already proven live: StrategyOrchestrator confluence multipliers and fallbacks, TradingLoop confidence fallbacks, DynamicTrailingStop's seven constructor params, BreakRetest, SmartMoneySweep, MultiTimeframeAdapter, LiquiditySweepDetector, pattern-memory thresholds, PositionSizer:112, EMASMACrossoverSignal:152-156, TRAIDecisionModule:47, the run-empire constructor literals, ConfigLoader's unknown-regime `{1.0,1.0}` fallback.
- **CONSTRUCTOR-LITERAL SURFACE:** every default assigned in a constructor or default parameter of a live trading component, even where a loader value normally reaches it — a downstream fallback is a second authority and is dispositioned on its own.
Dispositions: MOVE-TO-SETTINGS / MOVE-TO-INTERNALS / KEEP-AS-CODE-CONSTANT / DELETE-AS-DEAD / HOLD-NEEDS-OWNER (Trey rules the HOLDs). A leaf not in the manifest is not authorized to move or be deleted. Both readers cold-pull the manifest; then Part 1 executes against it. The sort attached to this spec is the manifest's starting point, not its ceiling.

### 1.4 New settings (RULED Sept 6)
- Loss warnings: `lossesInARow: [3, 4, 5]`, `drawdownPercent: [5, 10, 15]`. Warnings only. Whether anything fires them today is stop 8; the numbers exist in settings now.
- Daily-loss timeout: `dailyLossTimeoutPercent: 50`. At the threshold: halt new entries only, nothing sold, open positions run their own exits, user restarts. The one safeguard outside eval. Implementation is stop 8; the setting exists now.

### 1.5 No behavior change — the proof
The bot must boot at the fix branch to the identical resolved config it boots to at `e54a8b8` with the frozen pm2 file and the box `.env` applied — every value equal, only the source column different. Executor produces both resolutions side by side (the Sept 6 executed-loader method in the sort, plus the five `.env`-sourced values) and attaches them. Green tests are not this proof; the side-by-side is.

Exception list — values that change at this boundary by ruling, enumerated in Part 2, and nothing else.

---

## PART 2 — RULED CHANGES AT THIS BOUNDARY (separate commits on the same branch, each labeled)

Each is one commit on the shared branch at the boundary, one behavior, Trey's ruling cited in the message. None ride inside the migration commit.

1. **Handler contradiction** (both readers reproduced): delete the bootstrap `process.exit(1)` handlers at `run-empire-v2.js:316-328`. One set of handlers, registered once in `main()`: uncaught exception → loud trace + max buzz + per-symbol quarantine where a symbol is known, process continues; unhandled rejection → same. Never process death (Doctrine: fails loud, never dies). Proof: Sol's child-process probe and Fable's probe re-run against the fixed file; the process survives a rejection.
2. **Live-requires-eval weld** (RULED Sept 6 "rip it out"): delete `ConfigLoader.js:1250-1254`.
3. **Per-symbol loss cooldown** (RULED Sept 6 "none, take that out"): delete the setting, the pm2 stamp, and the reader `StateManager.js:1676, :3973-3979` and its callers. Everywhere, eval included.
4. **Shorts on** (RULED Sept 3: both directions, one trade per asset): `settings.json` paper profile `pipeline.directionFilter = "both"`. Note in the packet: five strategies still carry `allowShorts=false` in their own blocks and eight have unverified short paths — this commit changes the gate only; per-strategy work is stop 3.
5. **Switching on** (RULED Sept 3/4: auto-switch, Trey's default): paper profile `sessionRouter.mode` from `static` to the switching mode, stocks 09:30–16:00 ET, crypto otherwise, 30/15/5 wind-down before 16:00. Executor reads `SessionRouter` for the exact mode name; if the switching mode doesn't exist as described, stop and report — do not invent one.
6. **Named absence for the phone**: `run-empire-v2.js:1071-1077` — when `NTFY_TOPIC` is missing, print it and emit `NTFY_NOTIFIER_ABSENT` on the trace bus at boot. (Doctrine: unavailable evidence is named.)
7. **Autoloader honesty** (Sol S8): `ModuleAutoLoader.loadAll()` reports per-module outcome; a required module that fails to load names itself and refuses boot; no unconditional "ALL MODULES LOADED".
8. **Startup failure exit code** (Sol S10): startup failure exits non-zero.
9. **Route-specific credentials** (Sol S9): `validateEnvironment()` requires only the keys for brokers the active session route uses.
10. **One tier identity** (Sol S12): `TRADING_TIER` direct read removed; one tier value from settings; one scaling table.
11. **Circuit breaker** (RULED Sept 7, Fourth Shape): `features.json` CIRCUIT_BREAKER block has no reader; `core/ErrorHandler.js` has its own hardcoded 5 and zero references from the live bot (read Sept 7). Delete both. The producer side — every trade-path error screams, routes to trace + phone, quarantines the symbol, process continues — is item 1 above; no counter downstream.
12. **Boot cosmetics** (Trey Sept 6): the `v14` lock name, the emoji lock lines, checkpoint counters, and the "Desktop Claude + Browser Claude = MERGED" banner come out of the boot path. No behavior.

Not in this boundary (later stops, already on their lists): the Alpaca heartbeat/silence watchdog and the never-clearing fault record (stop 2); the notifier's keyword filter (stop 2); DPS wiring and the sizing formula (stop 4); fees per broker in code (stop 4); four exit layers → one (stop 6); PID controller (stop 4 ruling); SmartMoneySweep's internal loss gate (stop 3 ruling); TrAI init failure (stop 10).

---

## PART 2b — BOOT AFTER EVERY COMMIT (RULED Sept 6)
Every commit in this packet, migration or ruled change, is followed on the box by: fresh paper boot at that commit → config proof captured → process alive past the first minute → rejection fired, process survives → behavioral key planted in `.env`, boot refused and key named → boot trace archived to `ogz-meta/inbox/trey/<date>/`. A commit that fails any step gets no successor until it's fixed. This is per commit, not once at the end.

## PART 2c — MISSION 0.1: MANIFEST CORRECTIONS (from Sol's blind cold-pull, Sept 6; both readers agree)
Before the cut executes, the manifest is revised: expand the 43 collapsed array elements to rows; add 13 missing trading leaves and 37 missing features leaves; F0072 is an object, not a leaf — expand it; literal values in every current_value cell; readers column corrected on ~70 exit-contract rows (PolicyBuilder.js:240-241 is a live validation reader); Donchian source label corrected (BASE_CONFIG literals, not JSON); the 3 "unreachable" contracts (BreakRetest, CandlePattern, MarketRegime) are reachable registered built-ins — INHERITED #6 and the "43 leaves no trade can bind to" claim withdrawn; profile toggles P0072–P0074 gate real built-ins; mode-field names corrected (mode.execution / paperTrading / liveTrading / backtest / confirmLive); add `BACKTEST_CONFIG_OVERRIDES_JSON` as a source row (backtest-only override payload, run-empire-v2.js:350-361, BacktestConfigOverrides.js) — disposition HOLD for Trey; relabel the 6 cooldown rows and 24 profiles rows DELETE-RULED with their live readers named and the ConfigLoader.js:2219-2238 profiles validator removal attached; **Direct reachability audit delivered Sept 7 (Codex, by hand from source, no models; three independent readers concur): `ogz-meta/inbox/codex/2026-09-07/direct-runtime-config-audit/DIRECT-RUNTIME-CONFIG-AUDIT.md`.** Every DELETE row now has a named proof or a named live reader with call chain from `run-empire-v2.js`. Corrections to Fable's "26 (9 env, 17 JSON)" count: the set is 9 env + 14 `regimeMultipliers` + `universalLimits` = 24, plus 22 `profiles.*` rows the count missed (all 22 have a live boot-validation reader `ConfigLoader.js:2230-2231`; delete requires removing the validator `:2219-2238`). Trailing rows: 10 JSON-live / 24 shadowed; none controls the live trailing exit (`ExitContractManager.js:724-817` uses `exitLogic.trail`; `TrailingStopChecker.js` has no callers). The 15 pm2 stamps replayed: NO LIVE READER, fourth confirmation. Earlier text kept below for history:

**Reachability proof delivered Sept 7 (Codex, Mercury leads + hand verification against the tree, ledger ogz-meta/cognition-history/mercury-runs/2026-09-07.jsonl:17-23):** of the 26 unproven DELETE rows — 8 env keys are LIVE (`TTP_MAX_LOSS_THRESHOLD_EQUITY`, `TTP_PROFIT_TARGET_DOLLARS`, `OGZ_ACCOUNT_ID/LABEL/STAGE/STATUS`, `OGZ_MIN_TRADES_REQUIRED`, `OGZ_TRACK_RECORD_START_AT`; readers in `ogz-meta/claudito-logger.js:341-402`, runtime-imported at `run-empire-v2.js:382` — the one ogz-meta file every census excluded; Fable confirmed it is the only runtime-imported ogz-meta JS). They come OFF the delete list; disposition → SETTINGS (account/proof block) pending Trey's word on what the track-record publisher is and whether it stays. `TTP_DAILY_LOSS_LIMIT_DOLLARS`: no live reader, stays DELETE. `regimeMultipliers` (14): JSON copy has no reader, hardcoded shadows `ConfigLoader.js:3333-3339` are live → delete JSON, MOVE the shadow values to SETTINGS. `universalLimits`: dead. The 23 pm2 stamps: re-confirmed no live reader (Mercury M19/M20 + Fable ogz-meta sweep). Manifest tally: 38 of 79 DELETE rows had readers; 0.1a relabels all 38.

**Mercury posture (Sept 7, standing):** Mercury is a lead generator, not clearance — it contradicted itself twice (ledger lines 17 and 23) and every substantive run is mechanically UNVERIFIED. Every Mercury lead is confirmed by a reader with the tree before it enters a manifest cell.

**Stop-6 evidence from the same run (recorded, not acted on):** per-strategy `trailingStopPercent`/`trailingActivation` control nothing — the live trailing implementation is `ExitContractManager.js:724-817` driven by `exitLogic.trail` + ATR; `core/exit/TrailingStopChecker.js` has zero callers; 12 of 17 exit-contract families are decorative (loader hardcoded copies win), 5 are live through `requiredConfiguredPlainObject` → `PolicyBuilder.js:240-241` normalization only.

**RULED Sept 7 (Trey): keep the track-record publisher** ("i wanted them at some point for something maybe piping through to the website"). The nine values (`OGZ_ACCOUNT_ID/LABEL/STAGE/STATUS`, `OGZ_MIN_TRADES_REQUIRED`, `OGZ_TRACK_RECORD_START_AT`, `TTP_MAX_LOSS_THRESHOLD_EQUITY`, `TTP_PROFIT_TARGET_DOLLARS`, plus `OGZ_MAX_DRAWDOWN`/`OGZ_PROFIT_TARGET` if present) move to SETTINGS as an account/track-record block; add `trackRecordPublisher.enabled` (default `false`) so the publisher does not fail on every trade until the values exist; on with values when the website pipe is built. No ignition blocker.
## PART 3 — RECEIPTS REQUIRED BEFORE COLD-PULL
- The packet, with tapes hashed.
- Side-by-side config resolution, `e54a8b8` vs fix branch, every value.
- Fingerprint-change proof (one nested edit → new hash).
- Handler proof: rejection fired, process alive, trace + buzz emitted.
- Refusal proof: one behavioral key placed in `.env` → boot refused, key named.
- Diff of `ecosystem.config.js`, `.env.example`, and the tooling cleanup.
- List of every `process.env` read remaining in reachable code (must be zero outside the loader).
- Existing tests green (not proof, just not red); new tests for 1.3 refusal, 1.3 strict parsing, 1.5 identity.

Both readers cold-pull. Disagreement goes to Trey. Trey says land. Then ignition at the new head: `pm2 delete ogz-prime-v2`, start at the new SHA with `NTFY_TOPIC` in `.env`, boot trace archived to `ogz-meta/inbox/trey/<date>/boot-trace-1.log`.

---
**WHAT I DID:** wrote this from the stop-1 sort (both readers), the executed loader run, the box receipts, and Trey's rulings Sept 3–6 as recorded in the spec file.
**WHAT I DID NOT DO:** read `SessionRouter` for the switching mode's name (item 5 tells the executor to read it, not assume it); read the PID output consumers; verify the exact set of `process.env` readers beyond the sort's list — Amp's census is the denominator.
**WHAT I ASSUMED:** nothing beyond the rulings; Sol's slice-5 read is folded in (1.6).
