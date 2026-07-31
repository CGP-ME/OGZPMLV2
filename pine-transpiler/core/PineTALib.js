// core/PineTALib.js
const { IndicatorCalculator } = require('../../core/IndicatorCalculator');

class PineTALib {
  // Simple moving average
  static sma(series, length) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    const sum = series.slice(-length).reduce((a, b) => a + b, 0);
    return sum / length;
  }

  // Exponential moving average
  static ema(series, length) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    const k = 2 / (length + 1);
    let ema = this.sma(series.slice(0, length), length);
    for (let i = length; i < series.length; i++) {
      ema = series[i] * k + ema * (1 - k);
    }
    return ema;
  }

  static emaSeries(series, length) {
    const values = new Array(Array.isArray(series) ? series.length : 0).fill(null);
    if (length <= 0 || !Array.isArray(series) || series.length < length) return values;

    const k = 2 / (length + 1);
    let ema = this.sma(series.slice(0, length), length);
    values[length - 1] = ema;

    for (let i = length; i < series.length; i++) {
      ema = series[i] * k + ema * (1 - k);
      values[i] = ema;
    }

    return values;
  }

  // Relative Strength Index
  static rsi(series, length) {
    if (length <= 0) return null;
    return IndicatorCalculator.calculateWilderRSIFromCloses(series, length);
  }

  // Average True Range - delegates to the shared Wilder RMA export
  static atr(high, low, close, length) {
    if (length <= 0) return null;
    if (!Array.isArray(high) || !Array.isArray(low) || !Array.isArray(close)) return null;
    if (high.length < length) return null;
    const candles = high.map((h, i) => ({ high: h, low: low[i], close: close[i] }));
    // TV counts the first bar's TR as high-low (na prev close). The shared
    // export derives TR from candle pairs, so a seed candle whose close sits
    // at high[0] collapses that pair's TR to exactly high[0]-low[0].
    candles.unshift({ high: high[0], low: high[0], close: high[0] });
    return IndicatorCalculator.calculateWilderATR(candles, length);
  }

  // Weighted moving average - TV: weight length for the newest value down
  // to 1 for the oldest, denominator length*(length+1)/2, na until a full
  // window exists.
  static wma(series, length) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    const window = series.slice(-length);
    let weighted = 0;
    for (let i = 0; i < length; i++) {
      weighted += window[i] * (i + 1);
    }
    return weighted / ((length * (length + 1)) / 2);
  }

  // Wilder smoothing (TV ta.rma): seed SMA(length), then
  // rma = (prev * (length-1) + value) / length. na until seeded.
  static rma(series, length) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    let rma = this.sma(series.slice(0, length), length);
    for (let i = length; i < series.length; i++) {
      rma = (rma * (length - 1) + series[i]) / length;
    }
    return rma;
  }

  // Linear regression curve - least squares over the last `length` values
  // with x = 0 (oldest) .. length-1 (newest).
  // TV: value = intercept + slope * (length - 1 - offset).
  static linreg(series, length, offset = 0) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    const window = series.slice(-length);
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < length; i++) {
      sumX += i;
      sumY += window[i];
      sumXY += i * window[i];
      sumX2 += i * i;
    }
    const denom = length * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (length * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / length;
    return intercept + slope * (length - 1 - (offset || 0));
  }

  // Stochastic %K - TV ta.stoch(source, high, low, length):
  // 100 * (source - lowest(low, length)) / (highest(high, length) - lowest(low, length))
  static stoch(source, high, low, length) {
    if (length <= 0) return null;
    if (!Array.isArray(source) || !Array.isArray(high) || !Array.isArray(low)) return null;
    if (source.length < 1 || high.length < length || low.length < length) return null;
    const hh = Math.max(...high.slice(-length));
    const ll = Math.min(...low.slice(-length));
    if (hh === ll) return null;
    return (100 * (source[source.length - 1] - ll)) / (hh - ll);
  }

  // TV ta.cross(a, b): a crossing over OR under b on this bar.
  static cross(seriesA, seriesB) {
    return this.crossover(seriesA, seriesB) || this.crossunder(seriesA, seriesB);
  }

  static macd(series, fastLength = 12, slowLength = 26, signalLength = 9) {
    if (!Array.isArray(series) || fastLength <= 0 || slowLength <= 0 || signalLength <= 0) {
      return [null, null, null];
    }

    const fast = this.emaSeries(series, fastLength);
    const slow = this.emaSeries(series, slowLength);
    const macdSeries = series.map((_, index) => (
      fast[index] === null || slow[index] === null ? null : fast[index] - slow[index]
    ));
    const validMacd = macdSeries.filter((value) => value !== null);
    const signalSeries = this.emaSeries(validMacd, signalLength);

    const macdLine = macdSeries[macdSeries.length - 1] ?? null;
    const signalLine = signalSeries[signalSeries.length - 1] ?? null;
    const histogram = macdLine === null || signalLine === null ? null : macdLine - signalLine;

    return [macdLine, signalLine, histogram];
  }

  // Highest value in a look-back window
  static highest(series, lookback) {
    if (lookback <= 0) return null;
    if (!Array.isArray(series) || series.length < lookback) return null;
    return Math.max(...series.slice(-lookback));
  }

  // Lowest value in a look-back window
  static lowest(series, lookback) {
    if (lookback <= 0) return null;
    if (!Array.isArray(series) || series.length < lookback) return null;
    return Math.min(...series.slice(-lookback));
  }

  // Standard deviation
  static stdev(series, length) {
    if (length <= 0) return null;
    if (!Array.isArray(series) || series.length < length) return null;
    const mean = this.sma(series, length);
    const variance = series
      .slice(-length)
      .reduce((a, b) => a + Math.pow(b - mean, 2), 0) / length;
    return Math.sqrt(variance);
  }

  // VWAP - weighted source by volume
  static vwap(source, volume) {
    if (!Array.isArray(source) || !Array.isArray(volume)) return null;
    let cumPV = 0,
      cumVol = 0;
    for (let i = 0; i < source.length; i++) {
      const vol = volume[i];
      if (vol === undefined) return null;
      cumPV += source[i] * vol;
      cumVol += vol;
    }
    return cumVol === 0 ? null : cumPV / cumVol;
  }

  // Crossover / crossunder helpers
  static crossover(seriesA, seriesB) {
    const len = seriesA.length;
    if (len < 2) return false;
    return seriesA[len - 2] <= seriesB[len - 2] && seriesA[len - 1] > seriesB[len - 1];
  }

  static crossunder(seriesA, seriesB) {
    const len = seriesA.length;
    if (len < 2) return false;
    return seriesA[len - 2] >= seriesB[len - 2] && seriesA[len - 1] < seriesB[len - 1];
  }
}

module.exports = PineTALib;
