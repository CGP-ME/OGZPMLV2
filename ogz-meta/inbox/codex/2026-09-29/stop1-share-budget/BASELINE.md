# Exact baseline source

Commit aa91945575b22b076273d2c829a35c7a6b5cc9ef, core/OrderExecutor.js, git show. This is the comparison baseline, not the dirty working file.

```js
2243:   _applyStockShareRange({ orderQuantity, price, exitContract }) {
2244:     const range = {
2245:       enabled: ConfigLoader.get('entryLogic.sizing.stockShareRange.enabled'),
2246:       minShares: ConfigLoader.get('entryLogic.sizing.stockShareRange.minShares'),
2247:       maxShares: ConfigLoader.get('entryLogic.sizing.stockShareRange.maxShares'),
2248:       maxNotionalUsd: ConfigLoader.get('entryLogic.sizing.stockShareRange.maxNotionalUsd'),
2249:       consistencyCapBuffer: ConfigLoader.get('entryLogic.sizing.stockShareRange.consistencyCapBuffer'),
2250:       dailyLossRiskFraction: ConfigLoader.get('entryLogic.sizing.stockShareRange.dailyLossRiskFraction'),
2251:     };
2252:     if (!range || range.enabled !== true) {
2253:       return {
2254:         orderQuantity,
2255:         adjusted: false,
2256:         bounds: null,
2257:         blockReason: null,
2258:       };
2259:     }
2260:
2261:     const configuredMinShares = Number(range.minShares);
2262:     if (!Number.isFinite(configuredMinShares) || configuredMinShares < 0) {
2263:       throw new Error(`[ENTRY-SHARE-RANGE] minShares must be a finite non-negative number; got ${range.minShares}`);
2264:     }
2265:
2266:     const minShares = Math.ceil(configuredMinShares);
2267:     const caps = [];
2268:     const reasons = [];
2269:
2270:     const configuredMaxShares = Number(range.maxShares);
2271:     if (Number.isFinite(configuredMaxShares) && configuredMaxShares > 0) {
2272:       caps.push(Math.floor(configuredMaxShares));
2273:       reasons.push('config_max_shares');
2274:     }
2275:
2276:     const maxNotionalUsd = Number(range.maxNotionalUsd);
2277:     if (Number.isFinite(maxNotionalUsd) && maxNotionalUsd > 0) {
2278:       caps.push(Math.floor(maxNotionalUsd / price));
2279:       reasons.push('config_max_notional');
```
```js
2309:     const finiteCaps = caps.filter(value => Number.isFinite(value));
2310:     const maxShares = finiteCaps.length > 0 ? Math.min(...finiteCaps) : Infinity;
2311:     if (Number.isFinite(maxShares) && maxShares < minShares) {
2312:       return {
2313:         orderQuantity: 0,
2314:         adjusted: true,
2315:         bounds: { minShares, maxShares, reasons },
2316:         blockReason: `stock_share_range_impossible:min=${minShares}:max=${maxShares}`,
2317:       };
2318:     }
2319:
2320:     const wholeShareQuantity = Math.floor(Number(orderQuantity));
2321:     let boundedQuantity = wholeShareQuantity;
2322:     if (minShares > 0 && boundedQuantity < minShares) {
2323:       boundedQuantity = minShares;
2324:     }
2325:     if (Number.isFinite(maxShares) && boundedQuantity > maxShares) {
2326:       boundedQuantity = maxShares;
2327:     }
2328:
2329:     return {
2330:       orderQuantity: boundedQuantity,
2331:       adjusted: boundedQuantity !== orderQuantity,
2332:       bounds: { minShares, maxShares, reasons },
2333:       blockReason: boundedQuantity > 0 ? null : 'stock_share_range_zero_quantity',
2334:     };
2335:   }
```
```js
2395:     const scope = this._runtimeScope(symbol);
2396:     const capPercent = absoluteCapPercent ?? this._resolveAbsolutePositionCap();
2397:     const requestedSizeUsd = positionSize * sizingMultiplier;
2398:     const absoluteCapSizeUsd = currentBalance * capPercent;
2399:     const cappedByAbsoluteCap = requestedSizeUsd > absoluteCapSizeUsd;
2400:     const sizeUsd = cappedByAbsoluteCap ? absoluteCapSizeUsd : requestedSizeUsd;
2401:     if (cappedByAbsoluteCap) {
2402:       console.log(`Position absolute-capped final size: $${requestedSizeUsd.toFixed(2)} -> $${sizeUsd.toFixed(2)} (${(capPercent * 100).toFixed(2)}% ABSOLUTE_POSITION_CAP)`);
2403:     }
2404:     const quantityUnit = this._orderQuantityUnit(scope);
2405:     let orderQuantity = this._orderQuantityFromSizeUsd(sizeUsd, price, scope, { forceWholeShares });
2406:     let shareRange = null;
2407:     if (quantityUnit === 'shares') {
2408:       shareRange = this._applyStockShareRange({
2409:         orderQuantity,
2410:         price,
2411:         exitContract,
2412:       });
2413:       orderQuantity = shareRange.orderQuantity;
2414:     }
2415:     let plannedSizeUsd = sizeUsd;
2416:     if (quantityUnit === 'shares' && (forceWholeShares || shareRange?.adjusted)) {
2417:       plannedSizeUsd = orderQuantity * price;
2418:     }
```
