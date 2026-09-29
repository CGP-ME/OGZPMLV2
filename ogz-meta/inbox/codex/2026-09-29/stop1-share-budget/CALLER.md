# Host-attested exact staged source

Candidate tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c; baseline aa91945575b22b076273d2c829a35c7a6b5cc9ef.
core/OrderExecutor.js SHA256 d67fb404763523906f15e54b38a74b34ba459c7e92d9ba7cf86f65af0c8637d6
Read using git show :core/OrderExecutor.js; not mixed working tree.

```js
2384:   _buildEntryPlan({ decision, symbol, price, positionSize, currentBalance, currentEquity, tradeConfidence, confidenceMultiplier, orchResult, entryVolatility, absoluteCapPercent, forceWholeShares = false }) {
2385:     if (!this._isEntryAction(decision.action)) return null;
2386:
2387:     const entryStrategy = orchResult.winnerStrategy;
2388:     const sizingMultiplier = orchResult.sizingMultiplier;
2389:     const exitContract = orchResult.exitContract;
2390:     assertExplicitExitOwnership(exitContract, 'OrderExecutor._buildEntryPlan');
2391:     const frozenExitPolicy = PolicyBuilder.buildForTrade({
2392:       strategyName: entryStrategy,
2393:       exitContract,
2394:       nowMs: Date.now(),
2395:       volatility: entryVolatility,
2396:       confidence: tradeConfidence,
2397:       marketCondition: 'normal',
2398:       entryDirection: decision.action === 'BUY' ? 'long' : 'short',
2399:       mtfConfluenceSnapshot: orchResult.mtfConfluenceSnapshot || null,
2400:     });
2401:     const scope = this._runtimeScope(symbol);
2402:     const capPercent = absoluteCapPercent ?? this._resolveAbsolutePositionCap();
2403:     const requestedSizeUsd = positionSize * sizingMultiplier;
2404:     const absoluteCapSizeUsd = currentBalance * capPercent;
2405:     const cappedByAbsoluteCap = requestedSizeUsd > absoluteCapSizeUsd;
2406:     const sizeUsd = cappedByAbsoluteCap ? absoluteCapSizeUsd : requestedSizeUsd;
2407:     if (cappedByAbsoluteCap) {
2408:       console.log(`Position absolute-capped final size: $${requestedSizeUsd.toFixed(2)} -> $${sizeUsd.toFixed(2)} (${(capPercent * 100).toFixed(2)}% ABSOLUTE_POSITION_CAP)`);
2409:     }
2410:     const quantityUnit = this._orderQuantityUnit(scope);
2411:     let orderQuantity = this._orderQuantityFromSizeUsd(sizeUsd, price, scope, { forceWholeShares });
2412:     let shareRange = null;
2413:     if (quantityUnit === 'shares') {
2414:       shareRange = this._applyStockShareRange({
2415:         orderQuantity,
2416:         price,
2417:         exitContract,
2418:         absoluteCapSizeUsd,
2419:       });
2420:       orderQuantity = shareRange.orderQuantity;
2421:     }
2422:     let plannedSizeUsd = sizeUsd;
2423:     if (quantityUnit === 'shares' && (forceWholeShares || shareRange?.adjusted)) {
2424:       plannedSizeUsd = orderQuantity * price;
2425:     }
2426:
```

```js
3190:     const entryPlan = isEntryAction ? this._buildEntryPlan({
3191:       decision,
3192:       symbol,
3193:       price,
3194:       positionSize,
3195:       currentBalance,
3196:       currentEquity,
3197:       tradeConfidence,
3198:       confidenceMultiplier,
3199:       orchResult,
3200:       entryVolatility: indicators.volatility ?? null,
3201:       absoluteCapPercent: absoluteCap,
3202:       forceWholeShares: isWebhookExecutionRoute
3203:     }) : null;
3204:     if (entryPlan && entryPlan.orderQuantity <= 0) {
3205:       const blockReason = entryPlan.stockShareRangeBlockReason || 'non_positive_order_quantity';
3206:       console.warn(`[ENTRY-PLAN] Refusing ${entryPlan.action} for ${symbol}: planned ${entryPlan.quantityUnit} quantity=${entryPlan.orderQuantity} from sizeUsd=$${entryPlan.sizeUsd.toFixed(2)} at price=$${price.toFixed(2)} (${blockReason})`);
3207:       emitTrace(this.ctx, 'ORDER_BLOCKED', {
3208:         traceId,
3209:         signalId,
3210:         symbol,
3211:         action: decision.action,
3212:         positionEffect,
3213:         reason: blockReason,
3214:         quantityUnit: entryPlan.quantityUnit,
3215:         orderQuantity: entryPlan.orderQuantity,
3216:         sizeUsd: entryPlan.sizeUsd,
3217:         stockShareRange: entryPlan.stockShareRange,
3218:       });
3219:       return blockedReturn(blockReason, {
3220:         quantityUnit: entryPlan.quantityUnit,
3221:         orderQuantity: entryPlan.orderQuantity,
3222:         sizeUsd: entryPlan.sizeUsd,
3223:         stockShareRange: entryPlan.stockShareRange,
3224:       });
```
