# Exact candidate control-flow evidence
Source tree: bda5ffac7e06c47538a955852b27d9361d634bf9. Extracted with git show; omitted spans are not claimed shown.
core/StrategyOrchestrator.js sha256 895216099be64448a65e3863aa8ddb30bbfcfb529a53990e47ca16b0ac4cc00f
core/StrategyOrchestrator.js:2311-2331
2311:     let vpMarketState = null;
2312:     let skipTrendStrategies = false;  // Always false now — strategies handle their own filtering
2313:
2314:     // ─── Step 1: Run ALL strategies independently ───
2315:     const results = [];
2316:     const filteredResults = [];
2317:     const noSignalStrategies = [];
2318:     const thrownStrategies = [];
2319:     const contractConfidenceDropped = [];
2320:     // Quarantine malformed external entry configuration before routing strategies.
2321:     // Existing positions retain their own exit contracts and exit processing.
2322:     const entryStrategies = entrySizingInput.multipliers === null ? [] : this.strategies;
2323:     for (const strategy of entryStrategies) {
2324:       // DISABLED 2026-03-09: VP chop filter removed — strategies handle own filtering
2325:       // if (skipTrendStrategies && TREND_STRATEGIES.includes(strategy.name)) {
2326:       //   continue;
2327:       // }
2328:
2329:       try {
2330:         const result = strategy.evaluate(ctx);
2331:         if (isStrategyUnavailableRecord(result)) {
core/StrategyOrchestrator.js:2441-2466
2441:           }
2442:           if (fanoutValidation.entryFanout.length > 0) {
2443:             candidate.entryFanout = fanoutValidation.entryFanout;
2444:             addDecisionContributor(candidate, {
2445:               name: 'entry_fanout_geometry',
2446:               type: 'gate',
2447:               passed: true,
2448:               fanoutCount: fanoutValidation.entryFanout.length,
2449:               timeframe: signalTimeframe,
2450:             });
2451:           }
2452:           this._applyStrategyMtfConfluence(candidate, ctx);
2453:           results.push(candidate);
2454:         }
2455:       } catch (err) {
2456:         if (err.message && (
2457:           err.message.startsWith('[EXIT-CONTRACT]') ||
2458:           err.message.startsWith('[STRATEGY-SCOPE]') ||
2459:           err.message.startsWith('[TIMEFRAME-CONTRACT]')
2460:         )) {
2461:           throw err;
2462:         }
2463:         const absence = this._recordStrategyUnavailable({
2464:           strategyName: strategy.name,
2465:           source: 'strategy.evaluate',
2466:           reason: 'strategy_exception',
core/StrategyOrchestrator.js:2812-2844
2812:     // ─── Step 3: Filter by ranking score threshold ───
2813:     // Regime/VP multipliers historically affected eligibility before winner
2814:     // selection. Public/risk/exit confidence remains bounded by capping that
2815:     // boosted score to 1.0 at the orchestrator boundary.
2816:     const qualified = results.filter(r => r.rankingScore >= this.minStrategyConfidence);
2817:
2818:     if (qualified.length === 0) {
2819:       const reasons = results.length > 0
2820:         ? [`No strategy above ${(this.minStrategyConfidence * 100).toFixed(0)}% ranking threshold (best: ${results[0]?.strategyName} confidence ${([REDACTED](results[0]?.rankingScore, `${results[0]?.strategyName}.bestRankingScore`) * 100).toFixed(0)}%)`]
2821:         : (publicUnavailableStrategies.length > 0
2822:           ? [`No executable strategy signals; unavailable strategies: ${publicUnavailableStrategies.map(item => `${item.strategyName}:${item.reason}`).join(', ')}`]
2823:           : ['No signals detected']);
2824:       this.lastEvaluation = {
2825:         action: 'HOLD',
2826:         results: publicResults,
2827:         qualified: [],
2828:         unavailableStrategies: publicUnavailableStrategies,
2829:       };
2830:       return {
2831:         action: 'HOLD',
2832:         direction: 'hold',
2833:         confidence: 0,
2834:         winnerStrategy: null,
2835:         exitContract: null,
2836:         sizingMultiplier: null,
2837:         confluence: { count: 0, strategies: [] },
2838:         mtfConfluenceSnapshot,
2839:         allResults: publicResults,
2840:         filteredResults: publicFilteredResults,
2841:         unavailableStrategies: publicUnavailableStrategies,
2842:         reasons
2843:       };
2844:     }
core/StrategyOrchestrator.js:2880-2885
2880:
2881:     // ─── Step 6: Position sizing multiplier from confluence × regime ───
2882:     const cappedCount = Math.min(confluenceCount, 4);
2883:     const confluenceSizing = entrySizingInput.multipliers;
2884:     const rawSizingMultiplier = confluenceSizing[cappedCount];
2885:     const sizingMultiplier = rawSizingMultiplier * regimePositionMultiplier;
foundation/ConfigLoader.js sha256 87fe18610d0c60560a6dc57a680b2fb71a168143f5f05027fffc05a0cf8d09f7
foundation/ConfigLoader.js:2736-2761
2736: // Compile the external settings input before it can become an entry-sizing input.
2737: // Invalid input is named and kept out of entry routing; no customer value is guessed.
2738: function buildEntrySizingInput(config) {
2739:   const configured = readConfiguredPath(config, 'positionSizing.confluenceMultipliers');
2740:   const mapIsObject = isPlainObject(configured);
2741:   const issues = [];
2742:   for (const count of [1, 2, 3, 4]) {
2743:     const path = `positionSizing.confluenceMultipliers.${count}`;
2744:     const value = mapIsObject ? configured[count] : undefined;
2745:     const definition = EDITABLE_SETTINGS[path];
2746:     if (typeof value !== 'number' || !Number.isFinite(value)
2747:         || value <= definition.min || value > definition.max) {
2748:       issues.push({ path, reason: value === undefined ? 'missing_setting' : 'invalid_setting_value' });
2749:     }
2750:   }
2751:   return deepFreeze({ multipliers: issues.length === 0 ? configured : null, issues });
2752: }
2753:
2754: function getEntrySizingInput() {
2755:   if (!_cached) load({ silent: true });
2756:   return _cached.entrySizing;
2757: }
2758:
2759: function getSettingsView() {
2760:   if (!_cached) load({ silent: true });
2761:   return {
Mechanical enumeration of candidate evaluate results writes: declaration 2315; sole insertion results.push(candidate) 2453 inside entryStrategies loop; removals splice at 2565 and 2664, clearing length at 2520. Independent inspection remains required.
Host observations on exact staged production modules: --missing-key and --null-map both pass actual full orchestrator with zero strategy callbacks; actual TradingLoop plus ExitContractManager executes stop SELL to stub execution; strong raw TPO cannot fabricate entry; actual settings repair resumes same instance.
Host --fanout passes actual NoWick producer from seeded twin levels, actual orchestrator, loop ledger and OrderExecutor plans: saved 1.4 produces two 0.7 legs. Trend and broker boundary are synthetic. Existing focused TPO suites pass 21 tests after fixtures use current config owner and explicit timeframe.
Test/private directories are tool-ignored: these are host-attested observations, not a claim the reviewer executed them. fixtures/observe.cjs sha256 58a992a0f943448d0f35b9b2a956ed95afed51cb80d0613bbfbb5bfa44c719c2; fixtures/loop.cjs sha256 dd4ccf3633483e48df9d2e4f51e467c774419c0c56215374bdc42ef0b8543439
The old spec references are dated historical architecture, superseded by this packet; human-promoted canonical specs are not silently rewritten. TPO alternate override removal intentionally changes prior behavior; equivalence to that broken alternate producer is not the requirement. Actual OGZTPO strategy remains registered.
One long function identifier at source line 2820 is redacted by the existing scrubber; original source hash above is retained. No other source bytes were rewritten in these excerpts.
