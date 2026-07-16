# TREY-CONTEXT-PARAMS-SPEC-2026-07-10
Status: OPERATOR-RATIFIED ARCHITECTURE (Trey ruling, 2026-07-10)
Prior art: AssetConfigManager per-symbol overrides (exists), SessionRouter
transition ownership (exists, battle-tested June), launchProfiles (slice 1,
in flight). This spec unifies them; it does not replace them.

## THE RULING
Per-context trading parameters resolve from a flat lookup table in
config/trading.config.json, keyed by observable facts (assetClass:timeframe),
selected by a PURE FUNCTION at decision time. No mode variables. No stored
"current context." No inheritance. No fallbacks.

## STRUCTURE (in the one config file)
contextParams:
  "stocks:15m": { confidence.minTrade, exits.*, atr.*, maxHoldMinutes, ... }
  "stocks:1m":  { ... complete block ... }
  "crypto:1m":  { ... complete block ... }
  "crypto:15m": { ... complete block ... }
Every block is COMPLETE and EXPLICIT (flat, no overlay/merge precedence —
same law as launchProfiles). Adding a timeframe = adding a block. Nothing
else changes anywhere.

## THE THREE LAWS
1. PURE SELECTOR. params(assetClass, timeframe) -> frozen block. Computed
   fresh per decision from the frozen resolved config. Never cached, never
   assigned to a "current" variable, no setter exists. A pure lookup cannot
   drift because it has no memory.
2. MISSING KEY = REFUSE, NAMED. No block for the context -> trade refused,
   key printed. NEVER falls back to a neighbor block or a default. (Silent
   neighbor-fallback is the hidden-default disease in a new mask.)
3. PROVENANCE STAMPED. Every decision-ledger row records the context key
   that governed it. Backtests/autopsies can prove which params ruled any
   trade.

## DIVISION OF LABOR (no new state anywhere)
- launchProfiles: pick the MISSION at boot (paper/eval/live-stocks/
  live-crypto/direction loadouts). Boot-time, explicit, one flag, default
  profile named in-file.
- SessionRouter: owns WHEN (the stocks<->crypto boundary — the one real
  stateful moment; already has locks + broker reconciliation).
- contextParams: owns WHAT PARAMS per candle, via pure lookup.
- AssetConfigManager per-symbol overrides: fold INTO contextParams keys in
  a later slice (symbol-level keys like "stocks:TSLA:15m" only if Trey
  rules symbols need their own blocks; otherwise per-symbol dies into
  per-class).

## WHAT THIS BUYS
- New timeframe = new table entry. Zero code. Sweepable.
- The exits/ATR/confidence sweeps get a natural output target: each
  campaign fills in one context block's numbers, committed as data.
- No mode-switch class of bugs: nothing to desync because nothing is stored.
- One-file consolidation preserved: this is a SECTION of trading.config.json,
  not a new file.

## SEQUENCING
Its own slice, AFTER slice 1 (launchProfiles) lands and pushes. Not tonight.
Slice order in the disposition table gains: contextParams migration after
family 4 (exits/tuning), since the sweep results feed it.

## ACCEPTANCE (Trey-runnable)
- grep "contextParams" config/trading.config.json -> the table, complete blocks
- A decision on an unlisted context refuses with the key named (test proves it)
- Ledger rows carry contextKey
- AST: zero readers of timeframe-conditional params outside the selector
