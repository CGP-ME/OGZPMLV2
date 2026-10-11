# Stop1 ConfigLoader/UI audit

Audit date: 2026-10-11. Current branch: `astra-era`; HEAD: `cb566d93a46dca8673def2f76ea685f5be0b148e`. The working tree is dirty, including `foundation/ConfigLoader.js`; all observations below are against the live working tree and are not attributed to HEAD unless explicitly stated. The AST `source-census.json` was used as an inventory lead only. No runtime/save/restart/network action was performed.

Hash identity is explicit: current `sha256sum foundation/ConfigLoader.js` is `6b4f34bf85c96363a1315bc9d8803c2d9614ba2717a12af1bdee63852aaab2e6`, matching the census `sha256`; the Git blob hash is `8a01abfdab34d31f9bed349157bff4c46c55a003`, while the HEAD blob is `717dbe1c7fc783207d2978ad737c2a06f130c90c`. These are different hash functions/objects and must not be conflated.

## Ownership and precedence

`foundation/ConfigLoader.js:24-32` fixes canonical ownership to `config/settings.json` and `config/internals.json`. `readCanonicalJson` validates object shape, schema version, and positive revision at `:34-51`; `loadCanonicalFiles` reads both files at `:53-59`. Bootstrap precedence is explicit `PROFILE` from the inherited environment, otherwise `launchProfiles.defaultProfile` (`:447-458`); the selected profile is validated and attached at `:488-507`. Bot snapshots can replace the profile with `descriptor.launchProfile` (`:2267-2286`), then load canonical settings, dotenv credentials, and role-scoped values (`:2254-2303`). The built snapshot is validated, fingerprinted, frozen, and returned (`:2305-2362`).

Credentials are role-scoped through `credentialForRole` (`:527-533`) and are sourced from parsed dotenv or explicitly supplied environment values (`:2298-2301`). Dashboard assembly combines settings and internals only where explicitly coded (`:560-609`); this is not a general merge precedence rule. Profile override validation is typed against canonical leaves (`:697-719`). Backtest descriptor overrides are allowlisted and type checked (`:668-680`, `:734-772`) and are applied before validation/fingerprint/freeze as documented at the module contract (`:5-10`).

The process snapshot is sticky: `load()` returns the existing snapshot for the same role (`:2508-2515`), refuses a role change (`:2510-2513`), and only accepts a forced bot reload after replacement-problem checks (`:2517-2547`). `get()` reads the frozen snapshot (`:2550-2559`), while `getSource()` reads the source receipt (`:2561-2564`). This means a disk edit is not automatically live in an already loaded process.

## Registry and UI descriptor coverage

The live `EDITABLE_SETTINGS` registry is the source of the UI field descriptors (`foundation/ConfigLoader.js:2603-2815` and continuation through the registry close before `:4240`). A read-only `getSettingsView()` maps every registry entry to its current snapshot value, source, and `editable` flag (`:4261-4271`). The current bot snapshot returns 724 descriptors, profile `paper`, settings revision 11, internals revision 4; the complete key inventory and per-key descriptor metadata are in [loader-ui-coverage.json](./loader-ui-coverage.json).

The UI groups paths by static section regexes (`public/js/panels/configuration-settings.js:41-56`), renders every returned field, and preserves drafts for fields that disappear (`:178-210`, `:367-393`). It validates field type/ranges client-side before sending (`:493-524`) but the server remains authoritative.

No key is claimed effect-verified by a live behavior test in this read-only lane. The JSON records the declared effect, descriptor evidence, exact current value/source, and `effectStatus: unresolved_runtime_effect` for every key. The registry and transport evidence prove descriptor/read/write plumbing only; they do not prove that each declared timing is honored by its runtime consumer.

## Save/load/refresh/profile scoping

Dashboard refresh sends `get_settings` (`public/js/panels/configuration-settings.js:396-416`), accepts one response per owner and preserves drafts across refreshes (`:418-491`). Save sends the selected `ownerId`, expected revision/hash, and typed changes (`:493-547`). The SSL relay forwards reads to all authenticated bot owners but writes only to the exact returned connection identity (`ogzprime-ssl-server.js:2022-2037`); bot receipts are relayed with relay-owned `ownerId` (`:2049-2055`). The bot WebSocket handler calls `ConfigLoader.getSettingsView()` or `saveSettings()` (`core/WebSocketManager.js:124-135`, `:318-321`).

`saveSettings()` is restricted to a loaded bot without a backtest descriptor (`foundation/ConfigLoader.js:4274-4278`), rejects unknown/non-editable keys and invalid values (`:4285-4310`), rereads disk and checks both disk hash and expected revision/hash (`:4312-4323`), then writes the canonical file atomically and synchronously publishes the new frozen snapshot (`:4422-4442`). Fields scoped to `active_launch_profile` are written under `launchProfiles.<activeProfile>.<key>`; other fields are written at the canonical root (`:4324-4331`). This is the concrete profile scoping rule.

The UI labels a profile from the returned owner view (`public/js/panels/configuration-settings.js:98-105`), but there is no dashboard profile-switch path: the bot rejects profile switching commands pending a safe runtime owner (`core/WebSocketManager.js:323-330`). Backtest owners are read-only because descriptor ownership blocks saves (`foundation/ConfigLoader.js:4276-4278`).

## Effect classes and concrete gaps

The applied-settings callback only replaces `resolvedConfig`, refreshes the runtime proof source, and logs a receipt (`run-empire-v2.js:1121-1128`; invoked by `core/WebSocketManager.js:124-131`). It does not reconstruct constructor-owned components. This matches restart-required descriptors, but it is evidence that a save receipt alone does not activate those components.

Per-evaluation reads are real for `PolicyBuilder.buildForTrade` (`core/PolicyBuilder.js:563-605`, called by `core/OrderExecutor.js:2350`), `FeatureExtractor` (`core/FeatureExtractor.js:196-313`), most strategy providers, and pipeline toggles (`core/StrategyOrchestrator.js:2385-2387,2334-2373`). Constructor-captured/restart-owned classes include `FibonacciDetector` (`run-empire-v2.js:712-714`; `core/FibonacciDetector.js:16-20`), `OptimizedIndicators` (`core/OptimizedIndicators.js:41-60`), the MTF adapter (`core/StrategyOrchestrator.js:944-955,876`), orchestrator thresholds/solo filter (`:887-905`), and `PerformanceAnalyzer` (`run-empire-v2.js:731-734`). Stateful strategy modules have mixed behavior: Donchian, PropSafe, EMA Retest, RSI2, and TSM receive fresh ConfigLoader values at evaluation (`core/StrategyOrchestrator.js:2215-2227,2229-2315`), while NoWick freezes only its initial base config but reads detection/exit providers (`modules/NoWickImbalance.js:105-119,135-145,525-545`).

One concrete acceptance gap remains. The generic `ContractValidator` range for `stopLossPercent` is non-negative (`core/ContractValidator.js:184-195`), while the canonical editable strategy contracts and `PolicyBuilder` require negative stop-loss percent form (`foundation/ConfigLoader.js:4085-4088`; `core/PolicyBuilder.js:113-118`). `ContractValidator.validateExitContract` currently has no live call site (`rg` found only its definition), so this is an unresolved dormant-validator contract mismatch rather than an observed runtime rejection.

The 724-field snapshot was produced without printing or supplying credentials with:

```sh
node - <<'NODE'
const ConfigLoader = require('./foundation/ConfigLoader');
const view = ConfigLoader.getSettingsView();
console.log(JSON.stringify({ count: Object.keys(view.fields).length, profile: view.profile, configuration: view.configuration }, null, 2));
NODE
```

The command imports ConfigLoader and reads the canonical files/dotenv internally, but emits only count/profile/revision/hash metadata; no credential values were printed and no save/restart/network action occurred.

## Findings and limits

The control path has explicit owner identity, optimistic concurrency, atomic persistence, and draft preservation. The principal audit limitation is behavioral: this lane did not invoke save or restart, and static consumer references do not establish that each declared effect timing is implemented. Dynamic/template consumers and outsourced MTF3 repair lanes were excluded. The per-key JSON therefore distinguishes descriptor/read evidence from unresolved runtime effect verification rather than treating registry presence as proof of working behavior.
