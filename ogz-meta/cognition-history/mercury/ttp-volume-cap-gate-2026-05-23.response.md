[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:15-26 (doc_section: Mercury Verdict) sim=0.691
  2. ogz-meta/ledger/CC-SPEC-TRADING-CYCLE-FIX.md:181-212 (doc_section: Mercury Adversarial Prompt) sim=0.677
  3. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:483-495 (doc_section: My triage) sim=0.663
  4. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:17-34 (doc_section: Prompt) sim=0.624
  5. ogz-meta/slash-router.js:2597-2755 (function: mercuryAttack#part2) sim=0.448
  6. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-2026-05-18T11-07-39-506Z.md:16-45 (doc_section: Prompt) sim=0.634
  7. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-retry1-2026-05-18T11-09-54-024Z.md:16-45 (doc_section: Prompt) sim=0.634
  8. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-take3-2026-05-18T15-25-48-512Z.md:16-45 (doc_section: Prompt) sim=0.634
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 289 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.76, 10 iters, used 1x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (466ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=219.6)

═══ ANSWER ═══

**Short answer** – The current implementation does **not** let a single oversized live‑stock order slip through when the three flags are all true. The only ways to defeat the 5 % cap are to change the configuration (e.g. turn the rule off or set `reserveOnAllow:false`) or to exploit the fact that the rule only runs on **entry** plans (so a “add‑on” that is not routed through `_runPreOrderEntryGate` would never be checked).

Below are the concrete code points that make these conclusions possible and that also expose the attack surface asked for in the questions.

---

### 1. Oversized live‑stock entry cannot pass when the rule is enabled

* The rule engine is instantiated with the live config (`resolvedConfig.config.evalRules`) and the candle‑fetcher (`this.getSymbolTimeframeCandles`) – see **run‑empire‑v2.js** lines 1106‑1109【{"file":"run-empire-v2.js","start_line":1106,"end_line":1110}】.
* In `_checkTtpVolumeCap` the first guard checks that the rule is enabled (line 44‑45) and that the **time‑frame is exactly “1m”** (line 51‑55). If the time‑frame is anything else the rule fails early【{"file":"core/EvalRuleEngine.js","start_line":48,"end_line":55}】.
* The engine also insists that the order is expressed in **shares** (line 61‑66). If a different unit is supplied the rule returns a failure, not an allow‑through【{"file":"core/EvalRuleEngine.js","start_line":61,"end_line":66}】.
* The **reference candle** is always resolved (lines 122‑145). If no candle is found the engine fails with `missing_reference_volume` (lines 84‑90)【{"file":"core/EvalRuleEngine.js","start_line":84,"end_line":90}】.
* When a reference candle is found the **max‑allowed shares** are calculated as `previousOneMinuteVolume * percent` (line 92‑93). Any order whose projected total (`alreadyReservedShares + proposedShares`) exceeds that limit is rejected (line 110‑112)【{"file":"core/EvalRuleEngine.js","start_line":108,"end_line":112}】.

Because all of the above checks are performed **before** the order is handed to the broker and the result is honoured in `OrderExecutor._runPreOrderEntryGate` (lines 166‑180)【{"file":"core/OrderExecutor.js","start_line":166,"end_line":180}】, a single oversized order will always be blocked when `EVAL_RULES_ENABLED=true`, `TTP_RULES_ENABLED=true` and `TTP_VOLUME_CAP_ENABLED=true`.

---

### 2. Two “allowed‑by‑themselves” entries can bypass the aggregate 5 % cap

The rule only tracks **reserved volume** when `cfg.reserveOnAllow !== false` (lines 114‑117)【{"file":"core/EvalRuleEngine.js","start_line":114,"end_line":117}】.
`reserveOnAllow` is a configurable flag (default `true`) defined in **ConfigLoader.js** line 183【{"file":"foundation/ConfigLoader.js","start_line":182,"end_line":184}】.

If an operator (or a malicious actor) sets `TTP_VOLUME_CAP_RESERVE_ON_ALLOW=false` in the environment, the engine will **skip the reservation step**. Consequently each small order is evaluated against the same *previous‑minute* volume, sees `alreadyReservedShares = 0`, and is allowed. The cumulative volume can therefore exceed the 5 % cap without ever being blocked.

*Proof of concept*:

1. Set `TTP_VOLUME_CAP_RESERVE_ON_ALLOW=false`.
2. Submit two entry plans for the same symbol, each ≤ 5 % of the prior‑minute volume.
3. Both pass the check (projectedShares ≤ maxAllowedShares) because `alreadyReservedShares` stays 0.
4. The broker receives both orders, and the total opened volume is > 5 % of the reference candle.

---

### 3. Path where a missing or stale 1‑minute candle lets an order through

* The engine filters candles to those **≤ now** (line 129)【{"file":"core/EvalRuleEngine.js","start_line":129,"end_line":129}】.
* If the system clock (`this.now()`) is **far in the future** (e.g., the host’s clock is advanced), all real‑time candles appear “in the past” and the most recent candle may be **stale** (old but still ≤ now). The engine will happily use that stale candle as the reference (line 134‑136)【{"file":"core/EvalRuleEngine.js","start_line":134,"end_line":136}】.
* Because the rule only checks the *volume* of the reference candle, a stale candle with a **high volume** can make the cap appear generous, allowing an order that would otherwise be oversized to be accepted.

Thus a **clock‑skew** or a **delayed candle feed** creates a path where the rule thinks the volume cap is satisfied while the market reality has moved on.

---

### 4. Asset‑class / symbol / timeframe / timestamp edge cases

| Edge case | Code that makes it a problem |
|-----------|------------------------------|
| **Non‑share unit** (`quantityUnit !== 'shares'`) – the rule fails with `non_share_quantity` (lines 61‑66)【{"file":"core/EvalRuleEngine.js","start_line":61,"end_line":66}】. If downstream code ignores the failure (e.g., treats `gateResult.allowed===undefined` as true) the order could slip through. |
| **Wrong timeframe** – only `'1m'` is accepted; any other value triggers `invalid_timeframe_config` (lines 51‑55)【{"file":"core/EvalRuleEngine.js","start_line":48,"end_line":55}】. If a user forces a different `timeframe` in the config, the rule will reject the order, but the broker may still execute it because the gate result is not re‑checked after the error path. |
| **Fallback disabled** – `fallbackToMostRecentVolume` defaults to `true` (line 182)【{"file":"foundation/ConfigLoader.js","start_line":182,"end_line":182}】. If it is set to `false` and the most recent 1‑minute candle has **zero volume**, `_findReferenceCandle` returns `null` (line 145) and the rule fails with `missing_reference_volume` (lines 84‑90). If the caller swallows that failure, the order proceeds. |
| **Symbol case sensitivity** – reservation keys are normalised to upper‑case (line 160)【{"file":"core/EvalRuleEngine.js","start_line":160,"end_line":161}】. If another part of the system stores symbols in a different case and looks them up differently, reservations may not be shared, allowing aggregate overflow. |
| **Asset‑class mismatch** – the rule does **not** check `assetClass`; a stock order flagged as an “ETF” could still be evaluated against the same volume caps, potentially mis‑applying the rule to a different market. |

---

### 5. Does this change close the underlying disqualification mechanism or only the symptom?

*The rule implementation itself (the “disqualification” logic) is still present* – it still computes a per‑minute volume cap, checks the order against it, and can block the order (see `_fail` on line 175‑188)【{"file":"core/EvalRuleEngine.js","start_line":175,"end_line":188}】.

What the change **adds** is a *reservation* system (`openingVolumeReservations`) that tries to remember how much of the cap has already been used (lines 8‑9, 94‑96, 114‑117). This is a **symptom‑level mitigation**: it prevents a *single* oversized order but does **not** address the deeper design limitation that the rule only runs on the *entry* gate and that reservation can be disabled via config (`reserveOnAllow`).

**New failure modes introduced**

| New mode | Why it appears |
|----------|----------------|
| **Reservation‑bypass** (`reserveOnAllow=false`) – multiple small orders can collectively exceed the cap (see §2). |
| **Clock‑skew / stale‑candle abuse** – the rule may use an outdated candle as the reference (see §3). |
| **Config‑driven disable** – a single flag (`TTP_VOLUME_CAP_ENABLED`) can turn the whole protection off without touching the gate. |
| **Gate‑only enforcement** – any order that bypasses `_runPreOrderEntryGate` (e.g., a “add‑on” executed via a different code path) is never evaluated, leaving the market exposed. |

---

**Bottom line** – With the current code a *single* oversized order cannot slip through when the three flags are true, but the **reservation toggle**, **time‑source reliance**, and **gate‑only placement** give an attacker concrete ways to defeat the 5 % volume‑cap protection. The fix therefore removes a symptom (single‑order overflow) but leaves the underlying architectural weakness intact.

[iterations: 18 | termination: answer_given | latency: 39554ms]
