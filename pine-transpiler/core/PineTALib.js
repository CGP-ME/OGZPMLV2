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

  // Average True Range
  static atr(high, low, close, length) {
    if (length <= 0) return null;
    const tr = [];
    for (let i = 1; i < high.length; i++) {
      const val1 = high[i] - low[i];
      const val2 = Math.abs(high[i] - close[i - 1]);
      const val3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(val1, val2, val3));
    }
    return this.sma(tr, length);
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
