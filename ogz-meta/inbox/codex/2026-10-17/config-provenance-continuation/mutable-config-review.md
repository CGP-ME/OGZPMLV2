# Mutable ConfigLoader and duplicate-owner review

**Pinned source:** committed `547a375ac7b02cd68b9645a2a97872b8c3cd5182` (`docs(config): reconcile final canonical provenance and approved retirements`). The working tree is dirty; the dirty differences are listed separately below and were not used as current-source evidence.

## Finding

No concrete active caller can mutate the cached canonical snapshot or silently replace a canonical value through a returned compatibility tree.

`load()` returns the existing snapshot for the same role (`foundation/ConfigLoader.js:2439-2446`), rejects forced role changes (`:2448-2453`), builds a candidate before publication (`:2455-2474`), and assigns `_cached` only after candidate validation (`:2475-2478`). `get()` walks `_cached.config` directly (`:2481-2490`), but `buildSnapshot` deep-freezes the config before it enters the snapshot (`:2282-2292`; `deepFreeze` implementation `:4362-4366`). Thus a caller receives immutable leaves from `ConfigLoader.get()`.

`getSection()` and `getAll()` intentionally return `clonePlain` copies (`:4397-4401`, `:4517-4520`). They are mutable by the caller, but the mutation is detached from `_cached.config`; no current production caller writes through these results. `UnifiedPatternMemory` and the legacy `PatternMemoryBank` both copy/freeze their resolved section (`core/UnifiedPatternMemory.js:149-165`; `core/PatternMemoryBank.js:125-157`). `trai_llm_config.readTradingConfig()` returns a detached `getAll()` copy (`core/trai_llm_config.js:5-7`) and has no committed caller that writes it back. Compatibility properties at `foundation/ConfigLoader.js:4568-4586` delegate to the same detached `getSection()` result; no production caller reads these properties as an assignment target.

`getCachedSnapshot()` returns `_cached` (`foundation/ConfigLoader.js:2501-2503`), but the snapshot config, sources, errors, warnings, revisions, and descriptor are frozen when constructed (`:2282-2292`). The two current consumers are read-only: `core/OutputPaths.js:8-11` reads the output path, and `core/WebSocketManager.js:145-147` passes the frozen snapshot to the post-save callback. No callback mutation path is present in the pinned production source.

The save path preserves cache/file coherence. `saveSettings()` clones disk settings and the cached config (`:4209-4215`), validates the candidate, builds a deep-frozen next snapshot (`:4321-4327`), writes atomically (`:4328-4333`), and publishes `settingsConfigFile` plus `_cached` only after the write succeeds (`:4334-4337`). An unchanged save exits before revision or cache publication (`:4317-4319`). No stale mutable tree is published by this path.

## Duplicate projections and precedence

The pinned builder has explicit, source-recorded projections rather than hidden mutation:

- `confidence.minTradeConfidence` is populated from the active launch profile at `:1184-1191`; its source is recorded as the profile path. There is no root canonical `confidence.minTradeConfidence` declaration to override.
- `strategyBehavior.emaCrossover` is populated from the active profile branch at `:1064-1069`.
- `orchestrator.mtfConfluenceService`, `mtfConfluenceBooster`, and `strategyMtfConfluence` are populated from profile confluence branches at `:1107-1125`.
- `strategies.soloFilter` is populated from the active profile at `:1128-1136`.
- `execution.brokerMode` and backtest `candleSource` are derived at `:1071-1077`.
- `services.news` and `featureExtraction` combine settings and internals at `:1094` and `:1249-1252`; the pinned canonical files have no overlapping keys in those pairs. Donchian and TSM exit mode fields are explicitly sourced from internals at `:1095-1102`, where the canonical settings tree does not define those mode leaves.

The six listed runtime paths have no competing root declaration in settings.json. These are profile/derived projections, not silent same-path overwrites. `remember`/`rememberTree` record the effective source (`:997-1029`), and `fillSourceGaps` only fills missing source labels (`:1275-1277` plus its implementation), so the provenance receipt exposes the precedence.

The only concrete duplicate-looking construction is `runtimeSettings` followed by the explicit config object (`:1145-1273`). It deliberately removes `launchProfiles`, `tuningProfiles`, `feeProfiles`, and `services` before rebuilding those sections (`:1145-1154`); explicit sections then carry profile, internal, credential, and derived ownership. No canonical value was found to be silently overwritten by an untracked same-owner duplicate.

## Proposed disposition

No production fix is warranted from this review. Freezing `getSection()`/`getAll()` would be a behavior change without a mutation producer and could break callers that intentionally normalize their detached copy. Keep the current frozen-snapshot boundary and source-recorded projection model. If a future caller is added that mutates a returned compatibility copy and expects the cache to change, reject that design at the caller and require an explicit `saveSettings()` transaction; do not add a fallback or implicit cache synchronization.

## Dirty worktree qualification

The current worktree changes `foundation/ConfigLoader.js` beyond this pinned source, including launch-mode validation, an extra editable `trai.enabled` path, derived worker-path projections, sizing validation, slippage validation, and moved strategy confidence descriptors. Those changes are unrelated dirty work and were not treated as committed evidence. This report makes no claim about their runtime behavior or provenance until separately pinned and reviewed.
