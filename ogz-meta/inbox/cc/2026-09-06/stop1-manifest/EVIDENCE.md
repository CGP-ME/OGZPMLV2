# EVIDENCE — MISSION 0: STOP 1 LEAF MANIFEST

All numbers below were computed mechanically over MANIFEST.tsv (cut/awk/uniq) at assembly close, and every code citation was read from HEAD e54a8b8d on the box.

The original Mission 0 counts below are the `b364d364` baseline. The Mission 0.1b section at the end is the current authoritative completeness and integrity evidence.

## Row integrity

- **2,238 data rows** + 1 header = 2,239 lines.
- **Every row has exactly 10 tab-separated columns** (awk `NF!=10` over all lines: zero hits, header included).
- **Zero duplicate ids** (`cut -f1 | sort | uniq -d`: empty).
- One deliberate id anomaly: `S0066a` (agent-emitted extra row, preserved; see WORK.md).

## Counts per id section

| section | rows | slice |
|---|---|---|
| L | 61 | decision literals, core tranche A |
| C | 105 | decision literals, core tranche B |
| M | 88 | decision literals, modules |
| Z | 40 | Codex-census reconnaissance rows |
| A | 129 | base config sections A (confidence/risk/authFailureGuard/positionSizing/exits/exitLogic/entryLogic/orchestrator) |
| B | 125 | base config sections B (remaining base sections) |
| E | 213 | env surface (ecosystem stamps + loader/bypass readers) |
| F | 77 | features.json |
| G | 203 | tuningProfiles + feeProfiles + six boost/multiplier tables |
| S | 314 | strategies.* (incl. S0066a) |
| X | 301 | exitContracts.* |
| P | 582 | launchProfiles.* (defaultProfile + 7 profiles × 83 leaves) |

## Counts per surface (mission's four surfaces)

| surface (col 2) | rows |
|---|---|
| trading.config.json | 1,654 |
| features.json | 77 |
| env | 213 |
| decision-literal | 211 |
| constructor-literal | 83 |

## Counts per disposition

| proposed_disposition | rows |
|---|---|
| MOVE-TO-SETTINGS | 1,711 |
| HOLD-NEEDS-OWNER | 340 |
| DELETE-AS-DEAD | 79 |
| MOVE-TO-INTERNALS | 72 |
| KEEP-AS-CODE-CONSTANT | 36 |

## live_path distribution

yes 1,306 · backtest-only 534 · none 398.

## Totality proof, trading.config.json top level

All 31 top-level keys of config/trading.config.json have manifest rows; the per-key sum equals the surface count exactly (1,654):

confidence 6 · risk 4 · authFailureGuard 2 · launchProfiles 582 · tuningProfiles 90 · feeProfiles 17 · patternMemory 20 · positionSizing 14 · regimeBoosts 22 · volumeProfileBoosts 21 · pid 15 · exits 17 · exitContracts 301 · exitLogic 45 · strategyBehavior 10 · entryLogic 15 · strategies 314 · orchestrator 26 · universalLimits 1 · holdTimes 4 · fees 5 · filters 2 · timeframeConfig 28 · regimeMultipliers 14 · profiles 24 · scalper 5 · features 5 · trai 17 · pipeline 26 · fundTarget 1 · startingBalance 1.

## Denominator reconciliation — HELD, not resolved

| denominator (dispatch) | manifest | delta | reading |
|---|---|---|---|
| trading.config.json "1,692" | 1,654 rows | −38 | arrays counted as one leaf per array here (invalidationConditions, cryptoSymbols, soloFilter, patterns, curve tables); the 1,692 count likely enumerates array elements. HOLD for owner — not guessed away. |
| features.json "73" | 77 rows | +4 | same accounting question in reverse (nested leaves counted individually here). HOLD. |
| env (Amp 2026-08-28 census) | 213 rows | — | E-section built against that census as denominator (ecosystem stamps + every loader/bypass reader). |
| literal surface (Codex 2026-08-16 census) | 211 + 83 = 294 rows | — | Z-section records the reconnaissance against Codex's census; enumeration agents reported the census's literal count has drifted since Aug 16 (codebase moved). Families named in spec 1.6 all present; census is denominator, not ceiling. |

## Verification receipts (rebuilt sections, post-compaction — every one re-read from HEAD)

**exitContracts loader classes:**
- ConfigLoader.js:2770–2778 — PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, TimeSeriesMomentum, NoWickImbalance all `requiredConfiguredPlainObject('exitContracts.*')` → JSON is live for these five.
- ConfigLoader.js:2779–2808 — `default` contract is a BASE_CONFIG literal block (JSON copy shadowed).
- ConfigLoader.js:2774–2777 — loader comment: NoWick structural exits, fallbacks are safety nets, unvalidated.

**ECM invalidation dispatcher cases (grep `case '` over ExitContractManager.js):** donchian_channel_reentry :448, tsm_return_flip :466, ema_cross_reversal :488, regime_change :513, rsi2_exit_long :522, sr_level_broken :533, pattern_negated :546, sweep_invalidated :551, mtf_divergence :562. Labels configured in JSON but with NO case (never fire): ema_pullback_invalidated, ema_retest_failed, liquidity_absorbed, sr_break, pattern_invalidated, sweep_absorbed, break_retest_invalidated, fvg_filled, or_break_reversal.

**Contract field readers:**
- maxConcurrentEntries — ECM.js:146,238–239 (resolve/backfill); OrderExecutor.js:1661–1693 (live concurrency gate).
- scaleIn — ECM.js:147,225–244 (clone/resolve); OrderExecutor.js:1700–1747 (enabled gate :1700–1701; maxAdds :1710; addTriggerClass :1723–1724; requireProfitConfirmation :1735; aggregateRiskCap :1742). addSizingLadder cloned at ECM.js:230–232, no behavioral consumer found.
- rsiExitLong/rsiPeriod — ECM.js:524–525 (rsi2_exit_long case), ECM.js:976–985 (signal override merge).
- atrStopMult/trailAtrMult — PolicyBuilder.js:232–234, :243–244 (validate/freeze); ECM.js:743–746 (ATR trail path, live when trailType=atr).
- DynamicTrailingStop — zero live requires (grep over core/, modules/, run-empire-v2.js: empty).

**launchProfiles accessor map (ConfigLoader.js):** resolve :548–558; validate mode/confirmLive/sessionRouter :563–588; consumption — sessionRouter :665–681, mode tracks :688–718, minTradeConfidence :780, strategyBehavior :825–827, confluence :850–852 (helpers :298–331), risk :885–901, venueGuards→evalRules :913–949, soloFilter :1011 (via :457, backtest-only env alias SOLO_STRATEGY), pipeline toggles :1012–1028, directionFilter :1041. Env-overridable exceptions (operational*): accountStartOfDayDate :935 (TTP_ACCOUNT_START_OF_DAY_DATE), accountStartOfDayEquity :936 (TTP_ACCOUNT_START_OF_DAY_EQUITY), earningsRestriction.manualStatus :943 (TTP_EARNINGS_STATUS_JSON).

**Inherited-finding spot checks re-verified on HEAD:** TRAIDecisionModule.js:64–65 `...config` spread followed by `enableVetoPower: false` (config self-clobber); MaxProfitManager.js absent from core/ and modules/ (ls: no such file).

## Mission 0.1b — completeness and integrity evidence

### Counting rule

- Every string, number, boolean, and null is a leaf.
- An empty object is a terminal literal `{}` leaf. This retains `universalLimits`, `exitLogic.safety`, each empty `actionParams`, and `regimeBoosts.unknown`.
- Every array is a container, including an empty array. Non-empty arrays recurse to indexed paths; empty arrays contribute zero rows. No array parent remains as a manifest row.
- Feature paths under the file's top-level `features` object omit that wrapper to preserve the established manifest naming convention. Top-level `environment.*` paths retain their prefix.

### Scripted two-way path completeness check

```bash
#!/usr/bin/env bash
set -euo pipefail

mission01b_ref=e54a8b8d
mission01b_manifest=ogz-meta/inbox/cc/2026-09-06/stop1-manifest/MANIFEST.tsv
mission01b_tmp=$(mktemp -d /tmp/mission-01b-completeness.XXXXXX)
trap 'rm -rf "$mission01b_tmp"' EXIT

mission01b_leaf_filter='paths((type != "array" and type != "object") or (type == "object" and length == 0))'
mission01b_path_format='reduce .[] as $part (""; if ($part|type)=="number" then . + "[" + ($part|tostring) + "]" elif .=="" then $part else . + "." + $part end)'

git show "$mission01b_ref:config/trading.config.json" |
  jq -r "$mission01b_leaf_filter | $mission01b_path_format" |
  sort -u > "$mission01b_tmp/trading-source"

git show "$mission01b_ref:config/features.json" |
  jq -r "$mission01b_leaf_filter | (if .[0]==\"features\" then .[1:] else . end) | $mission01b_path_format" |
  sort -u > "$mission01b_tmp/features-source"

awk -F '\t' 'NR>1 && $2=="trading.config.json" {print $3}' "$mission01b_manifest" |
  sort -u > "$mission01b_tmp/trading-manifest"
awk -F '\t' 'NR>1 && $2=="features.json" {print $3}' "$mission01b_manifest" |
  sort -u > "$mission01b_tmp/features-manifest"

comm -23 "$mission01b_tmp/trading-source" "$mission01b_tmp/trading-manifest" > "$mission01b_tmp/trading-source-only"
comm -13 "$mission01b_tmp/trading-source" "$mission01b_tmp/trading-manifest" > "$mission01b_tmp/trading-manifest-only"
comm -23 "$mission01b_tmp/features-source" "$mission01b_tmp/features-manifest" > "$mission01b_tmp/features-source-only"
comm -13 "$mission01b_tmp/features-source" "$mission01b_tmp/features-manifest" > "$mission01b_tmp/features-manifest-only"

printf 'reference=%s\n' "$mission01b_ref"
printf 'trading_source_paths='; wc -l < "$mission01b_tmp/trading-source"
printf 'trading_manifest_paths='; wc -l < "$mission01b_tmp/trading-manifest"
printf 'trading_source_only='; wc -l < "$mission01b_tmp/trading-source-only"
printf 'trading_manifest_only='; wc -l < "$mission01b_tmp/trading-manifest-only"
printf 'features_source_paths='; wc -l < "$mission01b_tmp/features-source"
printf 'features_manifest_paths='; wc -l < "$mission01b_tmp/features-manifest"
printf 'features_source_only='; wc -l < "$mission01b_tmp/features-source-only"
printf 'features_manifest_only='; wc -l < "$mission01b_tmp/features-manifest-only"

test ! -s "$mission01b_tmp/trading-source-only"
test ! -s "$mission01b_tmp/trading-manifest-only"
test ! -s "$mission01b_tmp/features-source-only"
test ! -s "$mission01b_tmp/features-manifest-only"
printf 'result=PASS\n'
```

Output:

```text
reference=e54a8b8d
trading_source_paths=1737
trading_manifest_paths=1737
trading_source_only=0
trading_manifest_only=0
features_source_paths=113
features_manifest_paths=113
features_source_only=0
features_manifest_only=0
result=PASS
```

### Integrity re-run

```text
header_columns=10
rows=2358
bad_columns=0
duplicate_ids=0
duplicate_json_paths=0
new_Q_rows=162
backtest_override_rows=1

pid_rows=15 pid_mismatches=0
trailing_rows=34 live_validation_rows=10 shadowed_rows=24 reader_mismatches=0
audit_shadow_rows=24 audit_live_rows=10 audit_reader_mismatches=0
receipt_rows=79 receipt_disposition_mismatches=0
new_literal_rows=162 new_literal_mismatches=0
corrected_literal_rows=3 corrected_literal_mismatches=0
tuning_name_description_rows=8 tuning_evidence_rows=13
feature_description_version_rows=32 available_system_rows=5
git_diff_check=PASS
```

Current disposition counts:

| proposed_disposition | rows |
|---|---:|
| MOVE-TO-SETTINGS | 1,838 |
| HOLD-NEEDS-OWNER | 341 |
| MOVE-TO-INTERNALS | 72 |
| DELETE-AS-DEAD | 41 |
| KEEP-AS-CODE-CONSTANT | 36 |
| DELETE-RULED | 30 |

The 79-row Codex receipt was joined to the current manifest by id; every `disposition_0_1a` matched, including the 41 remaining `DELETE-AS-DEAD`, 30 `DELETE-RULED`, and eight `MOVE-TO-SETTINGS` rows.
