# Exact candidate producer and result evidence

Tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c; core/OrderExecutor.js from git index. Existing validation is before share range; no new guard is requested.

```js
657:   _orderQuantityFromSizeUsd(sizeUsd, price, scope = null, options = {}) {
658:     if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
659:       throw new Error(`[ORDER-PLAN] invalid sizeUsd ${sizeUsd}`);
660:     }
661:     if (!Number.isFinite(price) || price <= 0) {
662:       throw new Error(`[ORDER-PLAN] invalid price ${price}`);
663:     }
664:
665:     const rawQuantity = sizeUsd / price;
666:     return this._normalizeOrderQuantity(rawQuantity, scope, options);
667:   }
```
```js
2067:   _resolveAbsolutePositionCap() {
2068:     const absoluteCap = ConfigLoader.get('entryLogic.sizing.absoluteCapPercent');
2069:     if (!Number.isFinite(absoluteCap) || absoluteCap <= 0) {
2070:       throw new Error(`[ABSOLUTE_POSITION_CAP] entryLogic.sizing.absoluteCapPercent must be a finite positive decimal; got ${absoluteCap}`);
2071:     }
2072:     return absoluteCap;
2073:   }
```
```js
2426:
2427:     const entryPlan = {
2428:       traceId: decision.traceId || null,
2429:       signalId: decision.signalId || decision.decisionId || null,
2430:       decisionId: decision.decisionId || null,
2431:       action: decision.action,
2432:       side: this._entrySide(decision.action),
2433:       direction: decision.action === 'BUY' ? 'long' : 'short',
2434:       positionEffect: positionEffectFromAction(decision.action),
2435:       symbol,
2436:       brokerId: scope.brokerId,
2437:       marketDataBrokerId: scope.brokerId,
2438:       accountId: scope.accountId,
2439:       accountIdSource: scope.accountIdSource,
2440:       assetClass: scope.assetClass,
2441:       executionMode: scope.executionMode,
2442:       timeframe: scope.timeframe,
2443:       price,
2444:       accountBalance: currentBalance,
2445:       currentEquity,
2446:       baseSizeUsd: positionSize,
2447:       requestedSizeUsd,
2448:       sizeUsd: plannedSizeUsd,
2449:       absoluteCapPercent: capPercent,
2450:       absoluteCapSizeUsd,
2451:       cappedByAbsoluteCap,
2452:       stockShareRange: shareRange?.bounds || null,
2453:       stockShareRangeBlockReason: shareRange?.blockReason || null,
2454:       confidence: decision.confidence,
2455:       tradeConfidence,
2456:       confidenceMultiplier,
2457:       entryVolatility,
2458:       sizingMultiplier,
2459:       entryGroupType: orchResult.entryGroupType || decision.entryGroupType || null,
2460:       entryGroupId: orchResult.entryGroupId || decision.entryGroupId || null,
2461:       fanoutIndex: Number.isInteger(orchResult.fanoutIndex) ? orchResult.fanoutIndex : null,
2462:       fanoutCount: Number.isInteger(orchResult.fanoutCount) ? orchResult.fanoutCount : null,
2463:       entryTriggerClass: orchResult.entryTriggerClass || decision.entryTriggerClass || null,
2464:       orderQuantity,
2465:       quantityUnit,
2466:       entryStrategy,
2467:       exitContract,
2468:       frozenExitPolicy
2469:     };
2470:     return entryPlan;
2471:   }
```
```js
3133:     }
3134:     // ABSOLUTE_POSITION_CAP lives at entryLogic.sizing.absoluteCapPercent and
3135:     // is enforced again inside _buildEntryPlan after confluence sizing.
3136:     const absoluteCap = isEntryAction ? this._resolveAbsolutePositionCap() : null;
3137:     if (isEntryAction && Number.isFinite(absoluteCap) && absoluteCap > 0 && basePositionPercent > absoluteCap) {
3138:       console.log(`Position absolute-capped: ${(basePositionPercent * 100).toFixed(2)}% -> ${(absoluteCap * 100).toFixed(2)}% (ABSOLUTE_POSITION_CAP)`);
3139:       basePositionPercent = absoluteCap;
3140:     }
```
