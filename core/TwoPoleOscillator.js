/**
 * Two-pole oscillator used by OptimizedIndicators.
 *
 * Behavioral values are injected from config/settings.json. Storage and
 * presentation mechanics are injected from config/internals.json.
 */

class TwoPoleOscillator {
    constructor(config) {
        this.smaLength = config.smaLength;
        this.filterLength = config.filterLength;

        this.extremeOverbought = config.extremeOverbought;
        this.overbought = config.overbought;
        this.neutral = config.neutral;
        this.oversold = config.oversold;
        this.extremeOversold = config.extremeOversold;
        this.upperThreshold = this.overbought;
        this.lowerThreshold = this.oversold;

        this.deltaDenominatorFloor = config.deltaDenominatorFloor;
        this.crossoverMinDeltaRatio = config.crossoverMinDeltaRatio;
        this.confidenceMidZone = config.confidenceMidZone;
        this.confidenceBase = config.confidenceBase;
        this.confidenceExtreme = config.confidenceExtreme;
        this.confidenceOverbought = config.confidenceOverbought;
        this.confidenceMid = config.confidenceMid;
        this.confidenceNeutral = config.confidenceNeutral;
        this.confidenceStrongDeltaThreshold = config.confidenceStrongDeltaThreshold;
        this.confidenceGoodDeltaThreshold = config.confidenceGoodDeltaThreshold;
        this.confidenceModerateDeltaThreshold = config.confidenceModerateDeltaThreshold;
        this.confidenceStrongDeltaBoost = config.confidenceStrongDeltaBoost;
        this.confidenceGoodDeltaBoost = config.confidenceGoodDeltaBoost;
        this.confidenceModerateDeltaBoost = config.confidenceModerateDeltaBoost;
        this.confidenceWeakDeltaPenalty = config.confidenceWeakDeltaPenalty;
        this.noisyFilterBelow = config.noisyFilterBelow;
        this.noisyFilterPenalty = config.noisyFilterPenalty;
        this.laggyFilterAbove = config.laggyFilterAbove;
        this.laggyFilterPenalty = config.laggyFilterPenalty;
        this.confidenceMin = config.confidenceMin;
        this.confidenceMax = config.confidenceMax;
        this.stopBufferFraction = config.stopBufferFraction;
        this.fallbackLongLowMultiplier = config.fallbackLongLowMultiplier;
        this.fallbackShortHighMultiplier = config.fallbackShortHighMultiplier;
        this.rewardRiskRatio = config.rewardRiskRatio;

        this.maxHistory = config.maxHistory;
        this.stateHistoryPoints = config.stateHistoryPoints;
        this.chartDataPoints = config.chartDataPoints;
        this.chartOpacityFloor = config.chartOpacityFloor;
        this.chartOpacityCeiling = config.chartOpacityCeiling;
        this.chartOpacityScale = config.chartOpacityScale;
        this.chartColorChannelCeiling = config.chartColorChannelCeiling;
        this.chartColorChannelBase = config.chartColorChannelBase;
        this.chartColorChannelScale = config.chartColorChannelScale;
        this.signalMarkerSymbol = config.signalMarkerSymbol;
        this.buyMarkerColor = config.buyMarkerColor;
        this.sellMarkerColor = config.sellMarkerColor;
        this.signalMarkerSize = config.signalMarkerSize;
        this.stopMarkerSymbol = config.stopMarkerSymbol;
        this.bullishStopMarkerColor = config.bullishStopMarkerColor;
        this.bearishStopMarkerColor = config.bearishStopMarkerColor;
        this.stopMarkerSize = config.stopMarkerSize;
        this.longStopLabel = config.longStopLabel;
        this.shortStopLabel = config.shortStopLabel;
        this.longStopDescription = config.longStopDescription;
        this.shortStopDescription = config.shortStopDescription;
        this.bullishGradient = config.bullishGradient;
        this.bearishGradient = config.bearishGradient;
        this.oscillatorLogDigits = config.oscillatorLogDigits;
        this.zoneLogDigits = config.zoneLogDigits;
        this.deltaLogDigits = config.deltaLogDigits;
        this.priceLogDigits = config.priceLogDigits;
        this.riskLogDigits = config.riskLogDigits;

        this.oscillatorHistory = [];
        this.filteredHistory = [];
        this.priceHistory = [];
        this.lastSignal = null;
        this.lastCrossover = null;
        this.invalidationLevels = {
            bullish: null,
            bearish: null,
        };
        this.smooth1 = null;
        this.smooth2 = null;

        console.log('[TwoPoleOscillator] initialized [BigBeluga]');
        console.log(`   SMA Length: ${this.smaLength}`);
        console.log(`   Filter Length: ${this.filterLength}`);
        console.log(`   Thresholds: ${this.lowerThreshold} to ${this.upperThreshold}`);
    }

    twoPoleFilter(value) {
        const alpha = 2.0 / (this.filterLength + 1);

        if (this.smooth1 === null) {
            this.smooth1 = value;
            this.smooth2 = value;
            return value;
        }

        this.smooth1 = (1 - alpha) * this.smooth1 + alpha * value;
        this.smooth2 = (1 - alpha) * this.smooth2 + alpha * this.smooth1;
        return this.smooth2;
    }

    calculateOscillator(prices) {
        if (prices.length < this.smaLength) {
            return 0;
        }

        const recentPrices = prices.slice(-this.smaLength);
        const currentPrice = prices[prices.length - 1];
        const sma = recentPrices.reduce((sum, price) => sum + price, 0) / this.smaLength;
        const deviation = currentPrice - sma;
        const squaredDiffs = recentPrices.map(price => Math.pow(price - sma, 2));
        const variance = squaredDiffs.reduce((sum, difference) => sum + difference, 0) / this.smaLength;
        const stdDev = Math.sqrt(variance);
        return stdDev > 0 ? deviation / stdDev : 0;
    }

    update(price) {
        this.priceHistory.push(price);
        if (this.priceHistory.length > this.maxHistory) {
            this.priceHistory.shift();
        }

        const rawOscillator = this.calculateOscillator(this.priceHistory);
        const filtered = this.twoPoleFilter(rawOscillator);

        this.oscillatorHistory.push(rawOscillator);
        this.filteredHistory.push(filtered);
        if (this.oscillatorHistory.length > this.maxHistory) {
            this.oscillatorHistory.shift();
            this.filteredHistory.shift();
        }

        const signal = this.detectCrossover();
        this.updateInvalidationLevels(price, filtered);
        const delta = Math.abs(rawOscillator - filtered)
            / Math.max(Math.abs(filtered), this.deltaDenominatorFloor);

        return {
            oscillator: rawOscillator,
            filtered,
            filter: filtered,
            delta,
            signal,
            invalidation: this.invalidationLevels,
            thresholds: {
                upper: this.upperThreshold,
                lower: this.lowerThreshold,
            },
        };
    }

    detectCrossover() {
        if (this.oscillatorHistory.length < 2 || this.filteredHistory.length < 2) {
            return null;
        }

        const prevOscillator = this.oscillatorHistory[this.oscillatorHistory.length - 2];
        const currentOscillator = this.oscillatorHistory[this.oscillatorHistory.length - 1];
        const prevFiltered = this.filteredHistory[this.filteredHistory.length - 2];
        const currentFiltered = this.filteredHistory[this.filteredHistory.length - 1];
        let signal = null;

        if (prevOscillator <= prevFiltered && currentOscillator > currentFiltered) {
            const delta = Math.abs(currentOscillator - currentFiltered)
                / Math.max(Math.abs(currentFiltered), this.deltaDenominatorFloor);

            if (currentOscillator <= this.oversold && delta > this.crossoverMinDeltaRatio) {
                signal = {
                    type: 'BUY',
                    strength: delta,
                    confidence: this.calculateSignalConfidence(currentOscillator, currentFiltered),
                    timestamp: Date.now(),
                    valid: true,
                    zone: 'oversold',
                    delta: delta * 100,
                    magic: true,
                };
                this.lastSignal = signal;
                this.lastCrossover = 'bullish';

                console.log('\n[TwoPoleOscillator] MAGIC BUY SIGNAL');
                console.log(`   Oversold: ${currentOscillator.toFixed(this.oscillatorLogDigits)} < ${this.oversold}`);
                console.log(`   Delta: ${(delta * 100).toFixed(this.deltaLogDigits)}% > ${this.crossoverMinDeltaRatio * 100}%`);
                console.log('   Entry point confirmed');
            } else {
                const reasons = [];
                if (currentOscillator > this.oversold) {
                    reasons.push(`Not oversold (${currentOscillator.toFixed(this.oscillatorLogDigits)} > ${this.oversold})`);
                }
                if (delta <= this.crossoverMinDeltaRatio) {
                    reasons.push(`Weak delta (${(delta * 100).toFixed(this.deltaLogDigits)}% < ${this.crossoverMinDeltaRatio * 100}%)`);
                }
                console.log(`[TwoPoleOscillator] INVALID BUY: ${reasons.join(', ')}`);
                signal = {
                    type: 'INVALID',
                    reason: reasons.join(', '),
                    oscillator: currentOscillator,
                    delta: delta * 100,
                };
            }
        } else if (prevOscillator >= prevFiltered && currentOscillator < currentFiltered) {
            const delta = Math.abs(currentOscillator - currentFiltered)
                / Math.max(Math.abs(currentFiltered), this.deltaDenominatorFloor);

            if (currentOscillator >= this.overbought && delta > this.crossoverMinDeltaRatio) {
                signal = {
                    type: 'SELL',
                    strength: delta,
                    confidence: this.calculateSignalConfidence(currentOscillator, currentFiltered),
                    timestamp: Date.now(),
                    valid: true,
                    zone: 'overbought',
                    delta: delta * 100,
                    magic: true,
                };
                this.lastSignal = signal;
                this.lastCrossover = 'bearish';

                console.log('\n[TwoPoleOscillator] MAGIC SELL SIGNAL');
                console.log(`   Overbought: ${currentOscillator.toFixed(this.oscillatorLogDigits)} > ${this.overbought}`);
                console.log(`   Delta: ${(delta * 100).toFixed(this.deltaLogDigits)}% > ${this.crossoverMinDeltaRatio * 100}%`);
                console.log('   Entry point confirmed');
            } else {
                const reasons = [];
                if (currentOscillator < this.overbought) {
                    reasons.push(`Not overbought (${currentOscillator.toFixed(this.oscillatorLogDigits)} < ${this.overbought})`);
                }
                if (delta <= this.crossoverMinDeltaRatio) {
                    reasons.push(`Weak delta (${(delta * 100).toFixed(this.deltaLogDigits)}% < ${this.crossoverMinDeltaRatio * 100}%)`);
                }
                console.log(`[TwoPoleOscillator] INVALID SELL: ${reasons.join(', ')}`);
                signal = {
                    type: 'INVALID',
                    reason: reasons.join(', '),
                    oscillator: currentOscillator,
                    delta: delta * 100,
                };
            }
        }

        return signal;
    }

    calculateSignalConfidence(oscillator, filtered) {
        let confidence = this.confidenceBase;
        const absoluteOscillator = Math.abs(oscillator);

        if (absoluteOscillator >= this.extremeOverbought) {
            confidence = this.confidenceExtreme;
            console.log(`[TwoPoleOscillator] EXTREME ZONE: ${oscillator.toFixed(this.zoneLogDigits)} - reversal imminent`);
        } else if (absoluteOscillator >= this.overbought) {
            confidence = this.confidenceOverbought;
        } else if (absoluteOscillator >= this.confidenceMidZone) {
            confidence = this.confidenceMid;
        } else {
            confidence = this.confidenceNeutral;
        }

        const delta = Math.abs(oscillator - filtered);
        if (delta > this.confidenceStrongDeltaThreshold) {
            confidence += this.confidenceStrongDeltaBoost;
            console.log(`[TwoPoleOscillator] strong delta: ${(delta * 100).toFixed(this.deltaLogDigits)}%`);
        } else if (delta > this.confidenceGoodDeltaThreshold) {
            confidence += this.confidenceGoodDeltaBoost;
        } else if (delta > this.confidenceModerateDeltaThreshold) {
            confidence += this.confidenceModerateDeltaBoost;
        } else {
            confidence += this.confidenceWeakDeltaPenalty;
        }

        const filterAdjustment = this.filterLength < this.noisyFilterBelow
            ? this.noisyFilterPenalty
            : this.filterLength > this.laggyFilterAbove
                ? this.laggyFilterPenalty
                : 0;
        confidence += filterAdjustment;
        return Math.min(Math.max(confidence, this.confidenceMin), this.confidenceMax);
    }

    calculateTradeLevels(entryPrice, signal, candleLow = null, candleHigh = null) {
        const levels = {};

        if (signal.type === 'BUY') {
            const stopBuffer = entryPrice * this.stopBufferFraction;
            levels.stopLoss = (candleLow || entryPrice * this.fallbackLongLowMultiplier) - stopBuffer;
            const risk = entryPrice - levels.stopLoss;
            levels.takeProfit = entryPrice + (risk * this.rewardRiskRatio);
            this.invalidationLevels.bullish = levels.stopLoss;

            console.log('[TwoPoleOscillator] BUY LEVELS SET');
            console.log(`   Entry: $${entryPrice.toFixed(this.priceLogDigits)}`);
            console.log(`   Stop: $${levels.stopLoss.toFixed(this.priceLogDigits)} (Risk: ${((risk / entryPrice) * 100).toFixed(this.riskLogDigits)}%)`);
            console.log(`   Target: $${levels.takeProfit.toFixed(this.priceLogDigits)} (${this.rewardRiskRatio}:1 RR)`);
        } else if (signal.type === 'SELL') {
            const stopBuffer = entryPrice * this.stopBufferFraction;
            levels.stopLoss = (candleHigh || entryPrice * this.fallbackShortHighMultiplier) + stopBuffer;
            const risk = levels.stopLoss - entryPrice;
            levels.takeProfit = entryPrice - (risk * this.rewardRiskRatio);
            this.invalidationLevels.bearish = levels.stopLoss;

            console.log('[TwoPoleOscillator] SELL LEVELS SET');
            console.log(`   Entry: $${entryPrice.toFixed(this.priceLogDigits)}`);
            console.log(`   Stop: $${levels.stopLoss.toFixed(this.priceLogDigits)} (Risk: ${((risk / entryPrice) * 100).toFixed(this.riskLogDigits)}%)`);
            console.log(`   Target: $${levels.takeProfit.toFixed(this.priceLogDigits)} (${this.rewardRiskRatio}:1 RR)`);
        }

        return levels;
    }

    updateInvalidationLevels(currentPrice, filteredValue) {
        void currentPrice;
        void filteredValue;
    }

    checkInvalidation(currentPrice, position) {
        if (position > 0 && this.invalidationLevels.bullish
            && currentPrice <= this.invalidationLevels.bullish) {
            console.log(`[TwoPoleOscillator] BULLISH INVALIDATION: Price ${currentPrice} hit stop ${this.invalidationLevels.bullish}`);
            return {
                triggered: true,
                type: 'bullish',
                level: this.invalidationLevels.bullish,
                action: 'SELL',
            };
        }

        if (position < 0 && this.invalidationLevels.bearish
            && currentPrice >= this.invalidationLevels.bearish) {
            console.log(`[TwoPoleOscillator] BEARISH INVALIDATION: Price ${currentPrice} hit stop ${this.invalidationLevels.bearish}`);
            return {
                triggered: true,
                type: 'bearish',
                level: this.invalidationLevels.bearish,
                action: 'BUY',
            };
        }

        return { triggered: false };
    }

    getState() {
        const current = this.oscillatorHistory[this.oscillatorHistory.length - 1] || 0;
        const filtered = this.filteredHistory[this.filteredHistory.length - 1] || 0;

        return {
            oscillator: current,
            filtered,
            signal: this.lastSignal,
            crossover: this.lastCrossover,
            invalidationLevels: this.invalidationLevels,
            thresholds: {
                upper: this.upperThreshold,
                lower: this.lowerThreshold,
            },
            history: {
                oscillator: this.oscillatorHistory.slice(-this.stateHistoryPoints),
                filtered: this.filteredHistory.slice(-this.stateHistoryPoints),
            },
        };
    }

    getChartData() {
        const dataPoints = Math.min(this.oscillatorHistory.length, this.chartDataPoints);
        const chartData = [];
        const crossPoints = [];

        for (let index = this.oscillatorHistory.length - dataPoints; index < this.oscillatorHistory.length; index += 1) {
            const oscillator = this.oscillatorHistory[index];
            const filtered = this.filteredHistory[index];
            const strength = Math.abs(oscillator);
            const opacity = Math.max(
                this.chartOpacityFloor,
                Math.min(this.chartOpacityCeiling, strength * this.chartOpacityScale)
            );
            const intensity = Math.min(
                this.chartColorChannelCeiling,
                this.chartColorChannelBase + strength * this.chartColorChannelScale
            );
            const bullish = oscillator > filtered;
            const color = bullish
                ? `rgba(0, ${intensity}, ${this.chartColorChannelCeiling}, ${opacity})`
                : `rgba(${intensity}, 0, ${intensity}, ${opacity})`;
            const gradientColor = bullish ? 'bullish' : 'bearish';

            if (index > 0) {
                const previousOscillator = this.oscillatorHistory[index - 1];
                const previousFiltered = this.filteredHistory[index - 1];
                if ((previousOscillator <= previousFiltered && oscillator > filtered)
                    || (previousOscillator >= previousFiltered && oscillator < filtered)) {
                    crossPoints.push({
                        index,
                        type: bullish ? 'bullish' : 'bearish',
                        value: oscillator,
                        price: this.priceHistory[index] || 0,
                    });
                }
            }

            chartData.push({
                index,
                oscillator,
                filtered,
                upper: this.upperThreshold,
                lower: this.lowerThreshold,
                zero: this.neutral,
                color,
                gradientColor,
                opacity,
                strength,
            });
        }

        return {
            data: chartData,
            crossPoints,
            invalidation: this.invalidationLevels,
            lastSignal: this.lastSignal,
            gradient: {
                bullish: this.bullishGradient,
                bearish: this.bearishGradient,
            },
        };
    }

    getCrossPointMarkers() {
        const markers = [];

        if (this.lastSignal && this.priceHistory.length > 0) {
            markers.push({
                price: this.priceHistory[this.priceHistory.length - 1],
                type: this.lastSignal.type,
                symbol: this.signalMarkerSymbol,
                color: this.lastSignal.type === 'BUY' ? this.buyMarkerColor : this.sellMarkerColor,
                size: this.signalMarkerSize,
                timestamp: this.lastSignal.timestamp,
            });
        }

        if (this.invalidationLevels.bullish) {
            markers.push({
                price: this.invalidationLevels.bullish,
                type: 'stop_loss',
                symbol: this.stopMarkerSymbol,
                color: this.bullishStopMarkerColor,
                size: this.stopMarkerSize,
                label: this.longStopLabel,
                description: this.longStopDescription,
            });
        }

        if (this.invalidationLevels.bearish) {
            markers.push({
                price: this.invalidationLevels.bearish,
                type: 'stop_loss',
                symbol: this.stopMarkerSymbol,
                color: this.bearishStopMarkerColor,
                size: this.stopMarkerSize,
                label: this.shortStopLabel,
                description: this.shortStopDescription,
            });
        }

        return markers;
    }
}

module.exports = TwoPoleOscillator;
