# Astra final adversarial review: canonical pattern inputs

Verdict: **GO for corrected candidate `f6829d9753deb2c375cce680490d9f7a409ca680` against `86e45d6ff451623b5f6591e1048f0ba48c4b9f87`.** Both concrete blockers in `REVIEW-ASTRA-initial.md` are resolved. No remaining concrete regression identified in this five-file source change. Final Mercury review remains a separate pending requirement; this document does not claim a clean final Mercury result, full Stop1 completion, or runtime activation.

## Resolution and exact-source evidence

The canonical producer emits trend `up`/`down` (`core/indicators/IndicatorEngine.js:814-833`), percent-form BB position (`:536-539`), and flat MACD/signal/BB width (`:371-374`). The changed readers now agree with those producer values:

- `core/EnhancedPatternRecognition.js:231-232,287` maps canonical and legacy directional names to +1/-1 in both optimized and provided-input branches. The existing validation at `:269-279` establishes the string input before the provided branch's direct lowercasing. No new guard was added.
- `core/TRAIDecisionModule.js:479` and `core/trai_core.js:784` now map `up`/`down` and retained `uptrend`/`downtrend` consistently. Preserved BB width can activate these readers without silently neutralizing the canonical trend. The former feeds the memory lookup at `TRAIDecisionModule.js:497-502`; the latter supports lookup and trade-result fallback at `trai_core.js:788-814`.
- `core/FeatureExtractor.js:98-99,197-198,268-279` normalizes flat percentage BB position, accepts canonical directional names, and preserves numeric-zero MACD. Nested fractional BB input remains supported.
- `core/TradingLoop.js:1064-1065,1945-1954,1967` retains the active volatility/trend aliases, preserves original flat width, and forwards flat MACD values. Removed EMA aliases had no independent value: the canonical producer has ema9/ema20, while the only production fallback readers prefer those fields (`TradeIntelligenceEngine.js:234-235,1020-1021`). The old ema12 repeated ema9; ema26 referenced absent ema21. Removal of the always-undefined nested Bollinger alias does not remove a valid producer.

All line citations refer to the final candidate tree. The delta from the blocked candidate is precisely the three trend-reader corrections; no execution gate, new throw, state mutation mechanism, or unrelated recovery policy was introduced.

## Verification and source qualification

Read the updated `fixtures/verify.cjs` and `verification.log`; no tests or trading imports were run by this reviewer. The saved isolated run reports PASS and ends with `activatedFeatureConsumers:true`, `optimizedAndProvidedBranches:true`, and `traiDecisionAndCore:true`.

The fixture executes both actual EPR extraction branches using `up`, `down`, `sideways`, `uptrend`, and `downtrend`, with flat zero MACD/signal. It AST-extracts the actual TRAI decision/core feature methods and checks those same trend cases while preserving width 0.42. The existing checks exercise BB percentage normalization, zero MACD, and the actual extracted `_gatherData` method. Dependencies are controlled fixtures; constructors, live model services, and learned banks are not exercised. Separate exit assertions in this shared probe do not certify any exit change under this review.

Verified candidate blob identities:

| File | Candidate blob |
| --- | --- |
| `core/EnhancedPatternRecognition.js` | `0acfd7f9a0ce86b79952f8dadd9ecc29832e1549` |
| `core/FeatureExtractor.js` | `171582007f383da63389b773ad78bb6b8e9e534e` |
| `core/TRAIDecisionModule.js` | `d7221f6ad794af80b0e94b664df51c33a02e58a6` |
| `core/TradingLoop.js` | `7f11271e2cbfb0ba0cc7e4a490bfc3539337e0cd` |
| `core/trai_core.js` | `9f423f9d84c24ca08b7677d846d39b19b9c13e99` |

The three newly corrected fixture sources match their final candidate blobs exactly. FeatureExtractor matched during the initial review and is unchanged in this revision. The shared TradingLoop fixture still differs from the candidate only in earlier configuration-receipt additions outside `_gatherData`; its tested method matches. The generic log label mentioning HEAD 101399e1 is therefore not an exact final-tree identity receipt; the blob checks above qualify the exercised source.

## Mercury and scope limits

The earlier Mercury allegations about signature fallback, division by zero, autopsy catches, and gate-broadcast catches refer to unchanged code, as established by the exact base/candidate diff. They do not demonstrate introduced defects here. Their broader validity was not certified or dismissed. The initial downstream-width census was incomplete; active width readers were independently found and the resulting trend mismatch is now repaired.

This GO covers the reviewed producer/consumer change and focused evidence. It does not establish full replay/model equivalence, learned-bank compatibility or migration, profitability, live process adoption, or complete configuration closure. No PM2 action, production import, runtime mutation, or code edit was performed by this reviewer.

## Final Mercury adjudication

Read `final-delivery-review-answer.txt` and re-opened the cited producer/consumer code from exact tree `f6829d9753deb2c375cce680490d9f7a409ca680`. **GO remains unchanged under the requested independent adjudication.** Mercury returned `found_break`; it is not a clean Mercury verdict, and the earlier statement that final Mercury was pending is now superseded by this recorded result and resolution.

1. **Claim: unchecked lowercasing can receive null/undefined. Rejected by existing control flow.** In the optimized branch, `EnhancedPatternRecognition.js:214` adds an unavailable field whenever `calculatedTrend` is not a nonempty primitive string; `:218-223` returns before the lowercasing at `:231`. `calculatedTrend` is a local constant. In the provided branch, the same string/nonempty test occurs at `:273`, and `:275-279` returns before the expression at `:287`. Neither path can reach these calls with the null/undefined inputs alleged by Mercury. No additional guard or optional-chain default is needed.

2. **Claim: removed aliases eliminate fields expected downstream. Rejected by the actual producer and reads.** `IndicatorEngine.getSnapshot` already supplies canonical ema9, ema20, and bbWidth (`:359-360,371`). The change removes assignments, not these producer properties. In particular, removing `bbWidth = indicators.bb?.bandwidth ?? null` preserves the real width instead of replacing it with null. `TradeIntelligenceEngine.js:234-235,1020-1021` uses canonical ema9/ema20 first. The removed ema12 merely duplicated ema9; when canonical ema9 is null, the former fallback was also null. The removed ema26 was assigned from absent ema21, so its former value was null; null versus undefined cannot satisfy the existing truthy-EMA checks at `:238,1026`. The removed bollingerBands alias came from absent nested bb and was already undefined. No genuine alternate indicator producer is lost, and restoring those aliases would reintroduce a false EMA period label and destructive BB overwrite.

The final answer also labels FeatureExtractor, TRAIDecisionModule, and trai_core unchanged, while the exact base/candidate diff includes all five source files. The reviewed identity is established by git and the blob table above, not those labels. The previously identified real downstream trend failures were fixed and exercised; neither final Mercury allegation establishes another introduced failure. No production edits or executions were performed for this adjudication.
