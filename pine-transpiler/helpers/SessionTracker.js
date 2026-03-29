// helpers/SessionTracker.js
/**
 * Bridges Pine Script's time() and session() functions.
 * Handles EST conversions, Cash Session (RTH) gates, and IVB formation.
 */
class SessionTracker {
  constructor() {
    this.currentDay = -1;
    this.ivbHigh = null;
    this.ivbLow = null;
    this.ivbLocked = false;
    this.ivbBarCount = 0;
    this.dailyLosses = 0;
  }

  // Converts UTC candle timestamp to New York time
  getESTTime(timestamp) {
    return new Date(timestamp).toLocaleString("en-US", { timeZone: "America/New_York" });
  }

  update(candle, ivbMinutesTarget = 30, timeframeMinutes = 15) {
    const estDate = new Date(this.getESTTime(candle.timestamp));
    const hours = estDate.getHours();
    const minutes = estDate.getMinutes();
    const dayOfWeek = estDate.getDay();
    const decimalTime = hours + (minutes / 60);

    // 1. New Day Reset (Circuit breakers & IVB clear)
    if (dayOfWeek !== this.currentDay) {
      this.currentDay = dayOfWeek;
      this.ivbHigh = candle.high;
      this.ivbLow = candle.low;
      this.ivbLocked = false;
      this.ivbBarCount = 1;
      this.dailyLosses = 0; // Reset circuit breaker
    }

    // 2. Cash Session Check (09:30 to 16:00 EST)
    const isCashSession = decimalTime >= 9.5 && decimalTime < 16.0;

    // 3. Session Edge Filter (Filter first/last candle distortions)
    const isValidTradingSession = decimalTime >= 9.75 && decimalTime < 15.75;

    // 4. Build IVB (Initial Balance)
    const ivbBarsNeeded = Math.round(ivbMinutesTarget / timeframeMinutes);
    if (isCashSession && !this.ivbLocked) {
      this.ivbBarCount++;
      if (candle.high > this.ivbHigh) this.ivbHigh = candle.high;
      if (candle.low < this.ivbLow) this.ivbLow = candle.low;

      if (this.ivbBarCount >= ivbBarsNeeded) {
        this.ivbLocked = true;
      }
    }

    return {
      isCashSession,
      isValidTradingSession,
      ivb: {
        locked: this.ivbLocked,
        high: this.ivbHigh,
        low: this.ivbLow,
        mid: this.ivbLocked ? (this.ivbHigh + this.ivbLow) / 2 : null
      }
    };
  }

  recordDailyLoss() {
    this.dailyLosses++;
  }

  canTrade(maxDailyLosses = 3) {
    return this.dailyLosses < maxDailyLosses;
  }
}

module.exports = SessionTracker;
