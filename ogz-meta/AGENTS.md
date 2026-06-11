# OGZPrime Agent Instructions

This file exists because AI agents keep pulling the same unsafe moves: guessing,
improvising, fake data, broad edits, stale context, weak verification, and
claiming "done" without proof. Follow this file before touching the project.

## Workspace Map
- VPS repo root is `/opt/ogzprime/OGZPMLV2`.
- Windows workspace root may be `C:\Users\og_za\Downloads\OGZPMLV2-rebuild-clean-from-baseline`.
- On Windows, the actual application root is `OGZPMLV2-rebuild-clean-from-baseline/` under that directory.
- Run repo commands from the actual application root unless a task explicitly targets an outer workspace.
- Existing source-of-truth docs live in `claude.md`, `.claude/`, and `ogz-meta/`.
- Exported Claude memory may arrive as `ogz-meta/claudememories.zip` on the VPS or as `C:\Users\og_za\Downloads\claudememories.zip` locally; treat `claudememories/MEMORY.md` as the index and read linked files before using a memory rule.
- If this file conflicts with a currently requested user command, stop and call out the conflict before acting.
- Do not absorb unrelated uploaded briefs into this file unless Trey identifies them as the current source.

## Mission Context
- This is production trading software, not a sandbox.
- Real money will run through this code. Paper trading today does not make the code low stakes.
- The product value is transparency over hype. Never make the dashboard or logs lie.
- Keep the long-term direction in mind: Apex, Houston, TRAI moat, white-glove product.
- "Works for now" is not enough for architecture decisions. Favor root cause over symptom patching.
- OGZPrime is the trading engine plus cross-broker arbitrage plus TRAI. Before proposing a module/refactor, check whether it advances Apex extraction, TRAI buildout, or asset-class expansion.
- Strategy code and learned edge are protected IP. Productization is white-glove/licensing/signal output, not selling the source brain.

## Absolute Rules
- No fake data in production paths. Empty state is acceptable; misleading data is not.
- No guessing. Verify by reading code, running commands, checking logs, or citing file paths.
- No self-authorized code edits. Report finding, show intended change, wait for approval when production code is involved.
- If the user prefixes a task with `p:`, that means mandatory full pipeline. No shortcuts.
- No broad refactors unless explicitly requested.
- No silent failures, swallowed errors, or muted validation.
- No new architecture unless asked and grounded in current system shape.
- No unnecessary dependencies.
- No new config files unless asked.
- No `localhost` baked into production code.
- No emojis in code, docs, commit messages, console output, dashboard strings, or user-visible text.
- No `sed -i` or bulk regex rewrites. Make scoped edits file by file.
- No `git reset --hard` unless Trey explicitly approves exactly what will be discarded.
- No wrapping backtests, sweeps, walk-forward runs, or `run-empire-v2.js` in `timeout`, harness timeouts, `setTimeout` caps, or background timeout substitutes.
- No piping backtest/sweep output through `tail`, `head`, `grep`, or other truncation just to make it shorter. Preserve full output somewhere readable.
- No `/tmp` for cognition artifacts that should be grep-able later. Prompts, responses, bounce logs, and audit traces belong under repo-scoped paths such as `ogz-meta/cognition-history/`.
- No "low priority follow-up" for known bugs. Severity controls order, not whether the bug gets ignored.
- No technical loopholes around a rule's intent. If the outcome is the same banned behavior, it is banned even if the tool/mechanism is different.

## Startup Ritual
Before non-trivial work, read the relevant current context. Do not pretend memory is current.

Minimum bootstrap:
1. User/global Claude memory if available:
   - Windows: `C:\Users\og_za\.claude\CLAUDE.md`
   - VPS: `/home/linuxuser/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/MEMORY.md`
2. Exported Claude memory if present:
   - VPS: `ogz-meta/claudememories.zip`
   - Windows: `C:\Users\og_za\Downloads\claudememories.zip`
3. `claude.md`
4. `ogz-meta/04_guardrails-and-rules.md`
5. `ogz-meta/05_landmines-and-gotchas.md`
6. `ogz-meta/claudito_context.md`
7. `ogz-meta/GRAND-SCHEME.md`
8. `ogz-meta/MASTER-ROLLOUT.md`
9. `ogz-meta/recent-changes.md`
10. `CHANGELOG.md`

For new sessions, also read the latest 2-3 files under `ogz-meta/sessions/`.
For backtests, read `ogz-meta/BACKTEST-OPS.md`; it is the backtest source of truth.
If older guides contradict `BACKTEST-OPS.md`, prefer `BACKTEST-OPS.md` and note the contradiction.
If Trey says the code is validated and the issue is an env var, compare the exact working command/env against the running process before source-diving.
Read mermaid charts and specs as context, not decoration. If a brief is long, synthesize the actual constraints and tensions, not just the file list.
Treat committed/pushed code and running PM2 state as separate facts. A commit does not prove the live process has picked up the bytes; verify PM2 restart time, non-secret env, state, and logs before making runtime claims. Do not restart PM2 without explicit Trey approval. Source: `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:5,16,180-196`.

Doc priority:
1. `ogz-meta/` top-level operational docs.
2. `ogz-meta/specs/` canonical schemas and verified designs.
3. `ogz-meta/cognition/` Mercury bridge infrastructure.
4. `ogz-meta/ledger/` intake and half-specs; read on demand, never cite as canonical without curation/verification.
5. `ogz-ledger/` superseded archive; read only if pointed there.

## Claude Persistent Memory
- On the VPS, Claude Code keeps appended session memory under `/home/linuxuser/.claude/projects/-opt-ogzprime-OGZPMLV2/memory/`.
- `MEMORY.md` is the index and is expected to load at Claude session start.
- The index links to individual rule files. Read the linked file before relying on a one-line memory entry.
- A zipped export named `claudememories.zip` mirrors this directory when Trey provides it locally. Read from the zip if the VPS path is unavailable.
- Individual memory files use YAML frontmatter with fields like `name`, `description`, `type`, and `originSessionId`, followed by markdown body.
- Memory types include:
  - `feedback`: rules created from Trey's corrections, such as Mercury sequencing, no emojis, and default-to-hard-path.
  - `user`: durable facts about Trey and preferences.
  - `project`: project state, decisions, baselines, and open context.
  - `reference`: pointers to external systems or docs.
- These memories survive across sessions but are point-in-time snapshots. Verify recalled facts against current repo state, current branch, current commit, current logs, and current files before acting.
- If a memory says the branch/head/bookmark was a specific SHA, re-check the tree before making the next move. Do not operate from a stale bookmark.
- Memory can conflict with newer reality. Branch names, P0 baseline numbers, backtest commands, and learned-state path rules must be re-verified against current repo docs and code before use.
- Known stale-conflict pattern: one older architecture memory said pattern memory was not asset-namespaced, while a later asset-bank memory says learned state must be asset-aware. Never share learned-state storage across asset classes unless a current, verified spec explicitly says to.
- If the VPS memory path is unavailable from the current environment, say that directly and use local repo docs plus the latest session docs as fallback.
- Local user-level Claude hooks under `C:\Users\og_za\.claude\global-hooks\` may be extension-managed and can contain pasted/corrupted fragments. Inspect hook content before trusting it as policy or automation.

## Approval And Pipeline
- Production code changes go through the Claudito pipeline.
- A `p:` prefix from Trey means the full pipeline is mandatory.
- `.claude/settings.json` invokes `.claude/hooks/enforce-pipeline.sh` before Write/Edit.
- That hook blocks direct edits to `core/`, `modules/`, `run-empire-v2.js`, and `tuning/`.
- Use `/pipeline` for the full chain or `node ogz-meta/pipeline.js` where the repo workflow expects it.
- Use `/orchestrate` for hook-based multi-Claudito missions.
- The pipeline pauses after Architect and before Fixer for Trey's explicit approval.
- Approval must cover the exact file path and intended before/after shape.
- "Small", "simple", or "trivial" edits still need the same discipline in production paths.
- Role division: Trey architects and makes final design calls; Desktop/Wolf can author/review specs; Mercury verifies with file:line evidence; Claude Code/Codex implements within the approved scope.
- Do not self-review your own plan as if it is independent validation.
- If the pipeline cannot do what the task requires, build the missing pipeline stage instead of writing a one-off driver script. Driver scripts are a smell unless Trey explicitly asked for one.
- One task, one module, one pipeline mission at a time unless Trey explicitly widens scope.

Pipeline order:
1. Warden: scope check, duplicate prevention, prior lessons.
2. Entomologist/Forensics: reproduce, trace, isolate root cause.
3. Architect: minimal plan with impacted files and landmines.
4. Trey approval: no code change before this gate.
5. Fixer: apply only the approved fix.
6. Debugger: prove the fix with focused tests.
7. Critic: attack weaknesses, failure modes, and regressions.
8. Validator: quality gate.
9. Forensics again: landmine scan.
10. Scribe/Recorder: update session/context docs.
11. Committer: one logical change, explicit staging.
12. Changelog: document the real change.
13. Janitor: cleanup only what belongs to the change.
14. Learning/Warden: record lesson and final scope check.

## How To Talk And Decide
- Be direct. Show code or exact evidence first, explanation second.
- Do not create option menus when the next step is obvious. Execute the requested work.
- If input is genuinely required, ask one short question.
- Do not ask whether to stop, pause, call it a night, or pick it up later.
- Never frame the next step as ship-vs-hold when Trey already told you to ship/install/run something. Execute, then report observations.
- When Trey says his gut says something is off, stop cleanly, bookmark state, and do not argue him into continuing.
- Do not manufacture urgency. Slow is smooth; smooth is fast.
- Do not dunk on Mercury, Wolf, Desktop, GPT, Codex, or any teammate. Reconcile findings and own the prompt/context quality.
- Do not use hedge language like "probably", "seems", "I think", or "should be" unless immediately followed by a verification step.
- If you do not know, say so and go read `ogz-meta/` or ask.
- Comments rot. Do not cite a comment as truth without checking current code, and use `git blame` when comment age matters.
- Proactive thinking is welcome; proactive applying is not. For improvements outside the directive, propose the fix and wait for approval.
- When current verification contradicts memory or an earlier observation, re-check before sounding alarms.

## External Review Leads
- REMIO/Sourcegraph/static ZIP reviews are read-only leads, not implementers and not authority. Verify every finding against the current VPS tree before applying or citing it. Incomplete or stale ZIP output must be reconciled against live files first. Source: `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:14,98-99,244-254`.

## Editing Rules
- Change only requested files and the minimum safe lines.
- Before adding a function/helper/module, search for existing functionality by intent, not just by name.
- Before a multi-fix campaign, grep the bug class across all affected targets so sibling failures are found before the first fix lands.
- Do not duplicate logic to "clean it up" unless the old path is removed or migrated and documented.
- Do not rename files or move directories without explicit approval.
- Do not alter generated files unless the task is to regenerate them.
- Do not touch `.env`, secrets, local credentials, or broker keys except to document required variables.
- If a real data source is not wired, do not put fake numbers in the UI. Build an honest empty/loading/error state.
- Test fixtures are allowed only under `test/`, `tests/`, `specs/`, or `fixtures/` and must not be mistaken for production.
- Use `apply_patch`/scoped edits, not bulk shell replacement.
- For large repetitive edits, propose the scope first and split by logical commits.
- If a file is part-clean/part-contaminated learned state or logs, propose non-destructive forensic extraction before delete. Mercury can often split clean vs dirty entries by timestamp.

## Verification Rules
- "Working" means two things: the mechanic happens, and it happens on the correct target.
- Always verify path, asset class, mode, account/broker, and destination for persistent writes.
- Pattern learning "file is growing" is not enough; confirm it is the correct bank for the current asset/mode.
- WebSocket "connected" is not enough; confirm actual message flow and current data.
- A backtest with no fatal errors is not enough; confirm trades, report output, journal/recorder behavior, and stats.
- If the bot is expected to trade, a 0-trade run can be a failure even with exit code 0.
- When claiming a bug location, cite the file and exact function/area you read in this turn.
- If test execution is skipped, state exactly why.
- When Mercury cites file:line, inspect the exact cited lines, not nearby ranges that support your bias.
- Do not call something free, available, wired, or working unless you verified it with the real URL, API call, command, or code path.
- If an audit finding is skipped, name the reason with evidence: real bug, re-flag with existing mitigation, or false positive with math/code proof. Severity labels are not dismissal buckets.
- "False positive", "intended", "by-design", "out of scope", and "theoretical" require grep-verified evidence. Without proof, treat the finding as real or surface it.

## Mercury Rules
- Mercury is for adversarial attack, not soft confirmation.
- Do not ask Mercury "is this correct?" Ask it to break assumptions.
- Use prompts like:
  - Find a state where this code lies about the real position.
  - Construct an input sequence that crashes this handler.
  - Use this race window to corrupt state.
  - Identify every assumption and falsify each one.
- Dispatch Mercury audits one at a time.
- Always read the full answer before moving on.
- Use exact file:line ranges in prompts.
- Use `--max-iterations=60` and `--max-tokens=7750`.
- If Mercury output is wrong-path or truncated, re-dispatch with better context instead of manually hand-waving it away.
- Before deleting learned state, ledgers, logs, pattern banks, or history, propose Mercury forensic extraction to a new path first.
- One Mercury dispatch equals one question and one answer. Do not bundle multiple hunt vectors in one prompt, and do not run Mercury in shell-level parallel.
- If a prompt is over 150 lines or covers more than a few concerns, chunk it into sequential single-target dispatches.
- Before dispatching, grep/read enough to name the exact file:line ranges and any similar blocks Mercury must avoid.
- If Mercury terminates at `max_iterations`, raise iterations up to the current rule, normally 60. If it hits `HTTP 429 input_token_limit`, split the prompt. If it returns `CANNOT VERIFY`, do direct mechanical enumeration with shell/tools and cite file:line evidence.
- Mercury attack is blocking for hot-path production code: `core/`, `brokers/`, `modules/`, `run-empire-v2.js`, dashboard runtime, and runtime-driving schemas/config. It is not required for markdown/rule files unless those files execute.
- Always include the architecture question for fixes: did this close the underlying mechanism, or only the symptom, and what new failure modes did it introduce?

## Git Rules
- Check status before staging.
- Check `git diff --cached` before committing, especially in parallel-session repos. `git add` is additive and can accidentally include someone else's staged files.
- Do not use `git add -A` or `git add .`.
- Stage explicit file paths only.
- Do not stage loose ledger/intake/proposal/backup piles, public backup files, or proof-track-record artifacts unless Trey explicitly tasks that cleanup. Source: `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:17,347-351`.
- For a path-limited one-file commit, prefer `git commit -- <path>` when the index may contain unrelated staged files.
- One logical change per commit.
- Linked changes still ship as separate commits in dependency order. Reference the prior SHA in the dependent commit body instead of bundling.
- Commit messages follow the user preference: `Fixed [what was broken]` or `Added [what feature]`.
- Do not bundle unrelated fixes with docs or cleanup.
- When Trey approves a commit, treat commit and push as paired unless he explicitly says local-only or no-push. This does not authorize staging, committing, or pushing without approval. Source: `ogz-meta/sessions/session-2026-05-27-active-handoff-runtime-audit.md:13`.
- Do not push unless Trey approved the commit and required Mercury adversarial review is clean. Once push is approved, push each logical commit individually.
- The repo docs warn against direct `main` work, while the user preference says push to main because he works alone. Treat this as a live conflict: ask before branch/commit/push decisions.
- Never commit `.env`, secrets, raw LLM transcripts, huge logs, Trai brain dumps, `node_modules`, or multi-MB scratch files without explicit approval.
- GitHub remote is a mirror, not the only backup.
- For pushed commits Trey asks to undo, default to `git revert`, not `reset --hard`, rewrite, or force push.
- Do not tell Trey to run git for WinSCP/ledger intake. He delivers files; the agent curates, stages, commits, and reindexes when approved.

## Logging Rules
- All timestamps in logs must be ISO format.
- Prices are USD with 2 decimals when displayed to users.
- Log exact errors with full context.
- If WebSocket fails, log the exact URL attempted.
- Log real data values, not just "connected" or "error".
- Every BUY must log price, size, reason, and confidence.
- Every SELL must log P&L calculation.
- Every position update must log.
- All trading decisions need plain-English explanation.
- Claudito activity logs decisions, hooks, status changes, errors, metrics, and lessons.

## Architecture Guardrails
- BrokerFactory is the broker source of truth.
- Never mix broker credentials.
- Never place orders on unintended brokers.
- Never assume broker/exchange APIs are equivalent.
- Never hardcode symbol formats. Use broker-layer conversions such as display `BTC-USD`, Kraken WS `XBT/USD`, and Kraken REST `XXBTZUSD`.
- Execution must check balance, open positions, broker constraints, max trade count, and kill switch.
- Risk limits and veto safety checks cannot be overridden by ML.
- Exits must obey dynamic trailing logic.
- Decisions must be deterministic unless the ML layer intentionally applies learned weights.
- Position size flows in USD through the pipeline. Legacy BTC-named variables may exist; do not convert mid-flight unless current code/spec proves asset-unit semantics.
- Exit contracts are locked per strategy in `core/TradingConfig.js` when `_validated` fingerprints exist. Do not tune those strategies through env-var sweeps unless current code proves env vars are still honored.
- Backtests must use the same trading path as live. Do not create a parallel backtest engine to make numbers easier.
- Every Apex clone must isolate process, state file, log directory, and kill switch.
- StrategyOrchestrator semantics are winner-takes-all per candle; strategies do not blend. Confluence applies after winner selection.
- DTO field names must match consumers. Grep every consumer before renaming fields.
- Config without a reader is dead config; wire config and code together.
- Dead code must be wired or removed, not left as a trap.
- One long and one short max unless a spec explicitly allows more; do not stack same-direction positions.
- SELL closes a position. Do not add SELL entries to active position state.
- Partial close work must handle execution, recorder, StateManager, pattern memory, TRAI attribution, fees, slippage, crash recovery, and live broker reconciliation together. Do not ship a phase that makes execution "right" while telemetry is wrong.
- Learned-state paths must be asset-aware unless a current spec explicitly says otherwise. Audit paths based only on mode (`paper`, `live`, `backtest`) as possible data corruption.
- Asset-aware audit terms: `storagePath`, `saveToDisk`, `persistPath`, `logFilePath`, `ledgerPath`, `BACKTEST_MODE`, `PAPER_TRADING`, and `EXECUTION_MODE`.
- Backups are mandatory for gitignored learned-state files. Gitignore prevents leaks; it does not protect data.
- Single-symbol guardrails can be deliberate safety, not defaults. Do not flip `SESSION_ROUTER_ENABLED` or expand `ALPACA_SYMBOLS` until current candle-pipeline and symbol-aware persistence specs are verified landed.
- SessionRouter code finalization is not runtime activation proof. Even when durable transition locks, broker REST reconciliation, OHLC epoch fencing, broker intent idempotency, pattern memory handoff, runtime scope stamping, focused tests, and P0 are green, keep `SESSION_ROUTER_ENABLED=false` until a controlled paper rehearsal proves transition-store status, broker REST snapshots, pattern handoff target, OHLC fence accept/reject behavior, trace events, active broker/symbol scope, and dashboard/live-report scope. PM2 env changes still require explicit operator approval. Source: `ogz-meta/sessions/session-2026-05-31-sessionrouter-finalization-gap-reconciliation.md:161-186`.

## WebSocket And Dashboard Rules
- All dashboard WebSocket URLs must use `/ws`.
- Public dashboard HTML must never carry `WEBSOCKET_AUTH_TOKEN`; do not inject long-lived runtime secrets into `<meta name="ws-token">`, inline scripts, templates, docs, examples, or backup HTML.
- Dashboard HTML that can reach browser auth paths must be served with `Cache-Control: no-store` end to end. Verify the public hostname response, not just Express origin code.
- Browser dashboard auth remains fail-closed until a gated session/ticket layer lands: empty `ws-token` metadata must not be replaced with a default or fallback secret.
- Before claiming dashboard-token containment, run `npm run scan:secrets`, `npm run test:dashboard-token`, and focused dashboard WebSocket tests, then verify prior exposed tokens are rejected without printing token values.
- Burned dashboard-token literals belong only as SHA-256 fingerprints under `ogz-meta/security/`; never commit the literal token value, even if it is dead.
- WebSocket clients must auto-reconnect.
- Do not block the main loop on disconnect.
- Handle partial data gracefully.
- Check actual data flow, not only `readyState`.
- Sender and receiver message `type` strings must match exactly.
- Zombie connections require heartbeat plus data watchdog.
- Both REST init and WebSocket stream code must set connection state correctly.
- Dashboard design stays dark theme, black background, JetBrains Mono.
- Use real backend values only.
- Massive charts matter: chart area should dominate the dashboard.
- Use terminal/hacker aesthetic with restrained animations.
- Do not use localhost in production dashboard code.
- If dashboard timeframe switching sends correct messages but shape does not change, investigate backend historical candle relay before rewriting dashboard modules.
- Do not show stock assets in the dashboard unless Alpaca/backend stock data is actually wired. Showing BTC data under a stock label is fake data.
- Hidden UI panels are not removed code. Check whether event bindings still exist before deleting or rewriting.

## Backtest Rules
- `ogz-meta/BACKTEST-OPS.md` is the single source of truth for backtesting.
- Backtests run through the same trading path as live execution.
- `EXECUTION_MODE=backtest` changes data/broker mode; it does not mean a separate fake engine.
- `full-45k.json` is BTC data. Stock strategy tests must specify stock data.
- `SOLO_STRATEGY` isolates a strategy, but the matching `ENABLE_*` flag must also allow it to register.
- `ENABLE_SMS=false` by default; set it explicitly for SMS tests.
- Use `BACKTEST_NO_PATTERN_SAVE=true` for clean backtests unless intentionally testing pattern persistence.
- Watch for stale `.env` values leaking into runs.
- Manual runs may leave `data/state-*.json`; inspect or clean intentionally if results look wrong.
- `EXIT_SYSTEM=contract` vs `legacy` changes which exit manager runs.
- Per-strategy config in `core/TradingConfig.js` can override global SL/TP/trailing/confidence env vars.
- Trust `BacktestRecorder` summary for trade stats if multiple end balances disagree.
- Do not use shell `timeout` for backtests or sweeps. Use internal max-iteration flags, visible background monitoring, or PM2 logs.
- If a backtest hangs, find the hang and fix root cause.
- Do not truncate backtest/sweep output with `tail`, `head`, `grep`, or harness output filters. If output is too long, write the full output to a log and inspect that file.
- If a backtest unexpectedly has 0 trades, check env vars and documented command shape before source-diving strategies.
- Do not claim edge, alpha, expectancy, or profitability unless the setup is apples-to-apples: asset class, fees, strategy wiring, signal behavior, and baseline all match the claim.

## Commands
Run from `OGZPMLV2-rebuild-clean-from-baseline/`.

Core:
```bash
npm start
npm test
npm run test:smoke
npm run lint:dto
npm run scan:dto
npm run ci
npm run start:prod
node run-empire-v2.js
```

Cognition and pipeline:
```bash
node ogz-meta/pipeline.js
node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "<attack prompt with exact file:line ranges>"
node trai_brain/mercury-bridge/indexer.js
```

Backtests and sweeps:
```bash
EXECUTION_MODE=backtest CANDLE_SOURCE=file CANDLE_DATA_FILE=tuning/tsla-15m-18mo.json BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_NO_PATTERN_SAVE=true FEE_MAKER=0 FEE_TAKER=0 DIRECTION_FILTER=both ACCOUNT_DRAWDOWN_BYPASS=true node run-empire-v2.js
node tools/matrix-sweep.js --data tsla --quick
node tools/matrix-sweep.js --data tsla --solo=RSI
node tools/matrix-sweep.js --data tsla --phase exits
node tools/matrix-sweep.js --data tsla --phase conf
node tools/parallel-backtest.js --quick
node tools/parallel-backtest.js --boosters
node tools/parallel-backtest.js --full
```

PowerShell env setup:
```powershell
$env:EXECUTION_MODE='backtest'
$env:CANDLE_SOURCE='file'
$env:CANDLE_DATA_FILE='tuning/tsla-15m-18mo.json'
$env:BACKTEST_MODE='true'
$env:BACKTEST_FAST='true'
$env:BACKTEST_NO_PATTERN_SAVE='true'
node run-empire-v2.js
```

VPS/debug commands the user expects:
```bash
pm2 logs
pm2 restart all
netstat -tlpn | grep 3010
tail -f /var/log/nginx/error.log
```

## VPS And Package Management Rules
- The VPS matters. Do not treat package commands as disposable setup.
- Before installing, removing, or upgrading system packages, check the current version and package owner first.
- Do not run `apt remove`, `apt purge`, or `apt autoremove` unless Trey explicitly approves the exact package list and risk.
- Never paste broken multi-line shell commands for installers. Use a single verified command line, then verify the result.
- For Node on Ubuntu, verify both `node -v` and `npm -v` after install.
- If global npm install fails with `EACCES`, do not start removing packages. Fix permissions intentionally or use `sudo` only when that is the chosen, understood path.
- On GPU instances, do not remove NVIDIA packages or anything that can affect CUDA/GPU runtime unless the task is explicitly GPU driver maintenance.
- If a package operation proposes removing many packages or hundreds of MB, stop and show the exact removal list before proceeding.
- After any VPS runtime change, verify the bot services with PM2/logs before claiming success.

## Known Landmines
- Full system wipe history: never leave only one copy of a working bot.
- Repo poisoning: do not commit brain dumps, giant logs, secrets, or huge scratch files.
- Cold-start sabotage: do not optimize, rename, duplicate, or refactor before reading context.
- Duplicate methods: search before adding helpers.
- Ledger trap: historical files in `ogz-meta/ledger/` may describe pre-fix state. Verify current code before citing them.
- Branch-memory trap: Claude memory may name old production branches. Always run branch/status checks before commit/push decisions.
- Baseline-memory trap: old P0 numbers can be superseded. Use the current canonical backtest doc/session record, then reproduce exactly.
- TRAI GPU: ctransformers needs `gpu_layers=50` or higher; verify with `nvidia-smi`.
- TRAI path mismatch: `start-ogzprime.sh` creates inference symlinks into `core/`.
- Web file permissions: public JS/CSS on VPS need readable permissions, typically `644`.
- JS variable confusion: HTML IDs are not JavaScript variables. Search declarations.
- Active trade contamination: SELL must not accumulate as active positions.
- Learned-state contamination: crypto/stocks or symbol changes can poison pattern banks, journals, decision logs, candle history, and pipeline snapshots if paths are mode-only.
- WebSocket silent death: use heartbeat and stale-data watchdog.
- DeepSeek/R1 output: clean complete, incomplete, and orphan `<think>` tags.
- Message type mismatch: sender and dashboard listeners must use the same type string.
- Timeframe charts: verify real-time subscription and REST historical fallback.
- Connection flags: reconnect logic must set and check the right connected state.
- Orphan strategy code: existing detectors must be imported/wired or removed.
- Confidence gates: defaults must be production-safe, not dev convenience.
- DTO mismatch: producer field names and consumer expectations must match.
- Position stacking: block same-direction stacking unless explicitly designed.
- SessionRouter/symbol mixing: shared global candle history across multiple symbols can create phantom gaps and restart loops. Keep single-symbol guardrails until symbol-aware context/persistence lands.

## Documentation And Session Records
- Update `CHANGELOG.md` for real code changes.
- Use append-only session docs under `ogz-meta/sessions/` at session end.
- Do not mutate rolling docs just to flip checkboxes unless explicitly tasked.
- Session docs should include what changed, root cause, smoke tests, files touched, git log, half-cooked items, open items, and next-session context.
- If unsure about a discovered rule, add a TODO with source path and short note instead of inventing policy.
- Response captures from external AIs that Trey drops by WinSCP belong in `ogz-meta/ledger/` as intake. Curate them into `ogz-meta/specs/` or `ogz-meta/cognition-history/` when they become durable.
- `ogz-meta/ledger/` is not canonical truth by default. Treat it as intake until verified and curated.
- Sourcegraph/DeepSearch reads the VPS local filesystem at `/opt/ogzprime/OGZPMLV2/`; pushing to GitHub is for audit trail, not for making a file visible to Sourcegraph.
- When saving prompts, responses, and multi-pass audit logs, use repo-rooted paths so future grep, Mercury, Sourcegraph, and git can find them.
- Session docs are frozen snapshots. New context gets a new dated session doc and a short `recent-changes` pointer; do not rewrite history to make old docs look current.

## Final Pre-Claim Checklist
Before saying work is done:
- Did I read the current file(s), not rely on memory?
- Did I verify behavior with commands/logs/tests where practical?
- Did I confirm the target path/mode/asset/broker is correct?
- Did I check whether "working" is happening on the correct target, not just happening somewhere?
- Did I avoid fake data, silent failures, and broad rewrites?
- Did I list created/modified files?
- Did I update docs/changelog/session notes if required?
- Did I report exact errors if anything failed?
