[MERCURY-BRIDGE] Index contains 24106 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. CHANGELOG.md:471-476 (doc_section: Multi-Runtime Gate Framework (2026-05-26)) sim=0.793
  2. ogz-meta/specs/MULTI-RUNTIME-GATE-FRAMEWORK-2026-05-26.md:7-40 (doc_section: Why This Exists#part2) sim=0.768
  3. ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:60-91 (doc_section: 1. Scoped journal contamination fix landed#part2) sim=0.778
  4. ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:92-131 (doc_section: 2. Runtime fatal audit sink landed#part3) sim=0.796
  5. ogz-meta/specs/MULTI-RUNTIME-GATE-FRAMEWORK-2026-05-26.md:7-40 (doc_section: Why This Exists#part1) sim=0.760
  6. CHANGELOG.md:431-435 (doc_section: Backtest Report Scope Gate (2026-05-26)) sim=0.760
  7. ogz-meta/BACKTEST-OPS.md:9-34 (doc_section: CURRENT STATUS NOTE — 2026-05-23) sim=0.762
  8. ogz-meta/cognition-history/mercury/pattern-memory-scope-gate-2026-05-26.md:1-30 (doc_section: root#part2) sim=0.774
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (314ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**Bypass summary**

The gate only looks at the **`exitReason`** field of each trade when it tallies tiered‑exit fractions:

* The grouping key is built from the ten fields listed in `tradeGroupKey` (lines 238‑250).
* For every trade the gate extracts `exitReason` with `String(trade.exitReason || '')` (lines 266‑267) and only counts it if that string is a *property name* of `P0_TIER_FRACTION_CAPS` (line 267).
* The fraction test is performed on the accumulated `tierSize / group.size` (lines 276‑281).

Because the check is **string‑exact** and limited to those four keys (`profit_tier_1…4`), any trade that carries tier information in another field – or that supplies an `exitReason` that does **not** match the keys exactly – is ignored by the tier‑fraction logic, even though the trade’s profit still contributes to the overall P0 summary.

Therefore a report can over‑credit tiered partial exits simply by:

1. **Leaving `exitReason` empty or miss‑spelling it** (e.g., `" profit_tier_1"` with a leading space, `"Profit_Tier_1"` with different case, or `null`).
2. **Storing the tier label in a different property** (e.g., `"profitTier": "profit_tier_1"`).
3. **Keeping the grouping fields identical** so the trades belong to the same group, but the gate never sees the tier because `exitReason` does not match any key in `P0_TIER_FRACTION_CAPS`.

The gate will then see `group.tiers.size === 0` for that group and skip the fraction check (line 274), allowing any amount of profit from those trades while still passing the tier‑exit accounting validation.

---

### Minimal report that bypasses the gate

```json
{
  "summary": {
    "finalBalance": 10000.26792578263,
    "totalTrades": 1410,
    "winRate": 60.6,
    "profitFactor": 1.00
  },
  "trades": [
    {
      "entryTime": 1680000000000,
      "entryPrice": 200,
      "strategyName": "GateStrategy",
      "direction": "long",
      "symbol": "TSLA",
      "brokerId": "alpaca",
      "accountId": "acct-main",
      "assetClass": "stocks",
      "executionMode": "paper",
      "timeframe": "15m",
      "size": 500,
      "exitReason": "",                     // <-- not a key in caps
      "profitTier": "profit_tier_1"        // tier info stored elsewhere
    },
    {
      "entryTime": 1680000000000,
      "entryPrice": 200,
      "strategyName": "GateStrategy",
      "direction": "long",
      "symbol": "TSLA",
      "brokerId": "alpaca",
      "accountId": "acct-main",
      "assetClass": "stocks",
      "executionMode": "paper",
      "timeframe": "15m",
      "size": 500,
      "exitReason": null,                  // also ignored
      "profitTier": "profit_tier_1"
    }
  ]
}
```

*All trades share the same grouping key (lines 238‑250), but because `exitReason` is empty or `null` the `if (Object.prototype.hasOwnProperty.call(P0_TIER_FRACTION_CAPS, exitReason))` block (lines 267‑269) never runs, leaving `group.tiers.size === 0`. The gate therefore skips the fraction assertion (line 274) and the report passes, even though the two trades together represent a 100 % “profit_tier_1” exit – far above the 30 % cap.*

---

**Key code evidence**

| Concern | Code location |
|---------|----------------|
| Group‑key definition (the fields that must match) | `tradeGroupKey` – lines 238‑250 |
| Extraction of `exitReason` and guard against caps | lines 266‑269 |
| Tier‑fraction calculation & assertion | lines 276‑281 |
| Skipping groups with no counted tiers | line 274 (`if (group.tiers.size === 0) continue;`) |

These lines show that any tier information not stored in an exact `exitReason` string matching one of the four caps is completely ignored, providing the concrete bypass described above.

[iterations: 6 | termination: answer_given | latency: 6194ms]
