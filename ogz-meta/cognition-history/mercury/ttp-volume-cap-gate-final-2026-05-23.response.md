[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/cognition-history/mercury-attacks/fix17-OrderExecutor-attack-2026-05-14T01-12-09-119Z.md:15-26 (doc_section: Mercury Verdict) sim=0.687
  2. ogz-meta/sessions/session-2026-05-06-fallback-audit-mercury-log.md:74-90 (doc_section: Prompt) sim=0.652
  3. ogz-meta/cognition-history/mercury-attacks/fix29-BacktestRecorder-attack-2026-05-15T03-15-09-741Z.md:15-27 (doc_section: Mercury Verdict) sim=0.633
  4. ogz-meta/ledger/fixes.jsonl:76-76 (jsonl_record: FIX-2026-04-23-TIER4-GUARD) sim=0.658
  5. ogz-meta/ledger/CC-SPEC-TRADING-CYCLE-FIX.md:181-212 (doc_section: Mercury Adversarial Prompt) sim=0.635
  6. ogz-meta/ledger/pg/CC-SPEC-PHASE-G-TRAI-ENDPOINTS_1.md:405-458 (doc_section: Adversarial Mercury prompt) sim=0.635
  7. core/SymbolTradingContext.js:78-129 (method: constructor) sim=0.453
  8. ogz-meta/sessions/session-2026-05-12-cc-c-6a-path-b-attempt-symbol-mislabel-discovered.md:133-148 (doc_section: Open Items for Next Session (Ranked)) sim=0.685
[TRACE-MEMORY] Eviction: 0 stale + 0 over-cap, 291 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.91, 15 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
🚀 TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
✅ TRAI LLM warm-up complete (323ms)
✅ TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=94.5)

═══ ANSWER ═══

**1. Can a single oversized live TSLA stock entry reach `orderRouter.sendOrder` when the three flags are true?**
No. The pre‑order gate (`EvalRuleEngine._checkTtpVolumeCap`) returns a failure whenever the projected share count exceeds the allowed 5 % cap, and `OrderExecutor` aborts the trade before any broker call.

- The cap is computed as `maxAllowedShares = previousOneMinuteVolume * percent` (line 101).
- The projected total is `alreadyReservedShares + proposedShares` (lines 104‑105).
- If `projectedShares > maxAllowedShares` the rule fails (lines 118‑120).
- `OrderExecutor` runs the gate first (`_runPreOrderEntryGate`) and returns `null` when `gateResult.allowed === false` (lines 337‑345).

**Classification:** **real blocker** – the code actively blocks the oversized order before any routing.

---

**2. Can two smaller opening/add‑on entries for the same symbol/reference 1 m candle exceed 5 % in aggregate?**
No. The engine aggregates reservations per symbol + candle key (`openingVolumeReservations`). Each new entry adds its `proposedShares` to the already‑reserved amount; if the sum exceeds the cap the rule fails (same logic as above).

- Reservation key is built on symbol and reference candle time (line 102).
- Existing reservation is read from the map (line 103) and added to the new order (line 104).
- The same `projectedShares > maxAllowedShares` check (lines 118‑120) blocks the second entry when the aggregate would exceed 5 %.

**Classification:** **mitigated‑by‑code** – the reservation mechanism prevents aggregate overflow.

---

**3. Can missing, stale, future, malformed, zero‑volume, wrong‑timeframe, non‑share, non‑finite, or loose‑config data produce an *allow* instead of a block?**

All of those conditions are explicitly rejected:

| Condition | Evidence |
|-----------|----------|
| Wrong timeframe (`cfg.timeframe !== '1m'`) | lines 52‑56 |
| Invalid `percent` (non‑finite or out of (0,1]) | lines 57‑61 |
| Invalid `maxReferenceAgeMs` (non‑finite or ≤ 0) | lines 62‑66 |
| Non‑share quantity unit | lines 67‑72 |
| Non‑finite or non‑positive order quantity | lines 74‑79 |
| Missing candle source (`this.getCandles` not a function) | lines 81‑86 |
| No candles at all | line 129‑130 (inside `_findReferenceCandle`) |
| Malformed candle time (non‑finite) – filtered out | line 136 |
| Future‑dated candles – filtered out | line 137 |
| Stale reference candle (now‑time > maxReferenceAgeMs) | lines 145‑154 |
| Zero‑volume latest candle – falls back only if `fallbackToMostRecentVolume` is true; otherwise fails | lines 156‑160 |
| Loose config (`maxReferenceAgeMs` > `maxReferenceAgeLimitMs`) – rejected during config validation | lines 316‑318 |

**Classification:** **real blocker** – each of those data problems results in a failure, not an allow.

---

**4. Is this still a “bandaid”, or does it close the actual disqualification mechanism at the pre‑order boundary?**

The rule is enforced **at the pre‑order gate**, before any broker, webhook, or state side‑effects occur, and it also records the reservation to prevent later entries from slipping past the cap.

- The gate is invoked in `OrderExecutor` before any routing (lines 337‑345).
- After a successful check the reservation map is updated (lines 122‑124).

Thus the mechanism is no longer a superficial check; it is the decisive qualification step.

**Classification:** **mitigated‑by‑code** – the disqualification is now enforced at the proper boundary.

---

**5. What residual risks remain, and are they code blockers or operational proof requirements?**

| Residual risk | Why it matters | Current status | Needed evidence |
|---------------|----------------|----------------|-----------------|
| **Distributed reservation state** – `openingVolumeReservations` lives in‑process memory. If multiple executor instances run on separate nodes, they do not share reservations, allowing a global exceed of the 5 % cap. | Potential for aggregate breach across processes. | Not addressed in the current code. | **Operational proof requirement** – need a shared store (e.g., Redis) or a single‑process deployment guarantee. |
| **Clock skew** – the “now” timestamp (`this.now()`) is used to filter future candles and detect staleness. If the host clock drifts, a stale candle could be accepted or a future candle could be mistakenly used. | Could bypass the stale‑reference check. | No explicit time‑synchronisation guard. | **Operational proof requirement** – ensure NTP or similar clock sync in production. |
| **Reservation cleanup** – `_pruneReservations` is called only for the current symbol/key (line 122). Old entries for other symbols may linger, potentially causing memory growth or stale caps. | Resource leak / stale caps. | Not a functional blocker but a maintenance concern. | **Operational proof requirement** – monitor memory and verify periodic pruning of all stale keys. |
| **Fallback behavior** – when `fallbackToMostRecentVolume` is disabled, a zero‑volume latest candle leads to an immediate block (lines 156‑160). If the flag is unintentionally set to `false`, legitimate trades could be blocked. | May cause unnecessary rejections. | Configurable; validated. | **Operational proof requirement** – audit config defaults and ensure the flag stays enabled unless a specific use‑case demands otherwise. |
| **Maximum reference‑age limit** – the limit (`maxReferenceAgeLimitMs = 300 000`) is hard‑coded (line 184). If a deployment changes `maxReferenceAgeMs` via environment variables beyond this limit, the config validator will reject it (lines 316‑318). | Prevents overly‑stale references. | Enforced by validation. | No blocker; already mitigated. |

**Overall assessment:** The core disqualification logic is solid and blocks the scenarios described in questions 1‑4. The remaining concerns are **operational** (distributed state, clock sync, cleanup) rather than code‑level blockers. Addressing them requires deployment‑time safeguards and monitoring rather than code changes.

[iterations: 8 | termination: answer_given | latency: 14469ms]
