### Fix 27: Preserve indicator state when the latest candle is revised

**Status:** Final delivered shape; applied through recorded pipeline steps.

#### File 1: `core/indicators/IndicatorEngine.js`

**Line:** latest-candle state 1

**str_replace target:**

```js

    // Precreate series store (chart-friendly)
    this.series = this._blankSeries();
  }

  _blankState() {
```

**str_replace replacement:**

```js

    // Precreate series store (chart-friendly)
    this.series = this._blankSeries();

    // Snapshot of every mutable own field before the current latest candle.
    // A revision with that candle's timestamp restores this state, then applies
    // the revised candle through the existing incremental calculation path.
    this._latestCandleCheckpoint = null;
  }

  _blankState() {
```

#### File 2: `core/indicators/IndicatorEngine.js`

**Line:** latest-candle state 2

**str_replace target:**

```js

  updateCandle(c) {
    this._validateCandle(c);

    // append / roll
    this.candles.push(c);
```

**str_replace replacement:**

```js

  updateCandle(c) {
    this._validateCandle(c);

    const latest = this._lastCandle();
    if (latest && _t(latest) === _t(c)) {
      this._restoreLatestCandleCheckpoint();
    } else {
      this._latestCandleCheckpoint = this._captureLatestCandleCheckpoint();
    }

    // append / roll
    this.candles.push(c);
```

#### File 3: `core/indicators/IndicatorEngine.js`

**Line:** latest-candle state 3

**str_replace target:**

```js
    this.fib = { swing: null, levels: {} };
    this.trends = { up: null, down: null };
    this.series = this._blankSeries();
  }

  _validateCandle(candle) {
```

**str_replace replacement:**

```js
    this.fib = { swing: null, levels: {} };
    this.trends = { up: null, down: null };
    this.series = this._blankSeries();
    this._latestCandleCheckpoint = null;
  }

  _copyLatestCandleCheckpoint(source) {
    const mutableState = {};
    for (const key of Reflect.ownKeys(source)) {
      if (key === 'config' || key === '_latestCandleCheckpoint' || key === 'candles' || key === 'series') continue;
      mutableState[key] = source[key];
    }

    // Engine writes append, trim, or replace history containers; it does not mutate stored candle or render-point values.
    // Copy those containers while deep-cloning mutable accumulators so revisions cannot mutate the checkpoint.
    return {
      ...structuredClone(mutableState),
      candles: source.candles.slice(),
      series: {
        candles: source.series.candles.slice(),
        lines: new Map([...source.series.lines].map(([id, points]) => [id, points.slice()])),
        bands: new Map([...source.series.bands].map(([id, band]) => [id, {
          upper: band.upper.slice(),
          mid: band.mid.slice(),
          lower: band.lower.slice(),
        }])),
        panels: new Map([...source.series.panels].map(([id, points]) => [id, points.slice()])),
        markers: source.series.markers.slice(),
      },
    };
  }

  _captureLatestCandleCheckpoint() {
    return this._copyLatestCandleCheckpoint(this);
  }

  _restoreLatestCandleCheckpoint() {
    Object.assign(this, this._copyLatestCandleCheckpoint(this._latestCandleCheckpoint));
  }

  _validateCandle(candle) {
```
