# P1 Config Boundary Detector

## Verdict

P1 defect confirmed: the repository had config tests, but not the config-boundary invariant Trey was asking for.

The existing tests prove that `foundation/ConfigLoader.js` can resolve profiles and avoid mutating `process.env`. They do not prove that runtime modules avoid direct env reads, silent fallback defaults, or mutation/override doors outside the canonical config pipe.

## Why Green Tests Missed It

Current evidence:

- `test/config-audit-no-env-mutation.test.js` checks audit fixture behavior, source labels, and that `process.env` is not mutated during ConfigLoader/audit reads.
- `test/config-loader-no-process-env-mutation.test.js` checks profile resolution and process-env immutability.
- `tools/config-audit.js` already prints direct env reads and labels non-ConfigLoader reads as runtime reads, but it is advisory. It does not fail Jest/CI, and its active-file list is hard-coded.

So the old signal was:

> ConfigLoader resolution did not mutate env.

It was not:

> Runtime behavior cannot read or override config outside ConfigLoader.

That mismatch is the root of the false safety.

## Detector Added

Files added/changed in this P1 detector slice:

- `scripts/check-config-boundary.js`
- `test/config-boundary-detector.test.js`
- `package.json`

Command:

```bash
npm run scan:config-boundary
```

The detector scans runtime source under:

- `core/`
- `modules/`
- `foundation/`
- `brokers/`
- `run-empire-v2.js`

It excludes the declared config owners:

- `foundation/ConfigLoader.js`
- `core/BacktestConfigOverrides.js`

It detects:

- direct `process.env.*` runtime reads
- `process.env.* = ...` writes
- `delete process.env.*`
- `Object.assign(process.env, ...)`
- `process.env = ...`
- runtime `ConfigLoader` mutation calls such as `setOverrides`, `applyOverrideMap`, `applyBacktestConfigOverrides`, `applyTuningProfile`, `runWithTuningProfile`, `clearOverrides`, `freeze`, and `unfreeze`
- `||` fallback defaults on env/config reads, which are the silent override/fallback class

## Proof

Focused detector tests:

```bash
npx jest test/config-boundary-detector.test.js --runInBand
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

Syntax check:

```bash
node --check scripts/check-config-boundary.js
```

Result: pass.

Repo scan:

```bash
node scripts/check-config-boundary.js --fail-on-findings
```

Result: red as designed, `198 findings`.

## Highest-Risk Findings From The First Red Run

These are the first cleanup targets because they are behavioral, not just logging/output plumbing:

| File | Finding Class | Why It Matters |
| --- | --- | --- |
| `core/MultiAssetManager.js:40,47,52` | direct `BROKER` / `TRADING_PAIR` reads | Runtime broker/symbol ownership can diverge from resolved config. |
| `core/UnifiedPatternMemory.js:193-202,230,248` | direct symbol/asset/broker/path reads | Learned-state and pattern-bank scope can be contaminated by ambient env. |
| `core/TRAIDecisionModule.js:90,1029-1030` | direct path/mode reads | TRAI memory/mode attribution can diverge from ConfigLoader launch profile. |
| `core/exit/DynamicTrailingStop.js:41,45,48,51` | direct `TRAIL_*` env reads plus `||` defaults | Exit geometry can be silently overwritten after config consolidation. |
| `core/FeatureFlagManager.js:68` | direct `TRADING_TIER` env read plus fallback | Feature posture can diverge from profile-owned config. |
| `brokers/*Adapter.js` credential fallbacks | config-or-env fallback | Needs authority ruling: broker adapters may receive secrets by constructor only, or a declared credential owner must be named. |

## Important Boundary

This detector is not a runtime guard. It does not touch PM2, trading, broker state, exits, entries, or live behavior. It is a repository/CI proof surface.

## Required Next Step

Run a focused cleanup lane:

1. Classify the 198 findings as lawful bootstrap/secret/output plumbing vs illegal behavioral config leak.
2. Move behavioral reads into `ConfigLoader` or constructor-injected resolved config.
3. Replace `||` defaults on config reads with explicit required config values or `??` only where zero/false are valid.
4. Re-run `npm run scan:config-boundary`.
5. When only ratified lawful reads remain, either narrow the scanner allowlist or wire `scan:config-boundary` into `npm run ci`.

Until step 5 lands, any claim that config is fully consolidated is not supported by the executable test suite.
