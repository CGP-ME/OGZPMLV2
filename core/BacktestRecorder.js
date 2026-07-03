/**
 * @fileoverview BacktestRecorder - In-Memory Trade Recording for Backtests
 *
 * Tracks all trades during backtest with running balance, exports CSV,
 * and provides comprehensive summary statistics.
 *
 * @description
 * Unlike TradeLogger which writes to disk (disabled in backtest mode),
 * this records everything in memory and exports at the end.
 *
 * Starting balance: $10,000
 * Fees: 0.52% round trip (0.26% each way - Kraken taker)
 */

const fs = require('fs');
const path = require('path');
const TradingConfig = require('./TradingConfig');
const FeeModel = require('./FeeModel');

class BacktestRecorder {
    static finiteNumberOrNull(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    static cleanTextOrNull(value) {
        if (value === null || value === undefined) return null;
        const cleaned = String(value).trim();
        return cleaned || null;
    }

    static jsonCloneOrNull(value) {
        if (value === null || value === undefined) return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return null;
        }
    }

    static winnerAttributionFromSignalBreakdown(signalBreakdown, strategyName) {
        const signals = Array.isArray(signalBreakdown?.signals) ? signalBreakdown.signals : [];
        const winnerSignal = signals.find(signal => (
            signal?.name === strategyName
            || signal?.strategyName === strategyName
        ));
        return BacktestRecorder.jsonCloneOrNull(winnerSignal?.decisionAttribution);
    }

    static contributorNames(attribution) {
        if (!Array.isArray(attribution?.contributors)) return '';
        return attribution.contributors
            .map(contributor => BacktestRecorder.cleanTextOrNull(contributor?.name))
            .filter(Boolean)
            .join('|');
    }

    static validateTradeScope(trade, caller = 'BacktestRecorder.validateTradeScope') {
        const missing = [];
        const cleanText = (value, name) => {
            if (value === null || value === undefined) {
                missing.push(name);
                return null;
            }
            const cleaned = String(value).trim();
            if (!cleaned) {
                missing.push(name);
                return null;
            }
            return cleaned;
        };

        const rawSymbol = cleanText(trade?.symbol, 'symbol');
        const rawBrokerId = cleanText(trade?.brokerId, 'brokerId');
        const rawAccountId = cleanText(trade?.accountId, 'accountId');
        const rawAssetClass = cleanText(trade?.assetClass, 'assetClass');
        const rawExecutionMode = cleanText(trade?.executionMode, 'executionMode');
        const rawTimeframe = cleanText(trade?.timeframe, 'timeframe');
        const rawScopeKey = cleanText(trade?.scopeKey, 'scopeKey');

        if (missing.length > 0) {
            const error = new Error(`${caller} missing immutable backtest trade scope field(s): ${missing.join(', ')}`);
            error.code = 'BACKTEST_TRADE_SCOPE_REJECTED';
            error.missingFields = missing;
            throw error;
        }

        const symbol = rawSymbol.toUpperCase().replace('XBT', 'BTC').replace('/', '-');
        const brokerId = rawBrokerId.toLowerCase();
        const accountId = rawAccountId;
        const rawAccountIdSource = trade.accountIdSource !== null && trade.accountIdSource !== undefined
            ? String(trade.accountIdSource).trim()
            : '';
        const accountIdSource = rawAccountIdSource || (accountId !== 'default' ? 'trade' : 'default');
        const assetClass = rawAssetClass.toLowerCase();
        const executionMode = rawExecutionMode.toLowerCase();
        const timeframe = rawTimeframe;
        const expectedScopeKey = `${executionMode}:${brokerId}:${accountId}:${assetClass}:${symbol}:${timeframe}`;
        const suppliedScopeKey = String(rawScopeKey).trim();

        if (suppliedScopeKey !== expectedScopeKey) {
            const error = new Error(`${caller} scopeKey mismatch: supplied ${suppliedScopeKey} expected ${expectedScopeKey}`);
            error.code = 'BACKTEST_TRADE_SCOPE_REJECTED';
            error.missingFields = [];
            error.suppliedScopeKey = suppliedScopeKey;
            error.expectedScopeKey = expectedScopeKey;
            throw error;
        }

        return {
            symbol,
            brokerId,
            accountId,
            accountIdSource,
            assetClass,
            executionMode,
            timeframe,
            scopeKey: expectedScopeKey,
            scopeKeyVersion: 2,
            scopeComplete: Boolean(accountId && accountId !== 'default' && accountIdSource !== 'default')
        };
    }

    constructor(config = {}) {
        // FIX MIRROR-RECORDER-BALANCE: phantom $10K fallback removed. Mirror
        // of Fix 13 (TradeJournal). Same coerce/finite/positive check pattern.
        const rawBalance = config.startingBalance;
        const numericBalance = Number(rawBalance);
        if (!Number.isFinite(numericBalance) || numericBalance <= 0) {
          throw new Error(`[MIRROR-RECORDER-BALANCE] BacktestRecorder requires positive finite startingBalance (got ${rawBalance}) — refusing $10K phantom`);
        }
        this.startingBalance = numericBalance;
        this.feeModel = config.feeModel || (
            config.feePerSide !== undefined
                ? FeeModel.percent({ makerFee: config.feePerSide, takerFee: config.feePerSide })
                : FeeModel.fromTradingConfig()
        );
        this.feePerSide = config.feePerSide ?? TradingConfig.get('fees.makerFee');
        this.roundTripFee = this.feePerSide * 2;

        this.balance = this.startingBalance;
        this.trades = [];
        this.peakBalance = this.startingBalance;
        this.maxDrawdown = 0;
        this.maxDrawdownDollars = 0;
    }

    /**
     * Record a trade with all details
     * @param {Object} trade - Trade data from exit handler
     */
    recordTrade(trade) {
        const tradeScope = BacktestRecorder.validateTradeScope(trade, 'BacktestRecorder.recordTrade');
        const entryPrice = trade.entryPrice || 0;
        const exitPrice = trade.exitPrice || 0;

        // Calculate raw P&L using percentage-based math
        // MED-14: throw on non-positive entryPrice instead of logging \$0 P&L.
        // Same halt-class as MED-02 in OrderExecutor. Refuses to record a
        // phantom flat trade that would corrupt win-rate stats downstream.
        if (!(entryPrice > 0)) {
            throw new Error(`[MED-14] BacktestRecorder.recordTrade: entryPrice non-positive (got ${entryPrice}, direction=${trade.direction}) — refusing to log phantom \$0 P&L`);
        }
        const closedOrderQuantity = BacktestRecorder.finiteNumberOrNull(
            trade.closedOrderQuantity ?? trade.exitOrderQuantity ?? trade.orderQuantity
        );
        const positionSizeUsd = closedOrderQuantity !== null && closedOrderQuantity > 0
            ? entryPrice * closedOrderQuantity
            : (trade.size || trade.sizeUsd || 1);
        let rawPnlDollars;
        if (trade.direction === 'long' || trade.direction === 'buy') {
            // Long: profit when price goes UP
            rawPnlDollars = positionSizeUsd * ((exitPrice - entryPrice) / entryPrice);
        } else {
            // Short: profit when price goes DOWN
            rawPnlDollars = positionSizeUsd * ((entryPrice - exitPrice) / entryPrice);
        }

        const entryFeeQuantity = BacktestRecorder.finiteNumberOrNull(
            trade.entryFeeQuantity
            ?? trade.closedOrderQuantity
            ?? trade.exitOrderQuantity
            ?? trade.orderQuantity
            ?? trade.entryOrderQuantity
        ) ?? (positionSizeUsd / entryPrice);
        const exitFeeQuantity = BacktestRecorder.finiteNumberOrNull(
            trade.exitFeeQuantity
            ?? trade.closedOrderQuantity
            ?? trade.exitOrderQuantity
            ?? trade.orderQuantity
        ) ?? (positionSizeUsd / exitPrice);
        const exitNotionalUsd = Number.isFinite(Number(trade.exitSizeUsd))
            ? Number(trade.exitSizeUsd)
            : positionSizeUsd * (exitPrice / entryPrice);
        const totalFees = this.feeModel.calculateRoundTripFees({
            entryNotionalUsd: positionSizeUsd,
            exitNotionalUsd,
            entryQuantity: entryFeeQuantity,
            exitQuantity: exitFeeQuantity,
        });

        // Net P&L after fees
        const netPnlDollars = rawPnlDollars - totalFees;
        const netPnlPercent = positionSizeUsd > 0 ? (netPnlDollars / positionSizeUsd) * 100 : 0;

        // Update balance
        const balanceBefore = this.balance;
        this.balance += netPnlDollars;

        // Track peak and drawdown
        if (this.balance > this.peakBalance) {
            this.peakBalance = this.balance;
        }
        const currentDrawdown = ((this.peakBalance - this.balance) / this.peakBalance) * 100;
        const currentDrawdownDollars = this.peakBalance - this.balance;
        if (currentDrawdown > this.maxDrawdown) {
            this.maxDrawdown = currentDrawdown;
            this.maxDrawdownDollars = currentDrawdownDollars;
        }

        // Build trade record
        const rawSignalBreakdown = BacktestRecorder.jsonCloneOrNull(trade.signalBreakdown);
        const rawMtfConfluenceSnapshot = BacktestRecorder.jsonCloneOrNull(
            trade.mtfConfluenceSnapshot ?? trade.frozenExitPolicy?.mtfConfluenceSnapshot
        );
        const rawFrozenExitPolicy = BacktestRecorder.jsonCloneOrNull(trade.frozenExitPolicy);
        const rawFeeEdgeGate = BacktestRecorder.jsonCloneOrNull(trade.feeEdgeGate);
        const rawRiskGates = BacktestRecorder.jsonCloneOrNull(trade.riskGates);
        const strategyName = trade.strategyName || trade.winner || 'unknown';
        const winnerDecisionAttribution = BacktestRecorder.winnerAttributionFromSignalBreakdown(
            rawSignalBreakdown,
            strategyName
        );
        const maxFavorableExcursionPercent = BacktestRecorder.finiteNumberOrNull(
            trade.maxFavorableExcursionPercent
            ?? trade.maxProfitPercent
            ?? trade.maxFavorableExcursion
        );
        const maxAdverseExcursionPercent = BacktestRecorder.finiteNumberOrNull(
            trade.maxAdverseExcursionPercent
            ?? trade.maxDrawdownPercent
            ?? trade.maxAdverseExcursion
        );

        const record = {
            tradeNumber: this.trades.length + 1,
            tradeId: BacktestRecorder.cleanTextOrNull(trade.tradeId ?? trade.orderId ?? trade.id),
            entryTime: trade.entryTime || trade.entryCandle?.time || '',
            exitTime: trade.exitTime || trade.exitCandle?.time || '',
            direction: trade.direction || 'unknown',
            entryPrice: trade.entryPrice || 0,
            exitPrice: trade.exitPrice || 0,
            stopLoss: trade.stopLoss || trade.exitContract?.stopLoss || 0,
            takeProfit: trade.takeProfit || trade.exitContract?.takeProfit || 0,
            size: positionSizeUsd,
            entryOrderQuantity: BacktestRecorder.finiteNumberOrNull(trade.entryOrderQuantity),
            entryOrderQuantityUnit: BacktestRecorder.cleanTextOrNull(trade.entryOrderQuantityUnit),
            remainingOrderQuantityBeforeExit: BacktestRecorder.finiteNumberOrNull(
                trade.remainingOrderQuantityBeforeExit ?? trade.remainingOrderQuantity
            ),
            remainingOrderQuantityUnit: BacktestRecorder.cleanTextOrNull(trade.remainingOrderQuantityUnit),
            exitOrderQuantity: BacktestRecorder.finiteNumberOrNull(trade.exitOrderQuantity),
            exitOrderQuantityUnit: BacktestRecorder.cleanTextOrNull(trade.exitOrderQuantityUnit ?? trade.quantityUnit),
            closedOrderQuantity,
            quantityUnit: BacktestRecorder.cleanTextOrNull(
                trade.quantityUnit ?? trade.exitOrderQuantityUnit ?? trade.entryOrderQuantityUnit
            ),
            entryFeeQuantity,
            exitFeeQuantity,

            // P&L
            rawPnlDollars,
            feesDollars: totalFees,
            netPnlDollars,
            netPnlPercent,

            // Strategy info
            strategyName,
            confidence: trade.confidence || 0,
            exitReason: trade.exitReason || 'unknown',
            signalBreakdown: rawSignalBreakdown,
            winnerDecisionAttribution,
            confidenceContributors: BacktestRecorder.contributorNames(winnerDecisionAttribution),
            mtfConfluenceSnapshot: rawMtfConfluenceSnapshot,
            frozenExitPolicy: rawFrozenExitPolicy,
            feeEdgeGate: rawFeeEdgeGate,
            riskGates: rawRiskGates,
            maxFavorableExcursionPercent,
            maxAdverseExcursionPercent,
            mfePercent: maxFavorableExcursionPercent,
            maePercent: maxAdverseExcursionPercent,
            isPartialClose: trade.isPartialClose === true,
            partialFraction: BacktestRecorder.finiteNumberOrNull(trade.partialFraction),

            // Balance tracking
            balanceBefore,
            balanceAfter: this.balance,

            // Extra context
            reason: trade.reason || '',
            holdTimeMinutes: trade.holdTimeMinutes || 0,

            // Raw candle data for deep dive
            entryCandle: trade.entryCandle || null,
            exitCandle: trade.exitCandle || null,
            signalDetails: trade.signalDetails || null,

            // Immutable runtime scope for report/proof joins
            symbol: tradeScope.symbol,
            brokerId: tradeScope.brokerId,
            accountId: tradeScope.accountId,
            accountIdSource: tradeScope.accountIdSource,
            assetClass: tradeScope.assetClass,
            executionMode: tradeScope.executionMode,
            timeframe: tradeScope.timeframe,
            scopeKey: tradeScope.scopeKey,
            scopeKeyVersion: tradeScope.scopeKeyVersion,
            scopeComplete: tradeScope.scopeComplete
        };

        // === PATTERN-PACK DIMENSIONS (harvestable by matrix-sweep) ===
        // CC-A Change 1: enrich trade record with dimensions used by
        // TRAIPatternIntegration.js for confidence boost/penalty matching.
        // DST-aware ET conversion via Intl.DateTimeFormat.
        const _etFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', hour12: false,
            weekday: 'short'
        });

        let entryTimestamp = null;
        if (record.entryTime) {
            entryTimestamp = typeof record.entryTime === 'number'
                ? record.entryTime
                : new Date(record.entryTime).getTime();
        }

        if (entryTimestamp && !isNaN(entryTimestamp)) {
            const parts = _etFmt.formatToParts(new Date(entryTimestamp));
            const weekday = parts.find(p => p.type === 'weekday')?.value || 'unknown';
            const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
            const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
            const hourMinute = hour * 60 + minute;

            record.dayOfWeek = weekday;
            record.hourET = hour;
            record.minuteET = minute;

            // Session classification (NYSE RTH: 9:30-16:00 ET)
            if (hourMinute < 9 * 60 + 30) record.session = 'pre_market';
            else if (hourMinute < 10 * 60 + 30) record.session = 'morning_open';
            else if (hourMinute < 12 * 60) record.session = 'morning';
            else if (hourMinute < 14 * 60) record.session = 'midday';
            else if (hourMinute < 15 * 60 + 30) record.session = 'afternoon';
            else if (hourMinute < 16 * 60) record.session = 'close';
            else record.session = 'after_hours';
        } else {
            record.dayOfWeek = 'unknown';
            record.hourET = null;
            record.minuteET = null;
            record.session = 'unknown';
        }

        // Hold bucket
        const holdMin = record.holdTimeMinutes || 0;
        if (holdMin < 15) record.holdBucket = 'scalp';
        else if (holdMin < 60) record.holdBucket = 'short_swing';
        else if (holdMin < 240) record.holdBucket = 'swing';
        else record.holdBucket = 'position';

        // Confidence tier
        const conf = record.confidence || 0;
        if (conf < 0.30) record.confidenceTier = 'low';
        else if (conf < 0.55) record.confidenceTier = 'medium';
        else if (conf < 0.75) record.confidenceTier = 'high';
        else record.confidenceTier = 'very_high';

        record.pnlPerShare = record.closedOrderQuantity > 0
            ? record.netPnlDollars / record.closedOrderQuantity
            : null;

        // Exit type normalization
        const er = (record.exitReason || '').toLowerCase();
        if (er.includes('stop_loss') || er.includes('stoploss')) record.exitType = 'stop_loss';
        else if (er === 'profit_tier' || /^profit_tier_?\d+$/.test(er)) record.exitType = 'profit_tier';
        else if (er.includes('take_profit')) record.exitType = 'take_profit';
        else if (er.includes('trailing')) record.exitType = 'trailing_stop';
        else if (er.includes('max_hold')) record.exitType = 'max_hold';
        else if (er.includes('break_even')) record.exitType = 'break_even';
        else record.exitType = er || 'unknown';

        // Indicator state at entry (passed from TradingLoop in CC-A Change 2;
        // null-propagate when not yet wired so the field is present for the
        // pattern-pack harvester even on legacy records).
        record.atrAtEntry = trade.atrAtEntry ?? trade.signalDetails?.atr ?? null;
        record.regimeAtEntry = trade.regimeAtEntry ?? trade.signalDetails?.regime ?? null;
        record.rsiAtEntry = trade.rsiAtEntry ?? trade.signalDetails?.rsi ?? null;

        this.trades.push(record);

        // Log running balance
        const directionMark = netPnlDollars >= 0 ? 'UP' : 'DOWN';
        console.log(`Trade #${record.tradeNumber}: ${record.strategyName} ${record.direction.toUpperCase()} | ${netPnlDollars >= 0 ? '+' : ''}$${netPnlDollars.toFixed(2)} (${netPnlPercent >= 0 ? '+' : ''}${netPnlPercent.toFixed(2)}%) | Balance: $${this.balance.toFixed(2)} ${directionMark}`);

        return record;
    }

    /**
     * Export all trades to CSV
     * @param {string} filepath - Output file path
     */
    exportCSV(filepath = './backtest-trades.csv') {
        const headers = [
            'trade_number',
            'entry_time',
            'exit_time',
            'direction',
            'entry_price',
            'exit_price',
            'stop_loss',
            'take_profit',
            'size_usd',
            'entry_order_quantity',
            'entry_order_quantity_unit',
            'remaining_order_quantity_before_exit',
            'remaining_order_quantity_unit',
            'exit_order_quantity',
            'exit_order_quantity_unit',
            'closed_order_quantity',
            'quantity_unit',
            'entry_fee_quantity',
            'exit_fee_quantity',
            'raw_pnl_dollars',
            'fees_dollars',
            'net_pnl_dollars',
            'net_pnl_percent',
            'strategy_name',
            'confidence',
            'exit_reason',
            'balance_after',
            'hold_time_minutes',
            // CC-A: pattern-pack dimensions
            'day_of_week',
            'hour_et',
            'session',
            'hold_bucket',
            'confidence_tier',
            'symbol',
            'broker_id',
            'account_id',
            'account_id_source',
            'asset_class',
            'execution_mode',
            'timeframe',
            'scope_key',
            'scope_key_version',
            'scope_complete',
            'pnl_per_share',
            'exit_type',
            'atr_at_entry',
            'regime_at_entry',
            'rsi_at_entry',
            'confidence_contributors',
            'mtf_confluence_direction',
            'mtf_confluence_score',
            'mtf_confluence_confidence',
            'mtf_ready_timeframes',
            'is_partial_close',
            'partial_fraction',
            'frozen_exit_policy_hash'
        ];

        const rows = this.trades.map(t => [
            t.tradeNumber,
            t.entryTime,
            t.exitTime,
            t.direction,
            t.entryPrice.toFixed(2),
            t.exitPrice.toFixed(2),
            t.stopLoss,
            t.takeProfit,
            t.size,
            t.entryOrderQuantity ?? '',
            t.entryOrderQuantityUnit ?? '',
            t.remainingOrderQuantityBeforeExit ?? '',
            t.remainingOrderQuantityUnit ?? '',
            t.exitOrderQuantity ?? '',
            t.exitOrderQuantityUnit ?? '',
            t.closedOrderQuantity ?? '',
            t.quantityUnit ?? '',
            t.entryFeeQuantity ?? '',
            t.exitFeeQuantity ?? '',
            t.rawPnlDollars.toFixed(2),
            t.feesDollars.toFixed(2),
            t.netPnlDollars.toFixed(2),
            t.netPnlPercent.toFixed(2),
            t.strategyName,
            t.confidence.toFixed(1),
            t.exitReason,
            t.balanceAfter.toFixed(2),
            t.holdTimeMinutes.toFixed(1),
            // CC-A: pattern-pack dimensions
            t.dayOfWeek ?? '',
            t.hourET ?? '',
            t.session ?? '',
            t.holdBucket ?? '',
            t.confidenceTier ?? '',
            t.symbol ?? '',
            t.brokerId ?? '',
            t.accountId ?? '',
            t.accountIdSource ?? '',
            t.assetClass ?? '',
            t.executionMode ?? '',
            t.timeframe ?? '',
            t.scopeKey ?? '',
            t.scopeKeyVersion ?? '',
            t.scopeComplete === true ? 'true' : 'false',
            t.pnlPerShare != null ? t.pnlPerShare.toFixed(4) : '',
            t.exitType ?? '',
            t.atrAtEntry != null ? t.atrAtEntry : '',
            t.regimeAtEntry ?? '',
            t.rsiAtEntry != null ? t.rsiAtEntry : '',
            t.confidenceContributors ?? '',
            t.mtfConfluenceSnapshot?.direction ?? '',
            t.mtfConfluenceSnapshot?.confluenceScore ?? t.mtfConfluenceSnapshot?.score ?? '',
            t.mtfConfluenceSnapshot?.confidence ?? '',
            Array.isArray(t.mtfConfluenceSnapshot?.readyTimeframes) ? t.mtfConfluenceSnapshot.readyTimeframes.join('|') : '',
            t.isPartialClose === true ? 'true' : 'false',
            t.partialFraction ?? '',
            t.frozenExitPolicy?.policyHash ?? ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        require('./AtomicWrite').writeStringAtomic(filepath, csv);
        console.log(`\nExported ${this.trades.length} trades to ${filepath}`);

        return filepath;
    }

    /**
     * Get comprehensive summary statistics
     */
    getSummary() {
        if (this.trades.length === 0) {
            return { totalTrades: 0, message: 'No trades recorded' };
        }

        const winners = this.trades.filter(t => t.netPnlDollars > 0);
        const losers = this.trades.filter(t => t.netPnlDollars < 0);
        const breakeven = this.trades.filter(t => t.netPnlDollars === 0);

        const totalPnl = this.trades.reduce((sum, t) => sum + t.netPnlDollars, 0);
        const totalFees = this.trades.reduce((sum, t) => sum + t.feesDollars, 0);

        const avgWinner = winners.length > 0
            ? winners.reduce((sum, t) => sum + t.netPnlDollars, 0) / winners.length
            : 0;
        const avgLoser = losers.length > 0
            ? losers.reduce((sum, t) => sum + t.netPnlDollars, 0) / losers.length
            : 0;

        const bestTrade = this.trades.reduce((best, t) =>
            t.netPnlDollars > best.netPnlDollars ? t : best, this.trades[0]);
        const worstTrade = this.trades.reduce((worst, t) =>
            t.netPnlDollars < worst.netPnlDollars ? t : worst, this.trades[0]);

        // Strategy breakdown
        const strategyStats = {};
        this.trades.forEach(t => {
            if (!strategyStats[t.strategyName]) {
                strategyStats[t.strategyName] = { wins: 0, losses: 0, pnl: 0, count: 0 };
            }
            strategyStats[t.strategyName].count++;
            strategyStats[t.strategyName].pnl += t.netPnlDollars;
            if (t.netPnlDollars > 0) strategyStats[t.strategyName].wins++;
            else if (t.netPnlDollars < 0) strategyStats[t.strategyName].losses++;
        });

        // Exit reason breakdown
        const exitStats = {};
        this.trades.forEach(t => {
            if (!exitStats[t.exitReason]) {
                exitStats[t.exitReason] = { count: 0, pnl: 0 };
            }
            exitStats[t.exitReason].count++;
            exitStats[t.exitReason].pnl += t.netPnlDollars;
        });

        // Calculate streaks
        let currentLosingStreak = 0;
        let maxLosingStreak = 0;
        let currentWinningStreak = 0;
        let maxWinningStreak = 0;
        this.trades.forEach(t => {
            if (t.netPnlDollars < 0) {
                currentLosingStreak++;
                currentWinningStreak = 0;
                if (currentLosingStreak > maxLosingStreak) maxLosingStreak = currentLosingStreak;
            } else if (t.netPnlDollars > 0) {
                currentWinningStreak++;
                currentLosingStreak = 0;
                if (currentWinningStreak > maxWinningStreak) maxWinningStreak = currentWinningStreak;
            }
        });

        return {
            // Core metrics
            totalTrades: this.trades.length,
            winners: winners.length,
            losers: losers.length,
            breakeven: breakeven.length,
            winRate: (winners.length / this.trades.length * 100).toFixed(1),

            // P&L
            startingBalance: this.startingBalance,
            finalBalance: this.balance,
            netPnlDollars: totalPnl,
            netPnlPercent: ((this.balance - this.startingBalance) / this.startingBalance * 100).toFixed(2),
            totalFeesPaid: totalFees,

            // Averages
            avgWinnerDollars: avgWinner,
            avgLoserDollars: avgLoser,
            avgWinnerPercent: winners.length > 0
                ? (winners.reduce((sum, t) => sum + t.netPnlPercent, 0) / winners.length).toFixed(2)
                : 0,
            avgLoserPercent: losers.length > 0
                ? (losers.reduce((sum, t) => sum + t.netPnlPercent, 0) / losers.length).toFixed(2)
                : 0,

            // Risk
            maxDrawdownPercent: this.maxDrawdown.toFixed(2),
            maxDrawdownDollars: this.maxDrawdownDollars.toFixed(2),
            profitFactor: losers.length > 0
                ? (winners.reduce((sum, t) => sum + t.netPnlDollars, 0) / Math.abs(losers.reduce((sum, t) => sum + t.netPnlDollars, 0))).toFixed(2)
                : 'N/A',
            expectancy: this.trades.length > 0
                ? (((winners.length / this.trades.length) * avgWinner) + ((losers.length / this.trades.length) * avgLoser)).toFixed(2)
                : '0.00',
            maxLosingStreak,
            maxWinningStreak,

            // Extremes
            bestTrade: {
                number: bestTrade.tradeNumber,
                strategy: bestTrade.strategyName,
                pnl: bestTrade.netPnlDollars.toFixed(2)
            },
            worstTrade: {
                number: worstTrade.tradeNumber,
                strategy: worstTrade.strategyName,
                pnl: worstTrade.netPnlDollars.toFixed(2)
            },

            // Breakdowns
            strategyStats,
            exitStats
        };
    }

    /**
     * Print formatted summary to console
     */
    printSummary() {
        const s = this.getSummary();

        if (s.totalTrades === 0) {
            console.log('\n📊 BACKTEST SUMMARY: No trades recorded');
            return;
        }

        console.log('\n' + '═'.repeat(60));
        console.log('📊 BACKTEST SUMMARY (after 0.52% round-trip fees)');
        console.log('═'.repeat(60));

        console.log(`\n💰 ACCOUNT:`);
        console.log(`   Starting Balance:  $${s.startingBalance.toLocaleString()}`);
        console.log(`   Final Balance:     $${s.finalBalance.toLocaleString()}`);
        console.log(`   Net P&L:           ${s.netPnlDollars >= 0 ? '+' : ''}$${s.netPnlDollars.toFixed(2)} (${s.netPnlPercent}%)`);
        console.log(`   Total Fees Paid:   $${s.totalFeesPaid.toFixed(2)}`);

        console.log(`\n📈 PERFORMANCE:`);
        console.log(`   Total Trades:      ${s.totalTrades}`);
        console.log(`   Win Rate:          ${s.winRate}% (${s.winners}W / ${s.losers}L)`);
        console.log(`   Avg Winner:        +$${s.avgWinnerDollars.toFixed(2)} (+${s.avgWinnerPercent}%)`);
        console.log(`   Avg Loser:         $${s.avgLoserDollars.toFixed(2)} (${s.avgLoserPercent}%)`);
        console.log(`   Profit Factor:     ${s.profitFactor}`);
        console.log(`   Expectancy:        ${String(s.expectancy).startsWith('-') ? '' : '+'}$${s.expectancy} per trade`);

        console.log(`\n⚠️  RISK:`);
        console.log(`   Max Drawdown:      ${s.maxDrawdownPercent}% ($${s.maxDrawdownDollars})`);
        console.log(`   Losing Streak:     ${s.maxLosingStreak} trades`);
        console.log(`   Winning Streak:    ${s.maxWinningStreak} trades`);
        console.log(`   Best Trade:        #${s.bestTrade.number} ${s.bestTrade.strategy} +$${s.bestTrade.pnl}`);
        console.log(`   Worst Trade:       #${s.worstTrade.number} ${s.worstTrade.strategy} $${s.worstTrade.pnl}`);

        console.log(`\n🎯 BY STRATEGY:`);
        Object.entries(s.strategyStats).forEach(([name, stats]) => {
            const winRate = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 0;
            console.log(`   ${name}: ${stats.count} trades | ${winRate}% WR | ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`);
        });

        console.log(`\n🚪 BY EXIT REASON:`);
        Object.entries(s.exitStats).forEach(([reason, stats]) => {
            console.log(`   ${reason}: ${stats.count} trades | ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`);
        });

        console.log('\n' + '═'.repeat(60));
    }

    /**
     * Get detailed info about a specific trade
     * @param {number} tradeNumber - Trade number (1-indexed)
     */
    getTradeDetails(tradeNumber) {
        const trade = this.trades.find(t => t.tradeNumber === tradeNumber);

        if (!trade) {
            return { error: `Trade #${tradeNumber} not found. Total trades: ${this.trades.length}` };
        }

        console.log('\n' + '─'.repeat(50));
        console.log(`🔍 TRADE #${tradeNumber} DEEP DIVE`);
        console.log('─'.repeat(50));

        console.log(`\n📋 BASIC INFO:`);
        console.log(`   Strategy:     ${trade.strategyName}`);
        console.log(`   Direction:    ${trade.direction.toUpperCase()}`);
        console.log(`   Confidence:   ${trade.confidence.toFixed(1)}%`);
        console.log(`   Entry Time:   ${trade.entryTime}`);
        console.log(`   Exit Time:    ${trade.exitTime}`);
        console.log(`   Hold Time:    ${trade.holdTimeMinutes.toFixed(1)} minutes`);

        console.log(`\n💵 PRICES:`);
        console.log(`   Entry Price:  $${trade.entryPrice.toFixed(2)}`);
        console.log(`   Exit Price:   $${trade.exitPrice.toFixed(2)}`);
        console.log(`   Stop Loss:    ${trade.stopLoss}%`);
        console.log(`   Take Profit:  ${trade.takeProfit}%`);

        console.log(`\n💰 P&L:`);
        console.log(`   Raw P&L:      ${trade.rawPnlDollars >= 0 ? '+' : ''}$${trade.rawPnlDollars.toFixed(2)}`);
        console.log(`   Fees:         -$${trade.feesDollars.toFixed(2)}`);
        console.log(`   Net P&L:      ${trade.netPnlDollars >= 0 ? '+' : ''}$${trade.netPnlDollars.toFixed(2)} (${trade.netPnlPercent >= 0 ? '+' : ''}${trade.netPnlPercent.toFixed(2)}%)`);
        console.log(`   Balance:      $${trade.balanceBefore.toFixed(2)} → $${trade.balanceAfter.toFixed(2)}`);

        console.log(`\n🚪 EXIT:`);
        console.log(`   Reason:       ${trade.exitReason}`);
        console.log(`   Signal:       ${trade.reason}`);

        if (trade.entryCandle) {
            console.log(`\n🕯️ ENTRY CANDLE:`);
            console.log(`   O: ${trade.entryCandle.open} H: ${trade.entryCandle.high} L: ${trade.entryCandle.low} C: ${trade.entryCandle.close}`);
        }

        if (trade.exitCandle) {
            console.log(`\n🕯️ EXIT CANDLE:`);
            console.log(`   O: ${trade.exitCandle.open} H: ${trade.exitCandle.high} L: ${trade.exitCandle.low} C: ${trade.exitCandle.close}`);
        }

        if (trade.signalDetails) {
            console.log(`\n📊 SIGNAL DETAILS:`);
            console.log(`   ${JSON.stringify(trade.signalDetails, null, 2)}`);
        }

        console.log('─'.repeat(50));

        return trade;
    }

    /**
     * Reset for new backtest
     */
    reset() {
        this.balance = this.startingBalance;
        this.trades = [];
        this.peakBalance = this.startingBalance;
        this.maxDrawdown = 0;
        this.maxDrawdownDollars = 0;
    }
}

module.exports = BacktestRecorder;
