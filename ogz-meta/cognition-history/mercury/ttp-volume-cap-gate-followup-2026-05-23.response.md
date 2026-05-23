[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:15-26 (doc_section: Mercury Verdict) sim=0.675
  2. ogz-meta/sessions/session-2026-05-12-cc-c-6a-path-b-attempt-symbol-mislabel-discovered.md:133-148 (doc_section: Open Items for Next Session (Ranked)) sim=0.677
  3. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:74-90 (doc_section: Prompt) sim=0.630
  4. ogz-meta/ledger/fixes.jsonl:76-76 (jsonl_record: FIX-2026-04-23-TIER4-GUARD) sim=0.651
  5. ogz-meta/ledger/CC-SPEC-TRADING-CYCLE-FIX.md:181-212 (doc_section: Mercury Adversarial Prompt) sim=0.624
  6. ogz-meta/recent-changes.md:131-163 (doc_section: 2026-04-22 (late session): Pre-Matrix Plumbing — L5 Obs, Per-Strategy ATR, ConfigLoader Crash Fix (7 commits)) sim=0.636
  7. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:483-495 (doc_section: My triage) sim=0.680
  8. ogz-meta/cognition-history/mercury-attacks/fix29-BacktestRecorder-attack-2026-05-15T03-15-09-741Z.md:15-27 (doc_section: Mercury Verdict) sim=0.611
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 290 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.87, 18 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (467ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=168.9)

═══ ANSWER ═══

**1. Can a single oversized live‑stock entry still reach `orderRouter.sendOrder` when all caps are enabled?**
*Result:* **Mitigated‑by‑code** – the entry is blocked before the router is invoked.

- `EvalRuleEngine._checkTtpVolumeCap` calculates the projected volume and, if it exceeds the 5 % cap, returns a failure (`allowed: false`) – lines 118‑119.
- `OrderExecutor._runPreOrderEntryGate` receives that result; when `allowed === false` it logs a block and returns `null` – lines 340‑345.
- `orderRouter.sendOrder` is only called later in `OrderExecutor.executeTrade` after the gate has passed – line 416.

**2. Can multiple small entries for the same symbol/reference candle still exceed 5 % in aggregate?**
*Result:* **Mitigated‑by‑code** – the engine tracks reservations and blocks the aggregate.

- The engine builds a reservation key (`_reservationKey`) and reads any already‑reserved shares – lines 102‑104.
- It adds the new entry’s shares to the already‑reserved amount (`projectedShares`) and checks against the allowed maximum – lines 118‑119.
- If the aggregate would exceed the cap, it fails (same failure path as 1).
- After a successful check the reservation is stored – lines 122‑124 (prune then set).

**3. Can missing, stale, zero‑volume, future, malformed, or wrong‑timeframe 1 m candle data produce an allow instead of a block?**
*Result:* **Mitigated‑by‑code** – any of those conditions cause the gate to reject the entry.

- Config validation rejects a non‑`1m` timeframe, non‑finite percent, or non‑positive `maxReferenceAgeMs` – lines 52‑66.
- `_findReferenceCandle` returns a “missing_reference_volume” or “stale_reference_volume” reason when candles are absent, malformed, future‑dated, or older than `maxReferenceAgeMs` – lines 130‑154.
- If the latest candle has zero volume and `fallbackToMostRecentVolume` is disabled, the function returns a failure – lines 156‑160.
- `EvalRuleEngine._checkTtpVolumeCap` propagates any failure from `_findReferenceCandle` – lines 90‑97.

**4. Is there any live‑order path in the current code that bypasses `OrderExecutor._runPreOrderEntryGate`?**
*Result:* **No** – every live order goes through the gate.

- The only call to `orderRouter.sendOrder` is inside `OrderExecutor.executeTrade` after the gate check – line 416.
- The gate is invoked for every entry plan before any broker/webhook side‑effects – lines 338‑345.
- A repository‑wide search finds no other `sendOrder` calls outside this file.

**5. Did this hardening close the root disqualification mechanism, and what residual risks remain?**

- **Root disqualification closed:** The old `reserveOnAllow` flag and its “disable‑reservation” branch were removed; the engine now always reserves allowed opening volume – lines 117‑118 (always reserves) and the reservation‑disable code no longer exists.

- **Residual operational risks:**
  * **Configuration‑driven risk** – an operator could set `maxReferenceAgeMs` too high, allowing stale candles to be accepted (the gate only checks that the candle age is ≤ `maxReferenceAgeMs`). (see config validation lines 180‑184 and age check lines 145‑154).
  * **Data‑source reliability** – the gate assumes `this.getCandles` returns accurate 1 m candles; if the data feed supplies malformed timestamps that still parse to a finite number, the gate may treat them as valid (the timestamp conversion in `_candleTimeMs` normalises values – lines 171‑175).
  * **Fallback behaviour** – when `fallbackToMostRecentVolume` is `true`, the engine will fall back to an earlier non‑zero‑volume candle; if that candle is still stale (but within `maxReferenceAgeMs`) the cap may be applied to outdated volume, potentially allowing slightly higher exposure than intended.

All other identified concerns (aggregate bypass, stale‑candle acceptance, reservation‑disable) are now **mitigated‑by‑code** as shown above.

[iterations: 15 | termination: answer_given | latency: 18863ms]
