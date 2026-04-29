/**
 * SymbolContext — per-symbol state container.
 *
 * Multi-Symbol Phase 4 (2026-04-29). Each actively-traded symbol gets one of
 * these. Owns:
 *   - priceHistory: array of 1m candles for THIS symbol only
 *   - indicatorEngine: RSI/EMA/ATR/MACD computed on this symbol's data
 *   - regimeDetector: persistent regime state for this symbol
 *   - regime: latest regime classification
 *
 * Created on demand by the bot when a symbol first receives data.
 * Reset by SessionRouter on venue swap (so cross-asset state doesn't leak).
 *
 * NOT a singleton. `Map<symbol, SymbolContext>` lives on the bot instance.
 *
 * Per-(symbol, timeframe) indicator instances will be added in Phase 5/6.
 * For Phase 4 each context owns ONE IndicatorEngine fed by its 1m stream;
 * higher timeframes are queried via the candleStore.
 *
 * Spec: ogz-meta/ledger/CC-SPEC-MULTI-SYMBOL-AND-MECHANICAL-STRATEGY.md (Phase 4)
 */

'use strict';

const IndicatorEngine = require('./indicators/IndicatorEngine');
const { RegimeDetector } = require('./RegimeDetector');

const DEFAULTS = Object.freeze({
  maxHistory: 500,
  warmupCandles: 3,
});

class SymbolContext {
  constructor(symbol, config = {}) {
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error('SymbolContext: symbol must be a non-empty string');
    }
    this.symbol = symbol;
    this.priceHistory = [];
    this.indicatorEngine = new IndicatorEngine({
      tf: '1m',
      symbol: symbol,
    });
    this.regimeDetector = new RegimeDetector(config.regimeConfig || {});
    this.regime = null;
    this.warmupComplete = false;

    this._maxHistory = config.maxHistory || DEFAULTS.maxHistory;
    this._warmupRequired = config.warmupCandles || DEFAULTS.warmupCandles;
  }

  /**
   * Add a 1m candle to this symbol's history and update indicators + regime.
   *
   * @param {Object} candle — canonical OHLCV+t form
   * @returns {boolean} true if newly inserted, false if same-etime update
   */
  ingestCandle(candle) {
    if (!candle || typeof candle !== 'object') return false;

    // Update-or-insert by etime (mirrors CandleStore.addCandle dedup semantic)
    const existingIndex = this.priceHistory.findIndex(c => c.etime === candle.etime);
    let isNew = true;
    if (existingIndex !== -1) {
      this.priceHistory[existingIndex] = candle;
      isNew = false;
    } else {
      // Smart insert: push if latest, splice if backfill
      const last = this.priceHistory[this.priceHistory.length - 1];
      if (!last || candle.etime > last.etime) {
        this.priceHistory.push(candle);
      } else {
        let insertIndex = 0;
        for (let i = this.priceHistory.length - 1; i >= 0; i--) {
          if (this.priceHistory[i].etime < candle.etime) {
            insertIndex = i + 1;
            break;
          }
        }
        this.priceHistory.splice(insertIndex, 0, candle);
      }
    }

    // Trim to max
    if (this.priceHistory.length > this._maxHistory) {
      this.priceHistory.splice(0, this.priceHistory.length - this._maxHistory);
    }

    // Update indicators (always, on both new candles and same-etime refines)
    this.indicatorEngine.updateCandle({
      t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v,
    });

    // Update regime (only on new candles; regime is candle-close-driven)
    if (isNew) {
      try {
        const snap = this.indicatorEngine.getSnapshot?.() || {};
        const indicators = snap.indicators || snap;
        this.regime = this.regimeDetector.detect?.(indicators, this.priceHistory) || this.regime;
      } catch (err) {
        // RegimeDetector is best-effort; don't take down candle ingestion
        // if its detect() throws on partial data.
      }

      if (!this.warmupComplete && this.priceHistory.length >= this._warmupRequired) {
        this.warmupComplete = true;
        console.log(`[SymbolContext] ${this.symbol} warmup complete (${this.priceHistory.length} candles)`);
      }
    }

    return isNew;
  }

  /**
   * Snapshot for strategy evaluation. Caller iterates symbols × timeframes
   * (Phase 6 scanner) and reads one of these per (symbol, tf) pair.
   */
  getSnapshot() {
    return {
      symbol: this.symbol,
      indicators: this.indicatorEngine.getSnapshot?.() || null,
      regime: this.regime,
      candles: this.priceHistory,
      warmupComplete: this.warmupComplete,
    };
  }

  /**
   * Full reset — called by SessionRouter on venue swap so cross-asset
   * state doesn't leak (TSLA's 200-candle EMA buffer doesn't bleed into
   * BTC's first crypto-session candles, etc.).
   */
  reset() {
    this.priceHistory.length = 0;
    if (typeof this.indicatorEngine.reset === 'function') {
      this.indicatorEngine.reset();
    }
    this.regime = null;
    this.warmupComplete = false;
    console.log(`[SymbolContext] ${this.symbol} reset`);
  }
}

module.exports = SymbolContext;
