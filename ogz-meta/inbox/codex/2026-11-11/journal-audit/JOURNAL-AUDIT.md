# Journal audit — November 11, 2026

Status: audit findings, not an implemented journal repair. Source baseline: `e7344dfdf71bbe510793efa8c4cfad6d7b8e4dbc` on `codex/archive-legacy-env`, including the separately recorded inherited working changes. No journal, broker state, paper position, trading configuration, or PM2 process was changed by this audit.

The October 15 repair removed one specific authority: repeated TradeJournalBridge persistence failures pausing/resuming trading. That repair remains present. Other journal-related startup and SessionRouter control paths still have authority over the bot. The current paper bot is online but held after an NVDA historical-candle request failed; online status is not evidence that it is trading.

## Coverage and evidence

Read the complete implementations of `TradeJournal`, `TradeJournalBridge`, `TransitionStore`, and `TradeReplayCapture`: 4,770 source lines, including constructors, persistence, recovery, entry/exit capture, reconciliation, statistics, exports, dashboard wiring and destruction. Traced their direct runner, SessionRouter, StateManager, OrderExecutor, configuration and WebSocket consumers. Read the business logic of both standalone journal/replay pages and the dashboard replay panel; traced the ChartPanel replay API. CSS, the entire ChartPanel subsystem, unrelated trading strategies, and TrAI's conversation journal are not claimed as audited here.

The history census covers 50 commits affecting the three principal journal implementations. Relevant earlier repairs were checked against current code, especially `cced6986` (October 15 persistence authority removal), `2512fce4` (runtime journal identity), and `b9df704b` (scoped replay persistence). A history census is not a claim that every historical diff was re-reviewed.

Supporting receipts, retained locally under this directory:

- `source-manifest.json`: source SHA-256 hashes, line counts and inherited dirty-file inventory.
- `method-and-throw-census.json`: method and explicit-throw inventory for the four core implementations.
- `journal-history-census.txt` and `changelog-history.private.json`: historical references.
- `transition-history.private.json`: read-only transition history inspection.
- `native-observations.json` and `replay-observations.json`: observed outputs from actual classes and the actual page renderer in disposable namespaces.
- `native-observation.log`, `replay-observation.log`, and `fixtures/`: commands and reproducible synthetic inputs. These were not installed as a Jest suite or run against operator state.

Both observation commands used `python3 scripts/test-isolated.py --fixture <repo-relative fixture> -- node <fixture>`. They exercised synthetic files, accounts and trades. The lock observation controlled the scheduling of two real `acquireLock` calls at publication; it is not evidence that two live bots collided. Frontend renderer execution used a synthetic DOM boundary, not a live browser acceptance test. Raw runtime/private receipts are not included in the commit.

## Current runtime finding

The read-only observation found `ogz-prime-v2` PID `2631857`, started November 9 at 6:55:51 p.m. PST (November 10 02:55:51 UTC). The durable transition ended at November 10, 6:31:43 a.m. PST in `RECOVERY_REQUIRED`, with `SESSION_FAILED_SAFE`, incomplete runtime scope, and the reason `NVDA` historical candles returned HTTP 504. Saved paper state had no active or quarantined positions and retained the router's transition pause. All latest broker-intent records were `COMMITTED`; no unresolved intent was found in that snapshot.

The full transition history also contains a November 4 NVDA candle `socket hang up` that entered the same failed-safe state. This is a reproduced operational failure family, not a hypothetical lock edge case. No journal was cleared to make the status disappear.

## Findings, in repair order

### J01 — A historical-data failure becomes a persistent whole-router trading hold

**Observed live and traced in source.** The transition changes the active broker/session, then hydrates historical candles before recording activation. Any exception takes the same `_enterFailedSafe` route. Failed-safe mode prevents later transition checks and rejects OHLC callbacks; its durable record also blocks startup activation after a restart. A transient NVDA 504 therefore stops the entire session rather than recording an unavailable symbol/data operation that can recover.

Sources: [transition and hydration](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:1653), [failure handler](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:1480), [transition check](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:385), [OHLC fence](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:1168), [startup refusal](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:869), [runner startup hold](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:1846).

This does **not** prove every exit route is disabled. The runner's separate exit monitor calls `checkExitsOnly`, and the runner/OrderExecutor session blocks apply to entry actions. Current state has no open paper position, so live exit protection under this failure was not demonstrated. Sources: [exit monitor](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:2526), [runner entry block](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:3221), [executor entry block](/opt/ogzprime/OGZPMLV2/core/OrderExecutor.js:2831).

Repair direction: distinguish market-data availability from unresolved execution/account truth at their producers. Preserve the genuine broker reconciliation requirements and evidence; do not clear recovery files or resume trading blindly. Restart alone does not resolve this persisted cause.

### J02 — Trade-journal initialization can still terminate the bot

**Native constructor failure plus a direct production caller chain.** A malformed ledger row throws from `_rebuildFromLedger`; directory creation and scope/balance initialization can fail as well. The bridge constructs its primary journal synchronously, and construction during startup reaches the runner catch that calls `shutdown(1)`. Additional scope construction during open-trade reconciliation is outside that method's recording catch.

Sources: [journal initialization](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:217), [ledger parsing](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:1348), [bridge construction](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:554), [additional bundle construction](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:893), [runner construction](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:1941), [startup shutdown](/opt/ogzprime/OGZPMLV2/run-empire-v2.js:1970).

The sandbox reproduced the malformed-row throw; the live bot was not crashed. Removing financial evidence validation would conceal corruption. The repair needs to remove reporting-journal authority over runner startup while preserving an explicit corrupt-record disposition and operator evidence.

### J03 — Journal bookkeeping failures share the activation-failure path with broker execution ambiguity

**Source-confirmed.** Required transition-event writes, intent writes/commits, lock release and status reads can prevent activation or set recovery. The intent mechanism wraps subscriptions and listener/router registration as well as broker operations. A successful operation followed by a failed journal commit is converted to recovery, without distinguishing the consequence of the underlying operation.

Sources: [event persistence](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:755), [intent execution](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:807), [lock release failure](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:698), [status-read exception](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:1957).

Unknown order outcome must remain distinct from a reporting or subscription bookkeeping failure. This finding is not authorization to remove idempotency or duplicate-order protection.

### J04 — Recovery can remain poisoned by an old damaged record and overwrite the original damaged state

**Native reproductions.** One malformed historical transition line caused `readStatus()` to remain `RECOVERY_REQUIRED` after a later valid activation event. Separately, acquiring a lock over malformed state wrote a new recovery state over the damaged bytes without preserving the original file in a quarantine artifact.

Sources: [event projection](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:373), [lock/recovery handling](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:437), [status projection](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:557).

Repair needs an explicit, evidence-preserving recovery disposition. Appending another apparently successful event cannot by itself repair malformed prior history.

### J05 — The transition lock is neither exclusive nor a renewed liveness signal

**Controlled native reproductions.** Two `acquireLock` calls both returned success at epoch 1 when they read the absent lock before either published; the last writer owned the file. Separately, an owner still running crossed the stale-lock deadline because `heartbeatAt` is written at acquisition and never renewed. Release checks transition ID/epoch but does not check owner identity.

Sources: [staleness](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:89), [acquisition](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:437), [release](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:513), [atomic writer](/opt/ogzprime/OGZPMLV2/core/AtomicWrite.js:1).

Atomic file replacement is not exclusive lock acquisition. No live concurrent owner was demonstrated; this is lower priority than the already observed data-failure hold.

### J06 — Reconciliation can clear one broker's journal entry using another broker's empty position list

**Native reproduction.** The bridge obtains positions from the active broker once, then applies them across all loaded journal bundles. It compares symbol presence without verifying matching broker/account identity. An empty synthetic Alpaca result cleared a Kraken-scoped orphan entry from the journal.

Sources: [position source](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:955), [all-bundle reconciliation](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1032).

This changes journal truth, not the broker's actual position. Historical production records were not rewritten or claimed corrupt by this observation. Reconciliation proof must belong to the same broker, account, execution mode and symbol as its target.

### J07 — Exit fees are discarded before journal accounting

**Native reproduction and producer trace.** `_recordTradeLogClose` passes literal `fees: 0`. With gross profit $10, entry fee $1 and exit fee $3, the journal reported $9 net instead of $6. Real OrderExecutor close logs carry a **round-trip** fee total; the repair must reconcile gross profit, allocated entry fees and exit fees rather than simply copying that total into an exit-only field and double-counting entry fees. StateManager separately subtracts the exit fee from realized results.

Sources: [discarded fee](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1113), [journal fee calculation](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:426), [long close producer](/opt/ogzprime/OGZPMLV2/core/OrderExecutor.js:4866), [short close producer](/opt/ogzprime/OGZPMLV2/core/OrderExecutor.js:5345), [realized accounting](/opt/ogzprime/OGZPMLV2/core/StateManager.js:1589).

The inherited working fee configuration currently uses zero fees; that can mask the defect. This audit did not change fees or claim a quantified historical account loss.

### J08 — Equity points lag the completed trade, and journal exit timing replaces producer timing

**Native reproductions.** A profitable close produced `balanceAfter=1010` and stats balance 1010, but the newest equity point still showed balance 1000 and net P&L 0. Equity is recorded before statistics update. A supplied exit timestamp and 30-second hold became wall-clock recording time and approximately 60 seconds because `recordExit` uses `Date.now()` and recomputes hold duration.

Sources: [recorded time](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:363), [equity-before-stats order](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:505), [equity fields](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:1280).

### J09 — Restart changes lifetime statistics to the retained in-memory window

**Native reproduction.** With a retention limit of two, three profitable closed trades reported three trades/$3 before reopening and two trades/$2 afterward; current balance remained $1003. Rebuild trims `trades` before recomputing totals, mixing a retained window with lifetime/balance values.

Source: [ledger rebuild and trimming](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:1510). The synthetic retention setting made the boundary visible; production history was not truncated.

### J10 — Aggregate metrics and journal views disagree about scope and completeness

**Native risk-metric reproduction plus source trace.** A losing journal with 2% drawdown became aggregate drawdown 0. The aggregate hardcodes Sharpe, drawdown and hold times to zero. Aggregate stats combine loaded bundles, while equity, calendar and exports read only the primary journal. Constructors load primary/current-open scopes, not a complete inventory of historical scope directories, so an apparent aggregate can omit historical scopes after restart.

Sources: [bundle loading](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:554), [aggregate fields](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1750), [primary-only consumers](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1963).

Related source-confirmed ownership defects: JSON report export uses an unscoped `data/journal/exports` path with only the date in its filename; visibility failures default to the primary journal scope/path, even when many callers describe another bundle. Sources: [export path](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1992), [failure scope selection](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1238).

### J11 — Breakeven and unit labels produce inconsistent receipts

**Native breakeven reproduction.** A zero-P&L trade counted as one breakeven/no losses in headline stats, but as one loss in daily and breakdown output. CSV labels USD notional `Size_BTC`. The page also reconstructs losses as total trades minus wins, counting breakevens as losses.

Sources: [daily counters](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:819), [breakdown counters](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:1544), [CSV units](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:985), [page win/loss display](/opt/ogzprime/OGZPMLV2/public/trade-journal.html:799).

### J12 — Restart loses replay entry capture and unfinished post-exit collection

**Native reproduction.** Both queues start as empty Maps and are not restored. A capture instance with one open entry and one unfinished post-exit capture reopened with neither. A later exit reported `missing_entry_capture`; a later matching candle was not added to the already saved incomplete replay. Bridge startup reconciliation restores journal entries, not the original replay snapshot.

Sources: [memory-only queues](/opt/ogzprime/OGZPMLV2/core/TradeReplayCapture.js:108), [missing entry handling](/opt/ogzprime/OGZPMLV2/core/TradeReplayCapture.js:194), [post-exit collection](/opt/ogzprime/OGZPMLV2/core/TradeReplayCapture.js:307), [startup reconciliation](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:860).

The recent same-process write retry repair is present. It does not provide restart durability. Entry/exit replay also merges only the bounded entry window and bounded exit window, so a long-held trade may have a missing middle section; the capture should not be described as a complete continuous trade history.

### J13 — Replay lookup/listing can return the wrong set or leave its scoped directory

**Native listing reproduction; path behavior source-confirmed.** `listReplays(limit)` sorts filenames and applies the limit before reading save timestamps; with a newer `aa-new` and older `zz-old`, a limit of one returned the old file. `loadReplay` directly joins caller-supplied `orderId` into a filesystem path without checking the resolved path remains under the replay directory. The WebSocket replay request forwards that ID.

Sources: [lookup and listing](/opt/ogzprime/OGZPMLV2/core/TradeReplayCapture.js:356), [request consumer](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1647). No live file-exfiltration attempt was made. The bridge's HTTP registration methods were not found wired into the running server; this is not a claim of an unauthenticated HTTP exploit.

### J14 — Standalone journal/replay pages violate the current authentication protocol

**Direct source contract mismatch.** Both pages send journal/replay requests immediately on WebSocket open. The server requires an `auth` message first and closes such requests with code 1008. Journal UI labels the connection “Live” before authentication or receipt of any snapshot. Its reconnect then repeats the same request order. Replay's initial HTTP API path has no identified bridge registration in the current server.

Sources: [journal connection](/opt/ogzprime/OGZPMLV2/public/trade-journal.html:729), [replay connection](/opt/ogzprime/OGZPMLV2/public/trade-replay.html:394), [server protocol](/opt/ogzprime/OGZPMLV2/ogzprime-ssl-server.js:1892). Fix by using the established session/ticket flow; do not embed a long-lived WebSocket secret in either page or weaken the server gate. Live browser acceptance remains outstanding.

### J15 — An all-winning snapshot can break journal rendering after JSON transport

**Actual renderer reproduction.** Profit factor can be `Infinity`. JSON transports it as `null`; the page compares it with `Infinity`, then calls `null.toFixed(2)`. The page's broad message catch hides that rendering failure. A correct no-loss profit-factor representation needs an explicit serializable contract.

Sources: [snapshot producer](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:927), [aggregate producer](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1770), [renderer](/opt/ogzprime/OGZPMLV2/public/trade-journal.html:800), [hidden render exception](/opt/ogzprime/OGZPMLV2/public/trade-journal.html:752).

### J16 — Replay displays do not reliably show the captured trade evidence

**Source-confirmed producer/consumer mismatches.** The dashboard replay panel uses current ChartPanel candles and an entry-time-only query, not the saved scoped replay. ChartPanel returns seconds in `time`; the panel expects `ts`, so its timestamp placement branch is skipped and markers stay at arbitrary one-third/eighty-percent positions. It does not pass the trade's symbol/account/timeframe to the candle API. News/whale absence is displayed as “Clean”/“None detected,” and missing numeric fields become zero. Negative P&L is formatted with an absolute dollar amount without a minus sign in both replay displays. The standalone replay reads `candles`, but does not display the separately captured `postExitCandles` region.

Sources: [panel candle consumer and marker placement](/opt/ogzprime/OGZPMLV2/public/js/panels/trade-replay.js:624), [actual candle API](/opt/ogzprime/OGZPMLV2/public/js/panels/chart-panel.js:2871), [panel presentation defaults](/opt/ogzprime/OGZPMLV2/public/js/panels/trade-replay.js:653), [standalone rendering](/opt/ogzprime/OGZPMLV2/public/trade-replay.html:432), [standalone chart input](/opt/ogzprime/OGZPMLV2/public/trade-replay.html:491).

The standalone page also substitutes volume 1 for volume 0 in its displayed VWAP calculation, and the journal equity chart retains the first balance when several exits share the same second. These affect displayed evidence, not the trading engine's indicators. Sources: [VWAP display](/opt/ogzprime/OGZPMLV2/public/trade-replay.html:718), [equity deduplication](/opt/ogzprime/OGZPMLV2/public/trade-journal.html:954).

### J17 — Synchronous history scans and weak write durability remain

**Source-based reliability concern, not a measured explanation of current outages.** Transition event/intent operations repeatedly read full histories, and trade-journal startup reads the whole ledger. The atomic writer uses a shared `.tmp` filename and rename, with no explicit file/directory sync. Critical append failures propagate; some secondary export/cache failures only return/log failure. This needs a measured producer/persistence review before selecting a repair. It does not explain the CPU-based RAG embedding time, and no power-loss or disk-full production experiment was performed.

Sources: [transition history operations](/opt/ogzprime/OGZPMLV2/core/session-router/TransitionStore.js:138), [trade ledger load](/opt/ogzprime/OGZPMLV2/core/TradeJournal.js:1348), [atomic writer](/opt/ogzprime/OGZPMLV2/core/AtomicWrite.js:1).

## Corrections that must be preserved

- Bridge persistence failure/recovery now emits evidence with `tradingAction: 'none'`; it does not pause/resume the bot. [Current implementation](/opt/ogzprime/OGZPMLV2/core/TradeJournalBridge.js:1347).
- StateManager clears the retired `journal_persistence_down` pause while retaining failure evidence. [Current implementation](/opt/ogzprime/OGZPMLV2/core/StateManager.js:4303).
- SessionRouter's misleadingly named `_applyLocalPauseFallback` is retired and returns false. It is not an active state mutation. [Current implementation](/opt/ogzprime/OGZPMLV2/core/SessionRouter.js:606).
- Per-trade journal failure markers do not themselves establish a global shutdown route. The actual startup termination and router recovery paths above are the evidenced authority paths.
- Partial exit journal handling and same-process replay write progress remain present. Their existence does not establish restart recovery or truthful UI output.

## Delivery and next implementation boundary

The completed-candle repair is already committed and pushed as `214be4970902d574d047871780dfa7a263cb1f8c`, contained in confirmed remote head `e7344dfdf71bbe510793efa8c4cfad6d7b8e4dbc`. It has isolated execution and Mercury/Astra review receipts. It has **not** been activated or accepted as live-correct by this audit. Trey requested waiting for restart verification; no restart was performed.

The immediate journal repair target is J01/J02: stop ordinary data/reporting failures from acquiring whole-bot authority, while retaining accurate execution reconciliation. Subsequent changes should be independent atomic repairs with concrete behavior receipts and the required review. This audit does not authorize deleting recovery evidence, fabricating missing values, changing risk/fee policy, or bundling all findings into one production change.
