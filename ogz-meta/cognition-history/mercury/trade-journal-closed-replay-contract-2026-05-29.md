Mercury attack prompt: trade journal closed replay contract

Target files and ranges:
- core/TradeJournalBridge.js:80-154 normalize, classify, and key close log records
- core/TradeJournalBridge.js:296-378 log sink wrapping, dedupe, and close journal/replay recording
- core/TradeJournalBridge.js:386-413 trade_closed_replay dashboard frame
- core/OrderExecutor.js:1760-1825 long SELL logTrade payload
- core/OrderExecutor.js:2090-2166 short COVER logTrade payload

Change intent:
- TradeJournalBridge must watch the actual OrderExecutor logTrade sink, not only bot.logTrade.
- Long SELL and short COVER closes must carry orderId, direction, symbol, strategyName, prices, PnL, exit reason, and hold time into the journal bridge.
- Incomplete close records must not create journal entries, replay files, or trade_closed_replay frames with fabricated values.
- Missing replay fields must surface as null, not BUY, zero prices, unknown reason, or zero hold time.

Attack task:
Break this change. Do not validate it.

Find a concrete input sequence or runtime state where:
1. a real closed trade still fails to reach journal/replay/live-report;
2. a malformed close record still creates a fake dashboard row or fake journal stat;
3. bot.logTrade and orderExecutor.ctx.logTrade wrapping double-records a close;
4. legacy logTrade throwing prevents the journal/replay bridge from recording a complete close;
5. a short COVER path records a wrong direction, wrong PnL, wrong identity, or wrong replay metadata;
6. a partial or zero-PnL close is misclassified as a win/loss or rejected incorrectly;
7. this introduces a new failure mode in live/paper trading or P0 backtest behavior.

Use file:line evidence. If a finding depends on current code outside the listed ranges, cite the exact outside file:line too.
