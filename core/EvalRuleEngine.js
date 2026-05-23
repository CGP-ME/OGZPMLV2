'use strict';

const { getInstance: getMarketCalendar } = require('../foundation/MarketCalendar');

class EvalRuleEngine {
  constructor({ config = {}, getCandles, now = () => Date.now(), marketCalendar = getMarketCalendar() } = {}) {
    this.config = config || {};
    this.getCandles = getCandles;
    this.now = now;
    this.marketCalendar = marketCalendar;
    this.openingVolumeReservations = new Map();
  }

  async check(entryPlan) {
    if (!entryPlan) {
      return { allowed: true, reason: 'not_entry' };
    }

    const identity = this._identity(entryPlan);

    if (this.config.enabled !== true) {
      return { allowed: true, reason: 'eval_rules_disabled', passedRules: [], failedRules: [], ...identity };
    }

    if (this.config.ttp?.enabled !== true) {
      return { allowed: true, reason: 'ttp_rules_disabled', passedRules: [], failedRules: [], ...identity };
    }

    const passedRules = [];
    const marketTimeResult = this._checkTtpMarketTime(entryPlan);
    if (marketTimeResult.allowed === false) {
      return {
        allowed: false,
        failedRules: [marketTimeResult.failure],
        passedRules,
        inputs: { ...identity, ...marketTimeResult.inputs },
        ...identity,
      };
    }
    if (marketTimeResult.inputs?.enabled !== false) {
      passedRules.push('TTP_MARKET_TIME');
    }

    const result = this._checkTtpVolumeCap(entryPlan);
    if (result.allowed === false) {
      return {
        allowed: false,
        failedRules: [result.failure],
        passedRules,
        inputs: { ...identity, ...result.inputs },
        ...identity,
      };
    }
    if (result.inputs?.enabled !== false) {
      passedRules.push('TTP_VOLUME_5_PERCENT');
    }

    return {
      allowed: true,
      failedRules: [],
      passedRules,
      inputs: { ...identity, ...result.inputs },
      ...identity,
    };
  }

  _identity(entryPlan) {
    return {
      traceId: entryPlan.traceId || null,
      signalId: entryPlan.signalId || entryPlan.decisionId || null,
      symbol: entryPlan.symbol || null,
    };
  }

  getTtpMarketTimeState(date = new Date(this.now())) {
    const cfg = this.config.ttp?.marketTime || {};
    if (cfg.enabled !== true) {
      return { enabled: false, ruleId: 'TTP_MARKET_TIME' };
    }

    const currentDate = date instanceof Date ? date : new Date(date);
    const phase = this.marketCalendar.getMarketPhase(currentDate);
    const et = this.marketCalendar.getNYTimeParts(currentDate);
    const cutoffMinutesBeforeClose = cfg.cutoffMinutesBeforeClose;
    const cutoffMinute = phase.rthCloseMinute - cutoffMinutesBeforeClose;
    const inLiquidationWindow = phase.isRTH === true
      && et.minuteOfDay >= cutoffMinute
      && et.minuteOfDay < phase.rthCloseMinute;

    return {
      enabled: true,
      ruleId: 'TTP_MARKET_TIME',
      currentDateET: et.date,
      currentMinuteET: et.minuteOfDay,
      cutoffMinute,
      cutoffMinutesBeforeClose,
      rthCloseMinute: phase.rthCloseMinute,
      phase: phase.phase,
      isRTH: phase.isRTH,
      inLiquidationWindow,
      blockEntriesAfterCutoff: cfg.blockEntriesAfterCutoff !== false,
      liquidationEnabled: cfg.liquidationEnabled !== false,
    };
  }

  _checkTtpMarketTime(entryPlan) {
    const cfg = this.config.ttp?.marketTime || {};
    if (cfg.enabled !== true || cfg.blockEntriesAfterCutoff === false) {
      return { allowed: true, inputs: { ruleId: 'TTP_MARKET_TIME', enabled: false } };
    }

    const state = this.getTtpMarketTimeState(new Date(this.now()));
    if (state.inLiquidationWindow) {
      return this._fail('TTP_MARKET_TIME', 'liquidation_window_no_openings', {
        symbol: entryPlan.symbol,
        currentDateET: state.currentDateET,
        currentMinuteET: state.currentMinuteET,
        cutoffMinute: state.cutoffMinute,
        rthCloseMinute: state.rthCloseMinute,
        phase: state.phase,
      });
    }

    return { allowed: true, inputs: state };
  }

  _checkTtpVolumeCap(entryPlan) {
    const cfg = this.config.ttp?.volumeCap || {};
    if (cfg.enabled !== true) {
      return { allowed: true, inputs: { ruleId: 'TTP_VOLUME_5_PERCENT', enabled: false } };
    }

    const timeframe = cfg.timeframe;
    const percent = cfg.percent;
    const maxReferenceAgeMs = cfg.maxReferenceAgeMs;

    if (timeframe !== '1m') {
      return this._fail('TTP_VOLUME_5_PERCENT', 'invalid_timeframe_config', {
        configuredTimeframe: timeframe,
      });
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 1) {
      return this._fail('TTP_VOLUME_5_PERCENT', 'invalid_percent_config', {
        configuredPercent: percent,
      });
    }
    if (!Number.isFinite(maxReferenceAgeMs) || maxReferenceAgeMs <= 0) {
      return this._fail('TTP_VOLUME_5_PERCENT', 'invalid_reference_age_config', {
        configuredMaxReferenceAgeMs: maxReferenceAgeMs,
      });
    }
    if (entryPlan.quantityUnit !== 'shares') {
      return this._fail('TTP_VOLUME_5_PERCENT', 'non_share_quantity', {
        quantityUnit: entryPlan.quantityUnit,
        assetClass: entryPlan.assetClass,
      });
    }

    const proposedShares = Number(entryPlan.orderQuantity);
    if (!Number.isFinite(proposedShares) || proposedShares <= 0) {
      return this._fail('TTP_VOLUME_5_PERCENT', 'invalid_order_quantity', {
        proposedShares: entryPlan.orderQuantity,
      });
    }

    if (typeof this.getCandles !== 'function') {
      return this._fail('TTP_VOLUME_5_PERCENT', 'missing_candle_source', {
        symbol: entryPlan.symbol,
        timeframe,
      });
    }

    const candles = this.getCandles(entryPlan.symbol, timeframe) || [];
    const referenceResult = this._findReferenceCandle(candles, cfg.fallbackToMostRecentVolume !== false, maxReferenceAgeMs);
    if (!referenceResult.reference) {
      return this._fail('TTP_VOLUME_5_PERCENT', referenceResult.reason || 'missing_reference_volume', {
        symbol: entryPlan.symbol,
        timeframe,
        candlesAvailable: Array.isArray(candles) ? candles.length : 0,
        ...referenceResult.inputs,
      });
    }
    const reference = referenceResult.reference;

    const previousOneMinuteVolume = this._volume(reference.candle);
    const maxAllowedShares = previousOneMinuteVolume * percent;
    const key = this._reservationKey(entryPlan.symbol, reference.timeMs);
    const alreadyReservedShares = this.openingVolumeReservations.get(key) || 0;
    const projectedShares = alreadyReservedShares + proposedShares;
    const inputs = {
      ruleId: 'TTP_VOLUME_5_PERCENT',
      symbol: entryPlan.symbol,
      timeframe,
      percent,
      referenceCandleTimeMs: reference.timeMs,
      previousOneMinuteVolume,
      maxAllowedShares,
      proposedShares,
      alreadyReservedShares,
      projectedShares,
    };

    if (projectedShares > maxAllowedShares) {
      return this._fail('TTP_VOLUME_5_PERCENT', 'volume_cap_exceeded', inputs);
    }

    this._pruneReservations(entryPlan.symbol, reference.timeMs);
    this.openingVolumeReservations.set(key, projectedShares);

    return { allowed: true, inputs };
  }

  _findReferenceCandle(candles, fallbackToMostRecentVolume, maxReferenceAgeMs) {
    if (!Array.isArray(candles) || candles.length === 0) {
      return { reason: 'missing_reference_volume', inputs: {} };
    }

    const nowMs = Number(this.now());
    const candidates = candles
      .map(candle => ({ candle, timeMs: this._candleTimeMs(candle) }))
      .filter(item => Number.isFinite(item.timeMs))
      .filter(item => !Number.isFinite(nowMs) || item.timeMs <= nowMs)
      .sort((a, b) => a.timeMs - b.timeMs);

    if (candidates.length === 0) {
      return { reason: 'missing_reference_volume', inputs: { nowMs } };
    }

    const latest = candidates[candidates.length - 1];
    if (Number.isFinite(nowMs) && nowMs - latest.timeMs > maxReferenceAgeMs) {
      return {
        reason: 'stale_reference_volume',
        inputs: {
          nowMs,
          latestCandleTimeMs: latest.timeMs,
          maxReferenceAgeMs,
        },
      };
    }

    if (this._volume(latest.candle) > 0 || fallbackToMostRecentVolume !== true) {
      return this._volume(latest.candle) > 0
        ? { reference: latest }
        : { reason: 'missing_reference_volume', inputs: { nowMs, latestCandleTimeMs: latest.timeMs } };
    }

    for (let i = candidates.length - 2; i >= 0; i -= 1) {
      if (this._volume(candidates[i].candle) > 0) {
        return { reference: candidates[i] };
      }
    }

    return { reason: 'missing_reference_volume', inputs: { nowMs, latestCandleTimeMs: latest.timeMs } };
  }

  _candleTimeMs(candle) {
    const value = candle?.etime ?? candle?.endTime ?? candle?.closeTime ?? candle?.timestamp ?? candle?.time ?? candle?.t;
    if (!Number.isFinite(Number(value))) return null;
    const numeric = Number(value);
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  _volume(candle) {
    const volume = Number(candle?.volume ?? candle?.v);
    return Number.isFinite(volume) ? volume : 0;
  }

  _reservationKey(symbol, timeMs) {
    return `${String(symbol || '').trim().toUpperCase()}:${timeMs}`;
  }

  _pruneReservations(symbol, referenceTimeMs) {
    const prefix = `${String(symbol || '').trim().toUpperCase()}:`;
    for (const key of this.openingVolumeReservations.keys()) {
      if (!key.startsWith(prefix)) continue;
      const timeMs = Number(key.slice(prefix.length));
      if (Number.isFinite(timeMs) && timeMs < referenceTimeMs - 24 * 60 * 60 * 1000) {
        this.openingVolumeReservations.delete(key);
      }
    }
  }

  _fail(ruleId, reason, inputs = {}) {
    return {
      allowed: false,
      failure: {
        ruleId,
        reason,
        action: 'BLOCK_ORDER',
        ...inputs,
      },
      inputs: {
        ruleId,
        ...inputs,
      },
    };
  }
}

module.exports = EvalRuleEngine;
