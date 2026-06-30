'use strict';

const { getInstance: getMarketCalendar } = require('../foundation/MarketCalendar');

class EvalRuleEngine {
  constructor({ config = {}, getCandles, getEarningsStatus, getCutoffQuarantine, now = () => Date.now(), marketCalendar = getMarketCalendar() } = {}) {
    this.config = config || {};
    this.getCandles = getCandles;
    this.getEarningsStatus = getEarningsStatus;
    this.getCutoffQuarantine = getCutoffQuarantine;
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
    const inputs = { ...identity };
    const quarantineResult = this._checkTtpCutoffQuarantine(entryPlan);
    Object.assign(inputs, quarantineResult.inputs || {});
    if (quarantineResult.allowed === false) {
      return {
        allowed: false,
        failedRules: [quarantineResult.failure],
        passedRules,
        inputs,
        ...identity,
      };
    }

    const marketTimeResult = this._checkTtpMarketTime(entryPlan);
    Object.assign(inputs, marketTimeResult.inputs || {});
    if (marketTimeResult.allowed === false) {
      return {
        allowed: false,
        failedRules: [marketTimeResult.failure],
        passedRules,
        inputs,
        ...identity,
      };
    }
    if (marketTimeResult.inputs?.enabled !== false) {
      passedRules.push('TTP_MARKET_TIME');
    }

    const earningsResult = await this._checkTtpEarningsRestriction(entryPlan);
    Object.assign(inputs, earningsResult.inputs || {});
    if (earningsResult.allowed === false) {
      return {
        allowed: false,
        failedRules: [earningsResult.failure],
        passedRules,
        inputs,
        ...identity,
      };
    }
    if (earningsResult.inputs?.enabled !== false && earningsResult.inputs?.calendarContributed !== false) {
      passedRules.push('TTP_EARNINGS_RESTRICTION');
    }

    const accountLimitsResult = this._checkTtpAccountLimits(entryPlan);
    Object.assign(inputs, accountLimitsResult.inputs || {});
    if (accountLimitsResult.allowed === false) {
      return {
        allowed: false,
        failedRules: [accountLimitsResult.failure],
        passedRules,
        inputs,
        ...identity,
      };
    }
    if (Array.isArray(accountLimitsResult.passedRules)) {
      passedRules.push(...accountLimitsResult.passedRules);
    }

    const result = this._checkTtpVolumeCap(entryPlan);
    Object.assign(inputs, result.inputs || {});
    if (result.allowed === false) {
      return {
        allowed: false,
        failedRules: [result.failure],
        passedRules,
        inputs,
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
      inputs,
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

  _checkTtpCutoffQuarantine(entryPlan) {
    if (typeof this.getCutoffQuarantine !== 'function') {
      return { allowed: true, inputs: { ruleId: 'TTP_CUTOFF_RECONCILIATION', enabled: false } };
    }

    const quarantine = this.getCutoffQuarantine();
    if (!quarantine || typeof quarantine !== 'object') {
      return { allowed: true, inputs: { ruleId: 'TTP_CUTOFF_RECONCILIATION', enabled: false } };
    }

    const manualRequired = quarantine.manualReconciliationRequired === true
      || quarantine.requiresManualReconciliation === true;
    const flatVerified = quarantine.brokerFlatVerified === true;
    if (manualRequired && !flatVerified) {
      return this._fail('TTP_CUTOFF_RECONCILIATION', 'manual_reconciliation_required_no_openings', {
        symbol: entryPlan.symbol,
        source: quarantine.source || null,
        status: quarantine.status || null,
        currentDateET: quarantine.currentDateET || null,
        brokerFlatVerified: false,
        manualReconciliationRequired: true,
        entryBlocking: true,
      });
    }

    return {
      allowed: true,
      inputs: {
        ruleId: 'TTP_CUTOFF_RECONCILIATION',
        enabled: true,
        brokerFlatVerified: flatVerified,
        manualReconciliationRequired: manualRequired,
      },
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
    const blocksNewEntries = cfg.blockEntriesAfterCutoff !== false && (
      phase.isRTH !== true || et.minuteOfDay >= cutoffMinute
    );

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
      blocksNewEntries,
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
    if (state.blocksNewEntries) {
      return this._fail('TTP_MARKET_TIME', state.isRTH ? 'after_cutoff_no_openings' : 'outside_regular_session_no_openings', {
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

  async _checkTtpEarningsRestriction(entryPlan) {
    const cfg = this.config.ttp?.earningsRestriction || {
      enabled: true,
      blockEntries: true,
    };
    const currentDateET = this.marketCalendar.getNYTimeParts(new Date(this.now())).date;
    const baseInputs = {
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      symbol: entryPlan.symbol,
      currentDateET,
    };
    if (cfg.enabled !== true) {
      return this._quarantineCalendarLane({
        ...baseInputs,
        enabled: false,
        reason: 'earnings_restriction_disabled',
      });
    }
    if (cfg.blockEntries !== true) {
      return this._quarantineCalendarLane({
        ...baseInputs,
        blockEntries: cfg.blockEntries,
        reason: 'earnings_block_entries_disabled',
      });
    }
    let statusResult;
    try {
      statusResult = await this._resolveEarningsStatus(entryPlan, currentDateET);
    } catch (error) {
      return this._quarantineCalendarLane({
        ...baseInputs,
        statusSource: 'provider',
        error: error.message,
        reason: 'earnings_status_error',
      });
    }

    const inputs = {
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      symbol: entryPlan.symbol,
      currentDateET,
      statusSource: statusResult.source,
      hasEarningsTonight: statusResult.hasEarningsTonight,
      blockEntries: cfg.blockEntries !== false,
    };

    if (statusResult.known !== true) {
      return this._quarantineCalendarLane({
        ...inputs,
        statusKnown: false,
        reason: 'earnings_status_unknown',
      });
    }

    if (cfg.blockEntries !== false && statusResult.hasEarningsTonight === true) {
      return this._fail('TTP_EARNINGS_RESTRICTION', 'earnings_tonight_no_openings', inputs);
    }

    return { allowed: true, inputs };
  }

  _quarantineCalendarLane(inputs) {
    return {
      allowed: true,
      inputs: {
        ...inputs,
        statusKnown: false,
        calendarLaneStatus: 'quarantined',
        calendarContributed: false,
        calendarMemoryWriteAllowed: false,
        policy: 'calendar_lane_quarantined_does_not_block_bot',
      },
    };
  }

  _checkTtpAccountLimits(entryPlan) {
    const cfg = this.config.ttp?.accountLimits || {};
    if (cfg.enabled !== true) {
      return { allowed: true, inputs: { ruleId: 'TTP_ACCOUNT_LIMITS', enabled: false }, passedRules: [] };
    }

    const currentEquity = Number(entryPlan.currentEquity ?? entryPlan.accountEquity);
    const accountStartOfDayEquity = Number(cfg.accountStartOfDayEquity);
    const dailyLossDollars = Number(cfg.dailyLossDollars);
    const maxLossThresholdEquity = Number(cfg.maxLossThresholdEquity);
    const enforceDailyLossPause = cfg.enforceDailyLossPause !== false;
    const enforceMaxLoss = cfg.enforceMaxLoss !== false;
    const accountStartOfDayDate = cfg.accountStartOfDayDate || null;
    const currentDateET = this.marketCalendar.getNYTimeParts(new Date(this.now())).date;
    const dailyPauseThreshold = accountStartOfDayEquity - dailyLossDollars;
    const inputs = {
      ruleId: 'TTP_ACCOUNT_LIMITS',
      symbol: entryPlan.symbol,
      currentEquity,
      accountStartOfDayDate,
      currentDateET,
      accountStartOfDayEquity,
      dailyLossDollars,
      dailyPauseThreshold,
      maxLossThresholdEquity,
      enforceDailyLossPause,
      enforceMaxLoss,
    };

    if (!Number.isFinite(currentEquity)) {
      return this._fail('TTP_ACCOUNT_LIMITS', 'missing_current_equity', inputs);
    }

    const passedRules = [];
    if (enforceMaxLoss) {
      if (!Number.isFinite(maxLossThresholdEquity) || maxLossThresholdEquity <= 0) {
        return this._fail('TTP_MAX_LOSS', 'invalid_max_loss_config', inputs);
      }
      if (currentEquity <= maxLossThresholdEquity) {
        return this._fail('TTP_MAX_LOSS', 'max_loss_threshold_reached', inputs);
      }
      passedRules.push('TTP_MAX_LOSS');
    }

    if (enforceDailyLossPause) {
      if (accountStartOfDayDate !== currentDateET) {
        Object.assign(inputs, {
          reason: 'stale_start_of_day_equity',
          dailyLossPauseStatus: 'quarantined',
          dailyLossPauseContributed: false,
          policy: 'stale_daily_loss_pause_does_not_block_bot',
        });
      } else if (!Number.isFinite(accountStartOfDayEquity) || accountStartOfDayEquity <= 0 || !Number.isFinite(dailyLossDollars) || dailyLossDollars <= 0) {
        return this._fail('TTP_DAILY_LOSS_PAUSE', 'invalid_daily_loss_config', inputs);
      } else if (currentEquity <= dailyPauseThreshold) {
        return this._fail('TTP_DAILY_LOSS_PAUSE', 'daily_loss_pause_reached', inputs);
      } else {
        passedRules.push('TTP_DAILY_LOSS_PAUSE');
      }
    }

    return { allowed: true, inputs, passedRules };
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

  async _resolveEarningsStatus(entryPlan, currentDateET) {
    const manualStatus = this._resolveManualEarningsStatus(entryPlan.symbol, currentDateET);
    if (manualStatus) {
      return manualStatus;
    }

    if (typeof entryPlan.hasEarningsTonight === 'boolean') {
      return {
        known: true,
        hasEarningsTonight: entryPlan.hasEarningsTonight,
        source: 'entryPlan.hasEarningsTonight',
      };
    }
    if (typeof entryPlan.earningsTonight === 'boolean') {
      return {
        known: true,
        hasEarningsTonight: entryPlan.earningsTonight,
        source: 'entryPlan.earningsTonight',
      };
    }
    if (typeof entryPlan.earnings?.hasEarningsTonight === 'boolean') {
      return {
        known: true,
        hasEarningsTonight: entryPlan.earnings.hasEarningsTonight,
        source: 'entryPlan.earnings.hasEarningsTonight',
      };
    }

    if (typeof this.getEarningsStatus === 'function') {
      const status = await this.getEarningsStatus(entryPlan.symbol, currentDateET, entryPlan);
      if (typeof status === 'boolean') {
        return { known: true, hasEarningsTonight: status, source: 'provider.boolean' };
      }
      if (typeof status?.hasEarningsTonight === 'boolean') {
        return {
          known: true,
          hasEarningsTonight: status.hasEarningsTonight,
          source: status.source || 'provider.hasEarningsTonight',
        };
      }
      if (typeof status?.earningsTonight === 'boolean') {
        return {
          known: true,
          hasEarningsTonight: status.earningsTonight,
          source: status.source || 'provider.earningsTonight',
        };
      }
    }

    return { known: false, hasEarningsTonight: null, source: null };
  }

  _resolveManualEarningsStatus(symbol, currentDateET) {
    const manualStatus = this.config.ttp?.earningsRestriction?.manualStatus;
    if (!manualStatus || typeof manualStatus !== 'object' || Array.isArray(manualStatus)) {
      return null;
    }

    const source = 'config.ttp.earningsRestriction.manualStatus';
    const statusDate = String(manualStatus.date || '').trim();
    const symbols = manualStatus.symbols;
    if (statusDate !== currentDateET || !symbols || typeof symbols !== 'object' || Array.isArray(symbols)) {
      return { known: false, hasEarningsTonight: null, source };
    }

    const targetSymbol = String(symbol || '').trim().toUpperCase();
    for (const [configuredSymbol, hasEarningsTonight] of Object.entries(symbols)) {
      if (String(configuredSymbol || '').trim().toUpperCase() !== targetSymbol) continue;
      if (typeof hasEarningsTonight !== 'boolean') {
        return { known: false, hasEarningsTonight: null, source };
      }
      return {
        known: true,
        hasEarningsTonight,
        source: `${source}.${String(configuredSymbol).trim().toUpperCase()}`,
      };
    }

    return { known: false, hasEarningsTonight: null, source };
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
        ...inputs,
        ruleId,
        reason,
        action: 'BLOCK_ORDER',
      },
      inputs: {
        ...inputs,
        ruleId,
      },
    };
  }
}

module.exports = EvalRuleEngine;
