# WORK — MISSION 0: STOP 1 LEAF MANIFEST

**Executor:** CC (Fable, on the box) · **Date:** 2026-09-06 · **Tree:** e54a8b8d, codex/multi-asset-symbol-state
**Mission 0 deliverable:** MANIFEST.tsv — 2,238 rows. **Mission 0.1b deliverable:** 2,358 rows, 10 columns, no duplicate ids or JSON paths, and no column-count anomalies.

## How the manifest was built

1. **Enumeration (auxiliary frames).** 12 Sonnet subagents (Ruling 8: enumeration frames, no verdict authority) each swept one slice: decision literals (core A, core B, modules), Codex-census reconnaissance, features.json, env surface (ecosystem stamps + loader/bypass readers), base config sections A and B, tuning profiles + six boost/multiplier tables, strategies (three tranches), exitContracts, launchProfiles. Reader columns were produced by tracing data flow from `run-empire-v2.js` through ConfigLoader accessors to consumers — a grep hit alone was never accepted as a reader.
2. **Assembly (CC).** Rows appended to MANIFEST.tsv in id-prefixed sections: L (61), Z (40), C (105), M (88), A (129), B (125), E (213), F (77), G (203), S (314), X (301), P (582).
3. **Dispositions.** Every `proposed_disposition` is copied mechanically from the ruled category mappings in STOP1-CONFIG-SORT-2026-09-05-FABLE.md (Fable's proposals + Trey's rulings) or set to HOLD-NEEDS-OWNER. No enumeration agent placed a leaf by its own judgment.

## Mid-mission context compaction — named, not hidden

CC's session context was compacted mid-assembly. Post-compaction audit of the file (grep/cut/awk over the TSV) established exactly which sections were already on disk (L, Z, C, M, A, B, E, F, G, S, X0001–X0176) and which were not (X0177–X0301, all of P). The missing sections were **rebuilt from first principles**, not recalled from memory:

- **X0177–X0301** (PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, TimeSeriesMomentum, NoWickImbalance, default): trading.config.json:1494–1655 and ConfigLoader.js:2769–2809 read directly; every contract-specific reader re-verified live by grep with file:line receipts (see EVIDENCE.md §Verification receipts).
- **P0001–P0582** (all launchProfiles): trading.config.json:20–928 read in full; the complete accessor map extracted from ConfigLoader.js (validate sites :563–588, resolve :548–558, consumption sites :665–718, :780, :825–827, :850–852, :885–901, :913–949, :1011–1041); operational (env-overridable) exceptions identified at :935, :936, :943.

Rebuilt rows are therefore disk-verified as of this writing; they were NOT independently produced by a second agent. Flagged in REVIEW.md for cold-pull attention.

## Corrections applied at assembly

1. **Z0006–Z0012 (DynamicTrailingStop):** census-recon agent claimed a live env bypass; literals-core-B agent said the class is unwired. Adjudicated by grep: zero live `require` of DynamicTrailingStop anywhere in core/, modules/, run-empire-v2.js (re-verified post-compaction, empty result). Logic was lifted into ExitContractManager. Rows corrected to live_path=none with "CORRECTED at assembly" notes.
2. **exitContracts two-class discovery:** the older contracts (EMASMACrossover … SmartMoneySweep, DonchianBreakout, OGZTPO, ORB, BreakRetest, CandlePattern, MarketRegime, RSI, MADynamicSR) are BASE_CONFIG literal/env constructs — the JSON copies are inert (shadowed). The five newest (PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, TimeSeriesMomentum, NoWickImbalance) load via `requiredConfiguredPlainObject('exitContracts.*')` (ConfigLoader.js:2770–2778) — **for these five, the JSON IS the live source.** X-row source_layer distinguishes `INERT-shadowed` vs `LIVE - required from JSON` per contract. This matters for the surgery: editing trading.config.json changes behavior for the five, is decorative for the rest.
3. **S surface id anomaly:** one enumeration agent emitted an extra id `S0066a`; preserved as emitted (314 physical rows for the strategies surface) rather than renumbering, so agent output remains auditable.

## Deviations from dispatch (carried from MISSION.md)

1. Output path is `inbox/cc/…` not `inbox/codex/…` (Ruling 7: packet in executing agent's own directory).
2. Enumeration on Sonnet auxiliary frames; disposition column owned by CC (Fable-class seat), values mechanical from the ruled sort or HOLD.

---

## WHAT I DID — Mission 0 baseline (historical)
- Produced MANIFEST.tsv: 2,238 rows across all four mission surfaces, one row per leaf, all 10 columns populated on every row (readers column says "none" where none exist, never blank).
- Verified totality at trading.config.json top level: all 31 top-level keys have rows; per-key row sum (1,654) equals the surface's row count exactly.
- Re-verified every contract-specific reader cited in the rebuilt X rows against HEAD by grep (receipts in EVIDENCE.md).
- Adjudicated the two inter-agent disagreements (REVIEW.md) and applied corrections in-file with notes.
- Wrote this packet (MISSION/WORK/EVIDENCE/REVIEW/INHERITED).

## WHAT I DID NOT DO — Mission 0 baseline (historical)
- Did NOT commit, push, edit code, touch config, or restart anything. The packet directory is the only thing written.
- Did NOT let any agent (or myself) invent a disposition: everything unplaceable under the sort's ruled mappings is HOLD-NEEDS-OWNER (340 rows).
- Did NOT have the rebuilt sections (X0177–X0301, P0001–P0582) independently re-derived by a second agent — they are single-sourced from CC's disk reads. Named for cold-pull.
- Did NOT resolve the denominator deltas (1,654 vs 1,692 for trading.config.json; 77 vs 73 for features.json) — documented in EVIDENCE.md as accounting-method differences, held for owner ruling rather than guessed away.

## ASSUMED — Mission 0 baseline (superseded by 0.1b)
- That an array-valued leaf (e.g. `invalidationConditions`, `cryptoSymbols`, `soloFilter`, `patterns`, curve tables) is ONE row, not one row per element — except `mtfService.weights.*`, whose per-timeframe keys are individual leaves. This is the likely source of the denominator deltas above.
- That the ruled category mappings in STOP1-CONFIG-SORT-2026-09-05-FABLE.md are current law for the disposition column.
- Nothing else. Every current_value and file:line in the manifest is from a direct read of HEAD.

## Mission 0.1b work

1. Walked `config/trading.config.json` and `config/features.json` at frozen ref `e54a8b8d`, including false/null scalars and terminal empty objects while expanding every array to indexed element paths.
2. Removed 43 collapsed collection rows: 42 trading-config array parents and the `EXIT_SYSTEM.settings.availableSystems` object parent.
3. Added 162 JSON leaf rows under new ids `Q0001`–`Q0162`: 125 trading-config leaves and 37 feature leaves. This includes the arrays named by dispatch, all other arrays exposed by the complete walk, four tuning-profile names, four descriptions, thirteen evidence elements, 32 feature description/version leaves, five available-system leaves, and the terminal empty `regimeBoosts.unknown` object.
4. Added env row `E0214` for `BACKTEST_CONFIG_OVERRIDES_JSON`.
5. Replaced the three summarized current values with exact JSON string literals: two fee-profile descriptions and `trai.llm.systemPrompt`.
6. Replaced all 34 exit-contract percent-trailing reader fields using Codex's direct audit: ten live JSON inputs are validation-only at `PolicyBuilder.js:240-241`; 24 JSON inputs are shadowed at the exact `ConfigLoader.js` construction lines.
7. Applied the Sept. 7 PID ruling to all 15 `pid.*` rows.
8. Re-ran path completeness, TSV integrity, literal-value, reader-count, PID, and 0.1a receipt-preservation checks.

---

## WHAT I DID — Mission 0.1b

- Corrected the manifest to one row per frozen JSON leaf under the stated empty-object rule.
- Kept all work inside the existing packet and prepared one packet-only commit.

## WHAT I DID NOT DO — Mission 0.1b

- Did not change any of the 79 Mission 0.1a dispositions.
- Did not edit runtime code or either config input, restart PM2, or stage another agent's work.
- Did not push the 0.1b commit; it is held for cold-pull as dispatched.

## ASSUMED — Mission 0.1b

- Empty objects are terminal literal leaves (`{}`); arrays, including empty arrays, are containers and never retain a parent-as-one-row entry. This preserves receipt row `B0060` (`universalLimits = {}`) while satisfying the explicit array-expansion rule.
- No other assumptions.
