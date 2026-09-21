# sanity.ps1 - quick RSI-only sanity backtest
$env:BACKTEST_OUTPUT_DIR       = "C:/backtest-results"
$env:EXECUTION_MODE            = "backtest"
$env:CANDLE_SOURCE             = "file"
$env:BACKTEST_MODE             = "true"
$env:BACKTEST_FAST             = "true"
$env:INITIAL_BALANCE           = "10000"
$env:PAPER_TRADING             = "true"
$env:TEST_MODE                 = "true"
$env:BACKTEST_NO_PATTERN_SAVE  = "true"
$env:ENABLE_DASHBOARD          = "false"
$env:NODE_ENV                  = "test"
$env:SOLO_STRATEGY             = "RSI"
$env:CANDLE_DATA_FILE          = "tuning/tsla-15m-18mo.json"
$env:ENABLE_RSI                = "true"

node run-empire-v2.js