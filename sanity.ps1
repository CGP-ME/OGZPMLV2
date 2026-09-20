# sanity.ps1 - quick RSI-only sanity backtest through the canonical run descriptor
node tools/single-backtest.js `
    "--name=sanity-rsi" `
    "--data=tuning/tsla-15m-18mo.json" `
    "--solo=RSI" `
    "--direction=both" `
    "--profile=current-eval" `
    "--fee-profile=ttp_real" `
    "--output-dir=C:/backtest-results"

exit $LASTEXITCODE
