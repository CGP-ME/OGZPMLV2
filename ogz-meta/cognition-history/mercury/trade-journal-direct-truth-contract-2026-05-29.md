Mercury attack prompt:

You are attacking the TradeJournal direct truth-contract patch in `/opt/ogzprime/OGZPMLV2`.

Scope:
- `core/TradeJournal.js:55-89` numeric/string normalizers.
- `core/TradeJournal.js:163-218` `recordEntry()`.
- `core/TradeJournal.js:234-333` `recordExit()`.
- `core/TradeJournal.js:408-456` `getPerformanceBreakdown()`.
- `core/TradeJournal.js:574-631` `getSnapshot()`.
- `core/TradeJournal.js:802-898` stats mutation.
- `test/trade-journal-today-stats.test.js:210-302` new regression coverage.

Attack objective:
Find a concrete input sequence that makes the journal lie, corrupt open-trade state, misclassify a flat/win/loss, or append a completed trade with fabricated financial fields.

Attack vectors:
1. Construct a malformed direct `recordEntry()` input that still appends a ledger entry or creates an open trade with invented direction, price, size, USD value, confidence, fees, regime, pattern, or indicator values.
2. Construct a malformed direct `recordExit()` input that removes an open trade or increments stats before all required close fields are known.
3. Find a zero-PnL, zero-hold-time, or zero-fee close that is wrongly rejected even though zero is valid truth.
4. Find an exit-only record path that silently invents a direction, entry price, size, reason, P&L percent, or account balance.
5. Find a rebuilt or live trade where `getSnapshot()` or `getPerformanceBreakdown()` turns unknown metadata into a fake dashboard bucket or zero value.
6. Find a stats path where `balanceAfter`, `usdValue`, or `pnlPercent` being null/unknown produces NaN, wrong current balance, wrong win rate, or wrong streak.
7. Check whether this patch only fixes the symptom at write time while leaving a direct path that can still append corrupt trade records.

Do not confirm the implementation. Break it. If you find a bug, cite exact file:line and give the minimal failing input sequence. If a suspected vector is blocked, cite the exact guard that blocks it.
