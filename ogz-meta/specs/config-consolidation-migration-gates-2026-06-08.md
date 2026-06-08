# Config Consolidation Migration Gates

**Date:** 2026-06-08
**Status:** Active migration gate
**Scope:** Required acceptance standard for collapsing OGZPrime config ownership into one canonical runtime configuration surface.

## Purpose

This document is the gate for the one-config migration. It prevents the migration from being accepted as a pathing cleanup, smoke test, or partial facade change.

The migration is not complete until OGZPrime has one canonical owner for trading tunables, profiles, exit contracts, source tracking, validation, and runtime injection. Any compatibility facade that remains must read from that canonical owner and must not keep independent defaults, independent env readers, or mutable config state.

## Current Verified Split

The current repo is still split:

- `foundation/ConfigLoader.js:1-15` declares ConfigLoader as the single env reader and constructor-injection source.
- `foundation/ConfigLoader.js:650-707` loads dotenv values into an effective local env, validates, fingerprints, freezes config, and restores the active env reader.
- `core/TradingConfig.js:1-14` declares TradingConfig as the centralized trading configuration surface.
- `core/TradingConfig.js:16-44` still reads `process.env` through local env helpers.
- `core/TradingConfig.js:46-82` owns tuning-profile env-to-config path mapping.
- `core/TradingConfig.js:374` owns locked per-strategy exit contracts.
- `core/TradingConfig.js:1148-1645` owns tuning-profile definitions, resolution, status, and apply/with-profile behavior.

This is not one config file yet. The last accepted work fixed ownership/pathing through the audit surface. It did not retire the split owner model.

## Canonical Owner Rule

Before migrating code, choose the canonical owner explicitly:

- If `ConfigLoader` is canonical, `TradingConfig` must become a compatibility facade over ConfigLoader-backed values, or be removed after consumers migrate.
- If `TradingConfig` is canonical, ConfigLoader's env loading, source tracking, validation, fingerprinting, and freeze behavior must be folded into TradingConfig or delegated through one non-owning parser module.

There is no accepted middle state where both files retain independent defaults, independent env readers, or overlapping runtime mutation authority.

For this migration, "enforced" means the non-canonical owner is removed or reduced to a non-owning compatibility facade. A name, flag, comment, exported alias, or doc claim does not satisfy enforcement.

## Required Migration Slices

Each slice must be one logical change and one commit. Do not bundle config migration with unrelated cleanup.

1. Inventory the current value path before changing it.
2. Move one config family at a time.
3. Add or update tests for that family in the same commit.
4. Run sibling scans for same-class env readers, defaults, mutation paths, and consumer bypasses.
5. Run Mercury as an adversarial attack for executable/config-runtime changes.
6. Run the P0 anchor for any slice that touches the trade path, backtest execution path, profile application, exit contracts, sizing, fees, slippage, or strategy registration.
7. If any code or test changes after Mercury or P0, rerun the affected focused tests and rerun P0 for trade-path slices.

## Required Test Matrix

Smoke tests are not enough. Every migrated config family must have focused proof in the commit that migrates it.

Every test category in this matrix is blocking for the migrated family. A missing, skipped, failing, or manually waived proof means the migration slice is incomplete.

### Inventory Test

The test must prove every migrated key has:

- Old source path.
- New source path.
- Type.
- Resolved value under a controlled env fixture.
- Source label.
- Redaction behavior for secret-class values.
- Consumer path that reads the value.

Missing leaves are a failure. A config value with no reader is dead config and cannot be checked off.

### Parity Test

The test must compare old and new resolution for the migrated family under a controlled fixture:

- Same env input.
- Same resolved config value.
- Same type.
- Same source label semantics.
- No `process.env` mutation before, during, or after load.

If the migration intentionally changes a value, that change must be named as a behavior change and cannot hide inside the consolidation commit.

### Profile Swap Test

Profile behavior must prove:

- Profile apply changes only approved tunable paths.
- Runtime snapshot keys are preserved and restored.
- Forbidden env keys are refused.
- Profile definitions cannot be mutated through returned objects.
- Swap, run, swap-back behavior is deterministic.
- Profile application does not write directly to `process.env`.
- Any runtime boundary used for profile application must be a scoped object, serialized worker config, or explicit config facade. It cannot be global env mutation by another name.

### Exit Contract Test

Every locked strategy exit contract must preserve:

- Stop loss.
- Take profit.
- Trailing settings.
- Min confidence.
- Max hold behavior.
- `_validated` fingerprint/provenance fields.

Any strategy-specific override path must still win over global tuning where the current contract says it wins.

### Consumer Boundary Test

For every migrated value, test at least one real consumer boundary:

- Constructor-injected consumer, if the consumer is already injection-based.
- Static/facade consumer, if the migration keeps a compatibility facade.
- Backtest worker consumer, when workers receive the value through serialized canonical worker config.

The test must prove the consumer reads the canonical value, not a stale env value or an old default.

The sibling scan for the migrated family must prove no downstream production consumer still reads that migrated value from `process.env` after canonical load.

Legacy env-based worker propagation may be inventoried as current behavior, but it is not accepted final propagation unless the only env read is inside the worker bootstrap/canonical config owner.

### Negative Test

Invalid or missing trading-critical values must fail loudly. The migration cannot add silent fallbacks, implicit defaults, warn-only failures, or value coercion that hides bad config.

Any retained baseline/default must be an explicitly named canonical config value with provenance and test coverage.

### Audit Test

The config audit must remain able to prove:

- Full canonical leaf coverage.
- Secret redaction.
- No audit-time `process.env` mutation.
- No missing `ConfigLoader` or canonical-owner leaves.
- No direct runtime env reads in migrated production paths.
- The only accepted `process.env` reads are inside the canonical config owner/bootstrap loader. Naming a read outside that owner does not clear it.

## Required Commands

Use the smallest focused test set that proves the migrated family, then run the repo gates that protect this bug class.

Mandatory for docs-only gate updates:

```bash
git diff --check -- ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md
npm run scan:secrets -- --staged
```

Passing the docs-only commands only accepts an edit to this specification. It does not satisfy or replace any migration acceptance gate.

A migration completion claim based only on docs-only commands violates this specification.

Mandatory for executable config migration slices:

```bash
node --check foundation/ConfigLoader.js
node --check core/TradingConfig.js
node tools/config-audit.js
npm run scan:secrets -- --staged
npm test -- --runInBand <focused config tests>
node tools/config-audit.js
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

The P0 command must be the final trade-path proof for a slice after code changes, focused tests, and Mercury-driven patches. Any later code or test change invalidates that P0 result for the slice and reverts the slice to unverified.

Mercury is mandatory before accepting executable/config-runtime changes. The prompt must be one adversarial ask at a time and include exact file/line ranges for the migrated family.

## Completion Bar

Do not call the one-config migration complete until all of these are true:

- One canonical config owner is named and enforced, and every non-canonical config file is removed or reduced to a non-owning compatibility facade with no independent defaults, env reads, validation, mutation, source tracking, or fingerprint authority.
- No production trade-path module keeps independent config defaults for migrated keys.
- No production path for a migrated key reads `process.env` directly outside the canonical config owner/bootstrap loader.
- No remaining production `process.env` read outside the canonical config owner/bootstrap loader is left as open work when the full one-config migration is called complete.
- No migrated profile, override, or audit path mutates global env.
- Existing trading profiles and locked exit contracts are parity-proven.
- Backtest worker config propagation is parity-proven.
- Config audit reports zero remaining production env reads outside the canonical config owner/bootstrap loader for migrated keys and for the full migration.
- Focused tests, Mercury, and P0 are green for all trade-path slices.
- The `Current Open Work That Blocks Completion` section is removed or replaced with audit evidence proving it is no longer true.

## Stop Conditions

Stop the migration and root-cause before continuing if any of these happen:

- P0 anchor moves.
- A migrated key resolves to a different value without an approved behavior-change commit.
- A profile changes runtime mode, data source, candle file, account, broker, asset class, or execution mode.
- A consumer reads a stale env value after canonical config has a different value.
- A default/fallback path hides an invalid trading-critical input.
- The audit cannot account for a config leaf or direct env read.
- A required test matrix category is missing, skipped, waived, or failing.
- Code or test changes occur after the final P0 proof for that slice.

## Current Open Work That Blocks Completion

The config audit still reports runtime `process.env` reads outside the audit tool. Those reads are current open work and block full one-config completion. They must be retired or migrated into the canonical config owner/bootstrap loader in future one-family slices before the full one-config migration can be called complete.

This section must be removed or replaced with audit evidence in the final completion commit. While it remains true, the migration is not complete.
