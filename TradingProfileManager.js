'use strict';

/**
 * Retired compatibility tombstone.
 *
 * Runtime/tuning profile values are owned by config/trading.config.json and
 * exposed through core/TradingConfig. This module must not keep a second
 * hardcoded profile bank.
 */
class TradingProfileManager {
  constructor() {
    throw new Error(
      'TradingProfileManager is retired; use core/TradingConfig profile APIs. ' +
      'Runtime dashboard profile switching remains disabled.'
    );
  }

  static get disabledReason() {
    return 'runtime_profile_switch_not_wired';
  }
}

module.exports = TradingProfileManager;
