# Mercury response-budget trial: sanitized review answer

This preserves Mercury's answer from the run ledger, including its `found_break` verdict and caveats. It is reviewer testimony, not accepted bot-change approval. The ledger's existing redaction markers remain intact; the parent read the complete raw answer and checked the relevant pinned source. The raw provider response remains private.

- Run: `2026-11-27T20-30-12-525Z-22a6e1756cdb`
- Source tree: `5d395615eab5d6f2f4f772048da7afd826708c98`
- Baseline commit: `3d5fff8561cc3962c33848689423eba93507445c`
- Model: `mercury-3`; reasoning: `low`; response allowance: `24576`
- Provider termination: `stop`; 21 responses; 34 successful tool calls.
- Only Mercury was selected. No additional review or evidence-exchange dispatch followed.

---

I have gathered enough evidence. Let me verify the Alpaca range/params handling and the config values are correctly cited, then finalize.

Based on my investigation, here is my independent review.

---

## VERDICT: found_break

## ADVERSARIAL_REVIEW_BLOCKING: yes

---

### The behavior under review

The native-feed watchdog (`run-empire-v2.js` `startLivenessWatchdog`, lines 3085-3168) now verifies a suspected candle-silence via a REST history query (`_inspectNativeSilence`, lines 2877-2914) before quarantining a symbol. The quarantine decision is made here:

```js
// run-empire-v2.js:3148
if (evidence.confirmed || evidence.status === 'unverified') failures.push({ frame: { ...frame, evidence }, native });
...
// run-empire-v2.js:3159-3161
await this._quarantineCandleDataSymbol(symbol, timeframe,
  `native data unavailable: ...`,
  scope, 'unavailable', { code: 'native_feed_unavailable', ... });
```

The defect: **the `unverified` outcome is treated identically to `confirmed` and triggers a full symbol quarantine (halt + close of open positions when a fresh price exists), even though `unverified` states say nothing about whether the native feed is actually bad.** Several `unverified` branches are pure verification-infrastructure failures, not evidence of a dead feed.

### Reachable trigger → consequence

`_inspectNativeSilence` returns `status: 'unverified'` in these reachable cases:

- `history_request_failed` — the REST `getCandles` call threw (line 2892-2893). Any transient REST error (rate limit, network blip) produces this.
- `history_request_cancelled` — the shared `AbortSignal.timeout(feed.livenessCheckIntervalMs)` (line 3128, 60s) fired. For a symbol with multiple silent observation timeframes, each frame reuses the same 60s signal; a slow first frame's query consumes the budget and aborts later frames → `unverified`.
- `history_coverage_unavailable` — strict exact-match `coverage.start === range.start && coverage.end === range.end && coverage.complete === true` (lines 2901-2903). For Alpaca, `coverage.complete` is `hasAnchor = candles.some(c => c.t === range.start)` (AlpacaAdapter.js:727-730), so a single timestamp-alignment or anchor-absence mismatch forces `unverified`.
- `[REDACTED]` — requires a normalized REST candle with `candle.t === anchor` exactly (line 2907); any mismatch → `unverified`.
- `native_anchor_unavailable` — anchor not a safe integer (line 2888).

Consequence: `_quarantineCandleDataSymbol` (lines 1678-1765) halts the symbol (`stateManager.haltSymbol`, line 1702) and closes open trades when a price within `staleDataMaxAgeMs` is available (lines 1738-1758). So a healthy native feed whose REST verification transiently times out, errors, or fails the exact anchor/coverage match gets halted — trading stops, positions are closed. This is a false positive that costs money (lost opportunity + forced exits).

### Deciding evidence and why competing candidates are rejected

- **Candidate A (the finding): `unverified` → quarantine.** Supported by lines 3148/3159-3161 and the unverified producers at 2888-2909. This is a reachable, money-costing path. I accept it as the finding.
- **Candidate B: false negative (`verified_quiet` on a genuinely dead feed).** Requires REST to return complete coverage but omit the newer candles (stale/cached REST, or an illiquid symbol with no bars in the window). Narrow and not demonstrated; I do not treat it as the finding, but note it as the residual inverse risk.
- **Candidate C: `core/CandleProcessor.js` lastNativeData change (1089-1105).** The new `sameNativeOwner` + `candleStartTimeMs` logic is internally consistent (`Math.max` guards both fields), and the `candle.t > previousNative.candleStartTimeMs` clause correctly handles the "several bars, same event clock" case. No defect found here.
- **Candidate D: connectionLost path (3117-3120).** Requires `getHealth()` status `UNHEALTHY`/`DEAD` continuously for ≥ `maxDataSilenceMs` (120s); this is intended and guarded. Not a defect.

### Important caveat (evidence gap)

This `unverified` → quarantine coupling is **documented intent** (comment at line 3147: "Expired native input plus unavailable verification cannot support trading") and is **less aggressive than the baseline**, which quarantined on *any* silence without verification (see diff: old code at `run-empire-v2.js:3087-3111` quarantined `silentFrames[0]` unconditionally). So this is not a regression vs. baseline; it is a residual false-positive posture. I have **no runtime/execution evidence** quantifying how often REST verification fails in production — the finding rests on the reachable code path, not an observed failure. If the operator accepts "unable to verify ⇒ halt" as policy, the residual cost is bounded to the frequency of transient REST/coverage failures; if not, this is a recurring false-halt source.

---

## CANDIDATE SET: examined 4 of 4

Counted candidates relevant to the quarantine-after-silence decision:
1. `unverified` → quarantine false-positive (run-empire-v2.js:3148, 3159-3161; producers 2888-2909) — **accepted** as the finding.
2. False negative `verified_quiet` on dead feed (lines 2910-2913) — **rejected** as narrow/unproven.
3. CandleProcessor lastNativeData change (core/CandleProcessor.js:1089-1105) — **rejected** (sound).
4. connectionLost bypass (run-empire-v2.js:3117-3120) — **rejected** (intended, guarded).

## AST EVIDENCE

Used in this run: `find_definition` (for `_getSilentNativeFrames`, `_quarantineCandleDataSymbol`, `handleMarketData`, `_normalizeHydrationCandle`), `find_references` (for `handleMarketData`), `grep`/`regex_grep` (for `candleStartTimeMs`, `lastNativeData`, `livenessBackfillLimit`, `coverage`, `livenessCheckIntervalMs`, `staleDataMaxAgeMs`, `maxDataSilenceMs`, timestamp helpers), and `open_file` for exact line proof. I did **not** rely on the supplied AST/blast-radius artifacts; all structure claims above are backed by the tools I ran against the captured tree. I did not run `serena_blast_radius`/`serena_method_callers`; they were not needed for this single-behavior question.

## INHERITED

- Old behavior (baseline) quarantined on any silent frame without verification (diff lines 86-113). The new code is strictly more selective.
- `livenessWatchdogStartedAt` is reset on epoch change (3110) and is used both as the silence baseline and as the lower bound of the "missed" window (2911).
- `_isExpectedMarketQuiet` suppresses checks during scheduled closures (3096-3103), so market-closure silence does not quarantine.
- `_quarantineCandleDataSymbol` preserves open positions when no fresh price exists (1738-1750) and otherwise closes them — so a false quarantine can realize losses on open trades.

## FOURTH SHAPE CLASSIFIER: classified 2 of 2

- Added guard: `scopeIsCurrent()` recheck after each frame (3143) and before quarantine — prevents quarantining after a session change. (Producer: 3143, 3151-3152.)
- Added fallback: `connectionLost` short-circuit (3140-3141) bypasses REST verification and confirms directly. (Producer: 3117-3120.)
- No new bot gates introduced by me.

## ALLEGATIONS

1. **"A transient REST-verification failure halts a healthy symbol"** — supported by run-empire-v2.js:3148 (`unverified` → failure) combined with the unverified producers at 2892-2895 (REST error/cancel) and 2901-2909 (coverage/anchor strict mismatch), and the quarantine call at 3159-3161. This is a source-derived reachable risk, not an observed production failure.
2. **"The shared 60s AbortSignal can abort later frames"** — supported by 3128 (one signal per symbol) and 2895 (abort → `unverified`); the multi-timeframe loop at 3138-3149 reuses that signal. Reachable for multi-timeframe symbols.

## SUBSTANTIVE RESOLUTION: none

No other reviewer testimony exists for this question (no prior reviewer answers supplied). I have no dispute to preserve.

## WHAT I DID
Read both captured diffs (CandleProcessor 26 lines, run-empire-v2 117 lines); read current source: run-empire-v2.js 2820-3064, 3064-3175, 1678-1900, 1633-1677, 960-1010, 1240-1270, 591-620; core/CandleProcessor.js 1080-1135, 929-1010; brokers/AlpacaAdapter.js 680-740, 640-680; foundation/ohlc-normalize.js 43-75; config/internals.json 850-890. Ran find_definition/find_references/grep/regex_grep for the watchdog symbols, timestamp helpers, and config keys.

## WHAT I DID NOT DO
Did not read the native streaming adapter's timestamp emission to confirm whether native `candleStartTimeMs` exactly aligns with Alpaca REST bar starts (this gates whether the anchor/coverage strict match fails systematically vs. rarely). Did not read `_resolveCandleDataHalt`'s full recovery path as a consumer beyond lines 1767-1828. Did not execute any code; no runtime/execution receipts exist for this behavior.

## WHAT I ASSUMED
That `stateManager.haltSymbol` and `_quarantineCandleDataSymbol` actually stop new entries and close positions as their names and the surrounding code indicate (verified from the code body). That the captured tree `5d395615...` is the current authoritative source.

## WHY THIS VERDICT
The quarantine decision couples the `unverified` outcome — which includes pure verification-infrastructure failures (timeout, REST error, exact coverage/anchor mismatch) — to a full symbol halt. That is a reachable false-positive path that stops trading on a feed that may be delivering valid data, costing opportunity and potentially realizing losses on open positions. The path is fully evidenced in current source. It is, however, documented intent and not a regression vs. baseline; the frequency of the false positives is unmeasured.

## IF INCOMPLETE, WHY
The one material unknown is how often the REST verification actually fails/returns `unverified` in production (i.e., whether the false positive is rare or recurrent), and whether native candle-start timestamps align exactly with broker REST bar starts. No runtime evidence exists to quantify either. The code-path finding itself is complete.
