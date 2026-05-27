[MERCURY-BRIDGE] Index contains 14675 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/sessions/session-2026-05-12-cc-c-6a-path-b-attempt-symbol-mislabel-discovered.md:133-148 (doc_section: Open Items for Next Session (Ranked)) sim=0.697
  2. run-empire-v2.js:1309-1395 (method: subscribeToMarketData) sim=0.438
  3. ogz-meta/sessions/session-2026-05-05-stream-a-candle-history-symbol-aware.md:52-67 (doc_section: 5. Mercury Adversarial Attacks (post-P0, both changes)) sim=0.733
  4. ogz-meta/sessions/session-2026-05-12-cc-c-6a-path-b-attempt-symbol-mislabel-discovered.md:32-58 (doc_section: 4. C1a Attempt — TradingLoop symCtx-Mandatory (REVERTED, but discovery banked)) sim=0.647
  5. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-2026-05-18T11-07-39-506Z.md:16-45 (doc_section: Prompt) sim=0.645
  6. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-retry1-2026-05-18T11-09-54-024Z.md:16-45 (doc_section: Prompt) sim=0.645
  7. ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v1-entry-take3-2026-05-18T15-25-48-512Z.md:16-45 (doc_section: Prompt) sim=0.645
  8. ogz-meta/ledger/fixes.jsonl:74-74 (jsonl_record: INCIDENT-2026-04-22-CONFIG-LOADER-CRASH) sim=0.654
[TRACE-MEMORY] Eviction: 1 stale + 0 over-cap, 326 remaining
[MERCURY-BRIDGE] Prior trace hint found (similarity: 0.75, 19 iters, used 0x)
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
TRAI LLM Client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
TRAI LLM warm-up complete (606ms)
TRAI LLM Client Ready! Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...
[MERCURY-BRIDGE] Trace inserted (quality=65.5)

═══ ANSWER ═══

**Findings**

| # | Question | Evidence (file:line) | Issue / Confirmation |
|---|----------|----------------------|----------------------|
| 1 | *Can this parse a string that should stay invalid and let malformed candles into CandleProcessor?* | `foundation/ohlc-normalize.js:38‑55` – `toTimestampMs` treats **any** positive numeric string as a timestamp (`Number(raw)` → `numeric > 0`). It only rejects non‑numeric strings (`isFinite(numeric)` is false). | **Yes – a string that is syntactically numeric but semantically meaningless (e.g. `"123.456"` seconds‑fraction, `"0.001"` seconds, `"1e3"` seconds) will be accepted and turned into a millisecond value, allowing a malformed candle to pass through. |
| 2 | *Can this change ISO‑string behavior, millisecond‑number behavior, or second‑number behavior in a way that moves the TSLA P0 anchor?* | `foundation/ohlc-normalize.js:38‑55` – ISO strings fall through to `Date.parse` (unchanged). Numbers < 1e12 are multiplied by 1000; numbers ≥ 1e12 are left as‑is. | **No – ISO handling and the seconds‑vs‑milliseconds heuristic are unchanged**; the patch does not alter the TSLA P0 anchor for those cases. |
| 3 | *Can this produce seconds‑vs‑milliseconds mistakes for realistic broker payloads, especially decimal seconds and integer millisecond strings?* | `foundation/ohlc-normalize.js:38‑55` – the heuristic (`raw < 1e12 ? raw*1000 : raw`) is applied to **both numbers and numeric strings**. | **Potentially – an integer millisecond string that is < 1e12 (e.g. `"1234567890"` ms) will be interpreted as seconds and multiplied by 1000, yielding a 1000× error. The current tests do not cover that case. |
| 4 | *Does exporting `toTimestampMs()` introduce a backwards‑compatibility hazard for existing `normalizeOhlc()` consumers?* | `foundation/ohlc-normalize.js:105` – the module now exports `{ normalizeOhlc, toTimestampMs }`. | **No – adding a second named export does not break existing `require('../foundation/ohlc-normalize')` callers that only destructure `normalizeOhlc`. |
| 5 | *Does `normalizeOhlc()` array passthrough plus `run‑empire‑v2.js` `normalizeOhlcForProcessor()` still handle Kraken canonical arrays correctly, or is there a gap where another consumer of `normalizeOhlc()` still sees raw timestamp strings?* | `foundation/ohlc-normalize.js:71‑103` – arrays are returned unchanged. <br> `run-empire-v2.js:410‑419` – `normalizeOhlcForProcessor` calls `ohlcTimestampMs` on the first two array elements, converting strings to ms then dividing by 1000. | **Correct for the built‑in processor** (timestamps become numbers again). However, any *other* consumer that receives the raw array from `normalizeOhlc` will still see the original timestamp strings, which could be a hidden gap. |
| 6 | *Did the new tests miss a root failure mode that would let the live bot appear healthy while silently dropping or misdating candles?* | Test file `test/ohlc-normalize.test.js:1‑38` only covers: <br>• numeric‑string → ms conversion <br>• ISO string conversion <br>• object normalisation with numeric‑string times. | **Missing coverage** for: <br>• Integer millisecond strings that are < 1e12 (mis‑interpreted as seconds). <br>• Non‑numeric but positive‑looking strings (e.g. `"123abc"` – correctly rejected, but not asserted). <br>• Zero or negative timestamps (should be rejected). <br>• Direct array passthrough with string timestamps (other consumers may see raw strings). |

---

### Recommended Root‑Cause Fixes

1. **Tighten numeric‑string validation** – reject strings that are not clearly seconds or milliseconds. A simple heuristic that also checks length / presence of a decimal point can avoid mis‑interpreting integer‑ms strings:

   ```js
   // foundation/ohlc-normalize.js (replace the numeric‑string block)
   if (typeof raw === 'string') {
       const numeric = Number(raw);
       if (isFinite(numeric) && numeric > 0) {
           // If the string contains a dot, treat it as seconds (fractional) or ms based on magnitude.
           // If it is an integer, decide by length: <=10 digits → seconds, >10 → ms.
           if (raw.includes('.')) {
               return numeric < 1e12 ? numeric * 1000 : numeric;
           }
           // integer string
           return raw.length <= 10 ? numeric * 1000 : numeric;
       }
       const n = Date.parse(raw);
       return isFinite(n) ? n : null;
   }
   ```

   *Fixes issue 1 & 3* by preventing accidental acceptance of ambiguous numeric strings.

2. **Add explicit guard for integer‑ms strings** – before the generic “< 1e12 → seconds” rule, check for a string length > 10 (typical ms epoch length) and treat it as ms:

   ```js
   if (typeof raw === 'string' && /^\d+$/.test(raw) && raw.length > 10) {
       return Number(raw); // already ms
   }
   ```

3. **Expose a tiny sanity‑check helper** (optional) for downstream code that expects only numbers, e.g.:

   ```js
   function isValidTimestamp(ms) {
       return Number.isFinite(ms) && ms > 0;
   }
   ```

   Consumers can call it after `normalizeOhlcForProcessor` to catch unexpected `null` values.

4. **Add a dedicated test** for the previously uncovered edge case:

   ```js
   test('rejects integer millisecond strings that look like seconds', () => {
       // 1234567890 ms (≈ Jan 2009) is <1e12 but should be treated as seconds only if it truly is seconds.
       // Our new logic will interpret it as seconds → 1234567890000 ms, which is wrong.
       // Expect the function to treat it as ms because the string length is 10 digits.
       expect(toTimestampMs('1234567890')).toBe(1234567890);
   });
   ```

   This ensures the bug is caught in CI.

5. **Document the array‑passthrough contract** – add a comment in `normalizeOhlc` that callers receiving an array must still run `ohlcTimestampMs` (or use `normalizeOhlcForProcessor`) if they need numeric timestamps. This mitigates the hidden gap for other consumers.

---

### Residual Risks (if no fix is applied)

* **Mis‑dated candles** from brokers that emit integer‑ms strings shorter than 10 digits (rare but possible) could be interpreted as seconds, causing a 1000× time shift that would silently affect P0 calculations.
* **Malformed numeric strings** like `"0.001"` (fractional seconds) will be accepted and turned into a millisecond value (`1` ms), potentially creating a candle with a timestamp that is far in the past or future relative to other data.
* **Consumers that bypass `normalizeOhlcForProcessor`** (e.g., custom analytics modules) will still see raw timestamp strings when the input is already a canonical array, which could lead to downstream `Date` parsing inconsistencies.

Implementing the validation tweak and adding the missing test will eliminate the most critical failure modes while preserving the intended behaviour for ISO strings, proper second‑ and millisecond‑numeric inputs.

[iterations: 5 | termination: answer_given | latency: 15496ms]
