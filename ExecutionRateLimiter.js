// CHANGE 657: Execution-level rate limiter - Codex recommended implementation
// Only limits ENTRIES, never blocks EXITS (critical for risk management)

class ExecutionRateLimiter {
  constructor({
    entryCooldownMs = 60000,      // 1 min between entries
    maxEntriesPerWindow = 5,      // max 5 entries...
    windowMs = 600000,            // ...per 10 minutes
    burstAllowed = 2,             // allow 2 fast entries then cooldown
  } = {}) {
    this.entryCooldownMs = entryCooldownMs;
    this.maxEntriesPerWindow = maxEntriesPerWindow;
    this.windowMs = windowMs;
    this.burstAllowed = burstAllowed;

    this.lastEntryAt = new Map();        // symbol -> timestamp
    this.entryTimestamps = new Map();    // symbol -> [timestamps...]
    this.burstCount = new Map();         // symbol -> count
  }

  _key({ symbol, side }) {
    // For crypto, we only care about the symbol (BTC/USD)
    return symbol || 'XBT/USD';
  }

  allow({ symbol, action, currentPosition }) {
    // CRITICAL: Always allow exits/closes
    // CHANGE 658: Add TAKE_PROFIT and ensure all exit types covered
    const actionUpper = (action || '').toUpperCase();
    const isExit = (actionUpper === 'SELL' && currentPosition > 0) ||
                   actionUpper === 'CLOSE' ||
                   actionUpper === 'STOP_LOSS' ||
                   actionUpper === 'TAKE_PROFIT' ||
                   actionUpper === 'EXIT';

    if (isExit) {
      console.log(`✅ EXIT always allowed: ${action}`);
      return { ok: true, type: 'EXIT' };
    }

    const key = this._key({ symbol });
    const now = Date.now();

    // Clean old timestamps
    const timestamps = (this.entryTimestamps.get(key) || [])
      .filter(ts => now - ts <= this.windowMs);

    // Check burst protection (rapid-fire)
    const recentBurst = timestamps.filter(ts => now - ts < 5000).length;
    if (recentBurst >= this.burstAllowed) {
      const waitTime = 5000 - (now - timestamps[timestamps.length - 1]);
      return {
        ok: false,
        reason: 'BURST_LIMIT',
        message: `Rapid-fire protection: ${recentBurst} trades in 5s`,
        retryInMs: waitTime
      };
    }

    // Check cooldown
    const lastEntry = this.lastEntryAt.get(key) || 0;
    const timeSinceLastEntry = now - lastEntry;
    if (timeSinceLastEntry < this.entryCooldownMs) {
      const waitTime = this.entryCooldownMs - timeSinceLastEntry;
      return {
        ok: false,
        reason: 'ENTRY_COOLDOWN',
        message: `Entry cooldown: wait ${(waitTime/1000).toFixed(1)}s`,
        retryInMs: waitTime
      };
    }

    // Check window cap
    if (timestamps.length >= this.maxEntriesPerWindow) {
      const oldestInWindow = timestamps[0];
      const windowExpiry = oldestInWindow + this.windowMs;
      return {
        ok: false,
        reason: 'WINDOW_CAP',
        message: `Max ${this.maxEntriesPerWindow} entries per ${this.windowMs/60000}min`,
        retryInMs: windowExpiry - now
      };
    }

    // Entry allowed - record it
    timestamps.push(now);
    this.entryTimestamps.set(key, timestamps);
    this.lastEntryAt.set(key, now);

    return { ok: true, type: 'ENTRY' };
  }

  // Get current limits status for logging
  getStatus(symbol) {
    const key = this._key({ symbol });
    const now = Date.now();
    const timestamps = (this.entryTimestamps.get(key) || [])
      .filter(ts => now - ts <= this.windowMs);

    return {
      recentEntries: timestamps.length,
      maxEntries: this.maxEntriesPerWindow,
      windowMinutes: this.windowMs / 60000,
      cooldownSeconds: this.entryCooldownMs / 1000,
      lastEntryAgo: this.lastEntryAt.has(key)
        ? ((now - this.lastEntryAt.get(key)) / 1000).toFixed(1) + 's'
        : 'never'
    };
  }
}

module.exports = ExecutionRateLimiter;