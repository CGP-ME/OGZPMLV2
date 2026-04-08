# MarketRegime Refactor: Strategy to Orchestrator Pre-Filter

## DATE: 2026-03-20
## AUTHOR: Claude Opus (Architect) for Trey / OGZPrime
## EXECUTOR: Claude Code (Sonnet) on VPS

---

## THE PROBLEM

MarketRegime is registered as a strategy in StrategyOrchestrator._registerBuiltinStrategies().
This is architecturally wrong:

1. MarketRegime is NOT a trading strategy. It does not detect setups.
2. It competes with real strategies for the winner slot.
3. If it wins, it creates an exit contract for a non-strategy.
4. It fires on regime + trend agreement, which is a FILTER, not a SIGNAL.
5. Per Trey Rule #8: MarketRegime is NOT a strategy. It is an orchestrator pre-filter that adjusts confidence multipliers.

## THE FIX

Remove MarketRegime from the strategies array. Add _applyRegimeFilter() as a
post-Step-1 method in evaluate() that adjusts confidence multipliers and
position sizing based on what kind of market we are in.

## WHAT CHANGES

### File: core/StrategyOrchestrator.js

#### 1. Remove MarketRegime strategy registration

Delete the entire block starting with:
```
if (shouldRegister('MarketRegime')) this.strategies.push({
```
Delete everything through the closing });

#### 2. Add regime affinity config to constructor

After the this.confluenceSizing block, add:

```javascript
    // REGIME AFFINITIES: How each strategy performs in each regime
    // Values are confidence multipliers (1.0 = no change)
    this.regimeAffinities = config.regimeAffinities || {
      trending: {
        EMASMACrossover: 1.20,
        MADynamicSR:     1.15,
        RSI:             0.80,
        LiquiditySweep:  1.00,
      },
      ranging: {
        EMASMACrossover: 0.75,
        MADynamicSR:     1.10,
        RSI:             1.25,
        LiquiditySweep:  1.00,
      },
      volatile: {
        EMASMACrossover: 0.70,
        MADynamicSR:     0.80,
        RSI:             0.85,
        LiquiditySweep:  1.20,
        _positionSizeMultiplier: 0.60,
      },
      dead: {
        EMASMACrossover: 0.60,
        MADynamicSR:     0.70,
        RSI:             0.70,
        LiquiditySweep:  0.50,
        _positionSizeMultiplier: 0.50,
      },
      unknown: {},
    };
```

#### 3. Add _classifyRegime() method

```javascript
  _classifyRegime(regime) {
    if (!regime || !regime.currentRegime) return 'unknown';
    const name = regime.currentRegime.toLowerCase();
    const confidence = regime.confidence || 0;
    if (confidence < 0.25) return 'unknown';
    if (name.includes('bull') || name.includes('uptrend') ||
        name.includes('bear') || name.includes('downtrend') ||
        name.includes('trending') || name.includes('momentum')) return 'trending';
    if (name.includes('rang') || name.includes('sideways') ||
        name.includes('consolidat') || name.includes('accumulation')) return 'ranging';
    if (name.includes('volat') || name.includes('chaos') ||
        name.includes('distribution') || name.includes('crash')) return 'volatile';
    if (name.includes('dead') || name.includes('quiet') ||
        name.includes('low_vol') || name.includes('flat')) return 'dead';
    return 'unknown';
  }
```

#### 4. Add _applyRegimeFilter() method

```javascript
  _applyRegimeFilter(results, regime) {
    const regimeType = this._classifyRegime(regime);
    const affinities = this.regimeAffinities[regimeType] || {};
    const positionSizeMultiplier = affinities._positionSizeMultiplier || 1.0;

    if (regimeType === 'unknown' || Object.keys(affinities).length === 0) {
      return { filteredResults: results, positionSizeMultiplier: 1.0, regimeType };
    }

    const filtered = results.map(function(r) {
      const multiplier = affinities[r.strategyName] || 1.0;
      if (multiplier === 1.0) return r;
      return Object.assign({}, r, {
        confidence: r.confidence * multiplier,
        reason: r.reason + ' [regime:' + regimeType + ' ' + multiplier.toFixed(2) + 'x]',
      });
    });

    if (this.evalCount % 100 === 0 && regimeType !== 'unknown') {
      console.log('[REGIME-FILTER] ' + regimeType + ' (conf=' + (regime.confidence || 0).toFixed(2) + ') | posSizeMult=' + positionSizeMultiplier + 'x');
    }

    return { filteredResults: filtered, positionSizeMultiplier: positionSizeMultiplier, regimeType: regimeType };
  }
```

#### 5. Wire into evaluate() method

Change `const results = [];` to `let results = [];`

BEFORE the Step 2 sort line, INSERT:

```javascript
    // Step 1.5: Apply regime pre-filter (Trey Rule #8)
    const regimeFilter = this._applyRegimeFilter(results, regime);
    results = regimeFilter.filteredResults;
    const regimePositionMultiplier = regimeFilter.positionSizeMultiplier;
```

#### 6. Apply regime position multiplier to sizing

Change:
```javascript
    const sizingMultiplier = this.confluenceSizing[cappedCount] || this.confluenceSizing[4] || 2.5;
```
To:
```javascript
    const rawSizingMultiplier = this.confluenceSizing[cappedCount] || this.confluenceSizing[4] || 2.5;
    const sizingMultiplier = rawSizingMultiplier * regimePositionMultiplier;
```

#### 7. Add regime info to output

In the output object add:
```javascript
      regime: {
        type: regimeFilter.regimeType,
        positionMultiplier: regimePositionMultiplier,
      },
```

#### 8. Remove MarketRegime from _applyPipelineToggles toggleMap

Delete:
```javascript
      'MarketRegime': pipeline.enableMarketRegime,
```

#### 9. TradingConfig pipeline

In core/TradingConfig.js, change:
```javascript
    enableMarketRegime: envBool('ENABLE_MARKET_REGIME', true),
```
To:
```javascript
    enableMarketRegime: envBool('ENABLE_MARKET_REGIME', false),  // DEPRECATED: now orchestrator pre-filter
```

---

## WHAT NOT TO CHANGE

- Do NOT remove MarketRegimeDetector.js (still computes regime)
- Do NOT remove the regime parameter from evaluate()
- Do NOT change how TradingLoop calls the orchestrator
- Do NOT touch any other strategy registrations
- Do NOT modify exit contract logic

## TESTING

1. Run RSI+EMA backtest: P&L should be similar or better
2. Verify regime logging appears every 100 candles
3. Verify diagnostic funnel no longer shows MarketRegime
4. Verify no crash with ENABLE_MARKET_REGIME=false
