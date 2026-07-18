'use strict';

/**
 * Canonical test environment — census structural fix #1 (2026-07-02 ruling).
 *
 * Jest setupFiles entry. Pins the MINIMAL set of values that make ConfigLoader
 * validation pass in suites that construct config without a full live env,
 * so tests stop inheriting whatever live posture sits in the repo .env.
 *
 * Ruling conditions honored:
 * - Values SATISFY ConfigLoader validation with test-realistic numbers
 *   (TTP eval shape). Validations are not disabled, weakened, or bypassed;
 *   eval/TTP rules stay ENABLED and satisfied.
 * - Deliberately minimal: anything a suite legitimately owns (balances,
 *   confidence floors, symbols, asset class, execution mode) is NOT pinned
 *   here — suites keep full control via their own process.env writes.
 */

const CANONICAL_TEST_ENV = {
  // Tests never run live posture by default; live-only validation demands
  // (process-explicit confidence, live TTP date match) do not apply. Both
  // keys pinned: the repo .env carries EXECUTION_MODE=live, which alone
  // resurrects live-mode validation regardless of LIVE_TRADING.
  PROFILE: 'paper',
  LIVE_TRADING: 'false',
  EXECUTION_MODE: 'paper',

  // Explicit-mode requirement when BROKER=alpaca outside backtest.
  ALPACA_MODE: 'paper',

  // Mercury defaults to OpenAI-compatible embeddings. Unit tests must verify
  // config contracts without requiring the operator's real API key in process.
  OPENAI_API_KEY: 'test-openai-key',

  // Risk limits that require an explicit env/profile source and are absent
  // from the repo .env.
  MAX_WEEKLY_LOSS: '5',
  MAX_MONTHLY_LOSS: '5',

  // Eval/TTP rules: ENABLED and satisfied (TTP eval shape). Profit target is
  // kept at 500 so it stays within the 10 percent initial-balance ratio for
  // any suite balance >= $5k (suites own INITIAL_BALANCE).
  EVAL_RULES_ENABLED: 'true',
  TTP_RULES_ENABLED: 'true',
  TTP_ACCOUNT_START_OF_DAY_EQUITY: '25000',
  TTP_ACCOUNT_START_OF_DAY_DATE: '2026-07-02',
  TTP_DAILY_LOSS_LIMIT_DOLLARS: '500',
  TTP_MAX_LOSS_THRESHOLD_EQUITY: '23750',
  TTP_PROFIT_TARGET_DOLLARS: '500',
};

function applyCanonicalTestEnv(env = process.env) {
  for (const [key, value] of Object.entries(CANONICAL_TEST_ENV)) {
    env[key] = value;
  }
  // Live-only confirmation flag must not leak into paper-posture tests.
  delete env.CONFIRM_LIVE_TRADING;
  return env;
}

applyCanonicalTestEnv();

module.exports = { CANONICAL_TEST_ENV, applyCanonicalTestEnv };
