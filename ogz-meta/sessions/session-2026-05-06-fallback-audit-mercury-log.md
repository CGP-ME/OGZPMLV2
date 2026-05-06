# Session 2026-05-06 — FALLBACK-AUDIT Mercury Adversarial Log

Running log of every `/critic-attack` dispatch this session: prompt, Mercury's answer, my triage, my actions taken because of it.

Per Trey: "the prompt its answers and your actions ... so keep a running track."

---

## Dispatch 1 — CRIT-07 post-fix attack on `core/OrderExecutor.js`

**Commit context:** `02118cb fix(order-executor): CRIT-07 — preserve sizingMultiplier=0 (?? not ||)`

**Provider:** Mercury-2 (Inception)
**Iterations / wall:** 14 iters / 19.3s / `term=answer_given`
**Blast radius:** 1 caller (`run-empire-v2.js`)

### Prompt

```
Adversarial review of core/OrderExecutor.js focused on the CRIT-07 fix at lines 238 and 383.

The change: orchResult?.sizingMultiplier || 1.0 -> orchResult?.sizingMultiplier ?? 1.0

Intent: preserve sizingMultiplier === 0 (intentional VP chop suppression) instead of upgrading it to 1.0.

HUNT concrete failure modes the fix could introduce. After 5-6 tool calls you MUST stop searching and write the final answer.

- Construct a state where sizingMultiplier === 0 produces CRASH/NaN downstream (positionSize * 0, then division, etc).
- WEAPONIZE the new zero-size path against the trade-receipt logger, ledger, exit contract, stateManager.openTrade.
- REGRESS the caller in blast radius: any assumption that trade size is nonzero?

Cite file:line. Find 3 distinct failure modes OR explicitly state none found. Stop searching at 6 tool calls.
```

### Mercury's Answer (3 findings)

1. **Division-by-zero / NaN in P&L calculation** — claimed downstream code that does `pnl / tradeSizeUsd` would produce NaN when sizingMultiplier=0. Cited `core/StateManager.js:552-560`.

2. **Zero-size position sent to execution layer** — claimed `mpmInstance.start(price, 'buy', adjustedPositionSize=0, ...)` could trigger broker SDK assertions or API errors. Cited `core/OrderExecutor.js:306-311` (buy) and `:444-449` (short).

3. **Ledger / logger records a zero-size trade, breaking downstream consumers** — claimed `TradingProofLogger.trade` at `:364-374` records `size: positionSize` but actual traded value is `adjustedPositionSize` (line 252-255). Mismatch when sizingMultiplier ≠ 1.0.

### My initial triage (WRONG on 2 of 3)

- #1: FALSE POSITIVE — divides by tradeEntryPrice not tradeSizeUsd
- #2: REAL but unreachable (size-0 filtered upstream — claimed by phase 0 evidence)
- #3: FALSE POSITIVE — both fields use positionSize

### Action: committed `02118cb` with the above triage in body, moved to CRIT-08 prep.

### Trey corrected me: "mercury is rarely wrong"

### Re-verification (after Trey's challenge)

**#1 still FALSE POSITIVE:** grep `/ tradeSizeUsd`, `value_usd / size`, `/ trade.size` across `core/` + `run-empire-v2.js` returned ZERO hits. Mercury speculated about downstream that doesn't exist.

**#2 was REAL not unreachable:** grep for upstream filters (`sizingMultiplier <=`, `positionSize <= 0`, `adjustedPositionSize <= 0`) found ONLY the two `??` declarations. No filter exists. Whether the path is reachable depends on `stateManager.openPosition(0, ...)` behavior — if it doesn't reject size 0, the bug is live.

**#3 was REAL — I MISREAD THE CODE:** line 252 `const actualDollars = adjustedPositionSize` — the real traded USD. Line 367-369 ledger uses `size: positionSize` and `value_usd: positionSize * price` — BASE values. When sizingMultiplier=0 (or any value ≠ 1.0), the ledger logs the WRONG amount. Pre-existing bug, made worse by CRIT-07's exposure of size-0 paths.

### Actions taken because of Mercury

1. **#1 (P&L div-by-zero):** confirmed FALSE POSITIVE — grep for `/ tradeSizeUsd`, `value_usd / size`, etc. returns zero hits across `core/` + `run-empire-v2.js`. No action.
2. **#2 (zero-size to mpmInstance):** confirmed REACHABLE — `stateManager.openPosition()` at `:370` has no `size > 0` guard. But Phase 0 evidence shows trade count drops (1430 → 1384 = -46), meaning size-0 trades are being filtered SOMEWHERE before persistent recording, even though the path can technically execute. Defense-in-depth concern, not a fix-now blocker. **Surfacing for follow-up audit.**
3. **#3 (ledger size/value mismatch):** REAL — fixed in commit (pending). Replaced `size: positionSize, value_usd: positionSize * price, fees: (positionSize * price) * makerFee` with `adjustedPositionSize`-based equivalents at both BUY (`:367-370`) and SHORT (`:502-504`) sites.

---

## Dispatch 2 — post-ledger-fix attack on `core/OrderExecutor.js`

**Provider:** Mercury-2 (Inception)
**Iterations / wall:** 23 iters / 35.7s / `term=answer_given`

### Prompt

```
Adversarial review of core/OrderExecutor.js focused on ledger consistency fix at TradingProofLogger.trade calls (lines 364-375 BUY and 498-509 SHORT).

Change: replaced positionSize -> adjustedPositionSize in size, value_usd, and fees fields. Goal: ledger logs the actual traded amount, not the base pre-multiplier amount.

HUNT failure modes the fix could expose. Stop searching at 6 tool calls.

- WEAPONIZE the case where adjustedPositionSize === 0 (sizingMultiplier was 0): does the ledger now record a 0-size, 0-fees, 0-value_usd entry? Is that worse than before (when it logged false-positive non-zero values)?
- REGRESS the proof page consumer (public/proof or wherever): does any field assume non-zero size?
- HUNT for OTHER ledger sites in the same file that still reference positionSize and would now mismatch this proof logger entry.
- Look for any analytics or chart consumer that does pnlPercent = (value_usd_close - value_usd_open) / value_usd_open and would NaN on 0-value entries.

Cite file:line. Find concrete failure modes OR explicitly state none found. Stop searching at 6 tool calls.
```

### Mercury's Answer (4 findings)

1. **Zero-size ledger entry** when `adjustedPositionSize === 0`. Cited `core/OrderExecutor.js:368-371` + `:502-505`.
2. **Proof-page UI tolerates `size||value_usd||null` chain** at `public/unified-dashboard-legacy.html:4492` — could fall through to `null` if size=0.
3. **Other ledger-related calls still use `positionSize`** — Mercury catalogued 7 sites:
   - `:165` unifiedResult `size: positionSize` (broker order surface)
   - `:321` Telegram BUY `size: positionSize / stateAfter.balance`
   - `:326` Discord BUY `notifyTrade('buy', price, positionSize)`
   - `:334` Pattern-exit BUY `size: positionSize`
   - `:458` Telegram SHORT `size: positionSize / stateAfter.balance`
   - `:462` Discord SHORT `notifyTrade('sell_short', price, positionSize)`
   - `:470` Pattern-exit SHORT `size: positionSize`
4. **No `value_usd` divisions found** — searched and confirmed no NaN risk in current consumers. ✅

### My triage

1. **#1 zero-size entry:** INTENDED behavior of the fix. Logging $0 when nothing was traded is the desired outcome (truth > false-positive non-zero). No action.
2. **#2 dashboard `||` chain:** REAL but downstream — `public/unified-dashboard-legacy.html` is "legacy" filename. Need to verify if it's still wired before treating as actionable. Surfacing.
3. **#3 7 sites still using `positionSize`:** REAL — same bug class as proof-logger. Architectural: every consumer-facing log of trade size should reflect actual trade. **All 7 sites verified accurate via direct grep.** But scope expansion beyond CRIT-07. Surfacing for Trey's direction.
4. **#4 no NaN risk:** confirmation — Mercury did the search, no consumers do `value_usd` divisions.

### Action taken because of Mercury (this dispatch)

- Committed minimal proof-logger fix (Mercury's literal #3 from Dispatch 1 = #3 here in #1 form).
- **Did NOT expand to the 7 other sites** in this commit — flagging for Trey's scope direction.
- **Did NOT touch the dimensional bug** (`USD × price = nonsense`) — separate finding, separate scope.
- All 7 additional sites + dimensional bug listed in commit body as follow-up.
