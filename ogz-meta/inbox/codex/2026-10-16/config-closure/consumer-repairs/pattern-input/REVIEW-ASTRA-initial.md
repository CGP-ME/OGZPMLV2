# Astra adversarial review: canonical pattern inputs

Verdict: **BLOCK pending two consumer corrections.** The producer repairs are warranted, but they make previously unavailable feature paths reachable while leaving those readers' trend vocabulary incompatible. Correct the readers and verify the reachable paths; no new guard, hold, or runtime gate is requested.

Exact candidate tree: `da2ed8704942cdd92991319058b9859a8f3e76bf`, compared with base `86e45d6ff451623b5f6591e1048f0ba48c4b9f87`. All citations below refer to that candidate. Read-only source review; no tests, trading imports, runtime actions, or production edits performed.

## Blocking findings

1. **P1: Non-optimized pattern extraction now accepts canonical inputs but labels directional trends neutral.** `IndicatorEngine.js:814-833` produces `up`/`down`; `TradingLoop.js:1945-1954` forwards that trend and now forwards finite flat MACD/signal. With editable `patternRecognition.useOptimizedIndicators=false` (`ConfigLoader.js:2684`), `EnhancedPatternRecognition.js:269-279` now passes its finite-input checks, then line 287 recognizes only `uptrend`/`downtrend`, so both canonical directions encode as zero. Before this change, the nested MACD read from the numeric snapshot produced null and this branch returned unavailable. The candidate repairs the optimized branch at lines 231-232 but not its sibling. Reproduce with valid candles, RSI 50, MACD 1, signal 0, trend `up`, and `useOptimizedIndicators:false`: the trend feature is 0 instead of 1; `down` likewise needs -1. These are supported producer values and an editable configuration, not speculative malformed inputs.

2. **P1: Preserving BB width activates a downstream TRAI pattern-memory lookup with neutralized trend.** The canonical snapshot provides finite width (`IndicatorEngine.js:371`), and the candidate removes the assignment that previously replaced it with null. `_runTRAI` forwards the preserved indicators and `indicators.trend` (`TradingLoop.js:2123-2125`). `TRAIDecisionModule.js:454-478` can therefore now produce a feature vector instead of returning null, but its line 479 recognizes only `uptrend`/`downtrend`; canonical `up`/`down` become zero. `calculateConfidence` sends that vector to `UnifiedPatternMemory.getConfidence` at lines 497-502. Thus a repaired width producer exposes incorrect downstream feature semantics. The sibling `trai_core.js:774-797` uses the same vocabulary restriction at line 784; its feature extraction also feeds trade-result fallback at lines 809-814. Normalize canonical trend spellings in these relevant readers and cover lookup/record consistency. Do not restore the invalid width overwrite to suppress the path.

## Mercury allegations and alias census

The exact diff does not add Mercury's cited signature fallback, zero-price division, quantization behavior, autopsy throw/catch, or gate-broadcast catch. Those statements concern inherited code and do not prove regressions introduced by this candidate. This review does not certify or dismiss their broader safety; it identifies separate concrete reachability failures above.

The alias-removal allegation itself is resolved: `IndicatorEngine.js:357-387` emits flat canonical fields, no nested `bb`, `ema12`, `ema26`, or `ema21`. The only executable production EMA alias reads found are `TradeIntelligenceEngine.js:234-235,1020-1021`, which prefer canonical ema9/ema20. During warmup the old ema12 alias merely repeated nullish ema9, and old ema26 originated from absent ema21. Removal does not discard a valid alternate EMA producer. The retained volatility/trend aliases remain consumed.

The earlier alias trace's statement that no production reader consumes width is stale for this exact candidate: `OrderExecutor.js:324-332`, `TRAIDecisionModule.js:468-473`, and `trai_core.js:779` read it. Preserving width is correct; its newly usable downstream feature path motivates finding 2.

## Verification reviewed and limits

Read the shared `fixtures/verify.cjs` and `verification.log`. The logged focused run passed, but it combines this candidate's feature checks with separate exit-policy tests; those unrelated checks do not qualify this tree. The feature fixture verifies optimized `up`, numeric-zero MACD, percentage BB normalization, and extracted `_gatherData` forwarding, but does not exercise the non-optimized trend reader or the downstream TRAI readers above.

The pinned FeatureExtractor and EnhancedPatternRecognition sources match candidate blobs `171582007f383da63389b773ad78bb6b8e9e534e` and `bcbb466488ec9ac9ff30ac22f51f2bed674e4559`. The pinned TradingLoop blob is `0ee6dc5ba8ba7011aec0b2bddd73c590570aee6e`; candidate is `7f11271e2cbfb0ba0cc7e4a490bfc3539337e0cd`. Their differences are previously landed configuration receipt additions outside `_gatherData`; the AST-extracted method exercised by this fixture matches the reviewed method, but the entire fixture file must not be described as exact-candidate identical.

Percentage normalization is supported by `IndicatorEngine.js:536-539`, which emits percentage-form percentB; retaining nested fractional values is consistent with the existing reader contract. Numeric MACD zero remains valid. The direct `.toLowerCase()` in the optimized branch is preceded by the existing string/nonempty check at `EnhancedPatternRecognition.js:214-223`, so it does not introduce an unguarded type path.

No full replay, learned-bank migration, live process adoption, or Stop1 completion is certified. The two blocked paths require focused verification after correction; this review does not request unrelated validation architecture or production activation.
