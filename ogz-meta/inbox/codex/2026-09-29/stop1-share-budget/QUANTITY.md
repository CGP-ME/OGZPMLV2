# Host-attested exact staged source

Candidate tree c4a1b4e7cbfe02b11ae7d48153856fe90a99e29c; baseline aa91945575b22b076273d2c829a35c7a6b5cc9ef.
core/OrderExecutor.js SHA256 d67fb404763523906f15e54b38a74b34ba459c7e92d9ba7cf86f65af0c8637d6
Read using git show :core/OrderExecutor.js; not mixed working tree.

```js
2243:   _applyStockShareRange({ orderQuantity, price, exitContract, absoluteCapSizeUsd }) {
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
2267:     // Resolve the dollar ceiling before a minimum can raise the quantity.
2268:     let absoluteCapShares = Math.floor(absoluteCapSizeUsd / price);
2269:     // Division can round up at a whole-share boundary; dollars remain binding.
2270:     if (absoluteCapShares * price > absoluteCapSizeUsd) {
2271:       absoluteCapShares -= 1;
2272:     }
2273:     const caps = [absoluteCapShares];
2274:     const reasons = ['absolute_position_cap'];
2275:
2276:     const configuredMaxShares = Number(range.maxShares);
2277:     if (Number.isFinite(configuredMaxShares) && configuredMaxShares > 0) {
2278:       caps.push(Math.floor(configuredMaxShares));
2279:       reasons.push('config_max_shares');
2280:     }
2281:
2282:     const maxNotionalUsd = Number(range.maxNotionalUsd);
2283:     if (Number.isFinite(maxNotionalUsd) && maxNotionalUsd > 0) {
2284:       caps.push(Math.floor(maxNotionalUsd / price));
2285:       reasons.push('config_max_notional');
2286:     }
2287:
2288:     const profitTargetDollars = this._positiveConfigNumber('evalRules.ttp.consistency.profitTargetDollars');
2289:     const maxPositionProfitRatio = this._positiveConfigNumber('evalRules.ttp.consistency.maxPositionProfitRatio');
2290:     const consistencyCapBuffer = Number(range.consistencyCapBuffer);
2291:     if (profitTargetDollars !== null || maxPositionProfitRatio !== null) {
2292:       if (profitTargetDollars === null || maxPositionProfitRatio === null) {
2293:         throw new Error('[ENTRY-SHARE-RANGE] TTP consistency cap requires both profitTargetDollars and maxPositionProfitRatio');
2294:       }
2295:       if (!Number.isFinite(consistencyCapBuffer) || consistencyCapBuffer <= 0 || consistencyCapBuffer > 1) {
2296:         throw new Error(`[ENTRY-SHARE-RANGE] consistencyCapBuffer must be > 0 and <= 1; got ${range.consistencyCapBuffer}`);
2297:       }
2298:       const profitDistance = this._entryProfitDistanceDecimal(exitContract);
2299:       const maxProfitDollars = profitTargetDollars * maxPositionProfitRatio * consistencyCapBuffer;
2300:       caps.push(Math.floor(maxProfitDollars / (price * profitDistance)));
2301:       reasons.push('ttp_consistency_profit_cap');
2302:     }
2303:
2304:     const dailyLossDollars = this._positiveConfigNumber('evalRules.ttp.accountLimits.dailyLossDollars');
2305:     const dailyLossRiskFraction = Number(range.dailyLossRiskFraction);
2306:     const stopDistance = this._entryStopDistanceDecimal(exitContract);
2307:     if (dailyLossDollars !== null && stopDistance !== null) {
2308:       if (!Number.isFinite(dailyLossRiskFraction) || dailyLossRiskFraction <= 0 || dailyLossRiskFraction > 1) {
2309:         throw new Error(`[ENTRY-SHARE-RANGE] dailyLossRiskFraction must be > 0 and <= 1; got ${range.dailyLossRiskFraction}`);
2310:       }
2311:       caps.push(Math.floor((dailyLossDollars * dailyLossRiskFraction) / (price * stopDistance)));
2312:       reasons.push('ttp_daily_loss_risk');
2313:     }
2314:
2315:     const finiteCaps = caps.filter(value => Number.isFinite(value));
2316:     const maxShares = finiteCaps.length > 0 ? Math.min(...finiteCaps) : Infinity;
2317:     if (Number.isFinite(maxShares) && maxShares < minShares) {
2318:       return {
2319:         orderQuantity: 0,
2320:         adjusted: true,
2321:         bounds: { minShares, maxShares, reasons },
2322:         blockReason: `stock_share_range_impossible:min=${minShares}:max=${maxShares}`,
2323:       };
2324:     }
2325:
2326:     const wholeShareQuantity = Math.floor(Number(orderQuantity));
2327:     let boundedQuantity = wholeShareQuantity;
2328:     if (minShares > 0 && boundedQuantity < minShares) {
2329:       boundedQuantity = minShares;
2330:     }
2331:     if (Number.isFinite(maxShares) && boundedQuantity > maxShares) {
2332:       boundedQuantity = maxShares;
2333:     }
2334:
2335:     return {
2336:       orderQuantity: boundedQuantity,
2337:       adjusted: boundedQuantity !== orderQuantity,
2338:       bounds: { minShares, maxShares, reasons },
2339:       blockReason: boundedQuantity > 0 ? null : 'stock_share_range_zero_quantity',
2340:     };
2341:   }
```
