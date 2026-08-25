# Executor Brief — Silent Failure Remediation

For whoever holds the executor seat (Amp/Codex) after the rails are up. Architect: Fable. Every claim below was verified against live code on 2026-08-25 at `codex/multi-asset-symbol-state`. File:line included so nothing needs rediscovery.

**Read this first:** the fixes below are *producer-level*. The failure mode to avoid is putting a guard downstream of where the bad value is manufactured — that looks like a fix, absorbs the symptom, and guarantees the producer never gets repaired. I made exactly that mistake on item 1 and it had to be thrown away.

---

## Tier 0 — before any work (operator)

1. Launch from the repo: `cd /opt/ogzprime/OGZPMLV2 && claude`. Project hooks resolve **once, from the launch directory**. Launching elsewhere means zero hooks, silently.
2. Run `/hooks` — expect 8. If they're missing, stop.
3. Prove the gate fires: attempt an edit to any `core/` file, expect `BLOCKED`. Fixed in `555d3683`; before that it had never blocked an edit since 2026-03-11 (it matched `^core/` against absolute paths and exited 0).

## Tier 1 — gates that run without memory (operator decision)

`scan:config-boundary` exists, exits 1, reports **197 findings** (101 silent-or-default overrides, 96 raw `process.env` reads), and is **not in `ci`**. Current: `ci = scan:secrets && lint:dto && scan:dto && test`. Adding it turns CI red until the debt clears. That is doctrinally correct and practically costly — operator's call.

---

## Item 1 — Broker `$0` price kills every exit (highest blast radius)

**Defect chain, verified:**
- `brokers/AlpacaAdapter.js:490` — `price: parseFloat(limit_price || filled_avg_price || 0)`. A broker response missing both fields yields `$0`.
- That `$0` is written as `entryPrice` by `core/StateManager.js` `openPosition`, which validates `sizeUsd`, `entryOrderQuantity`, `remainingOrderQuantity` and units — **but never price**.
- `core/ExitContractManager.js:336` — `if (!trade || !trade.entryPrice) return { shouldExit: false, ... details: 'No valid trade' }`. Falsy check, so `entryPrice === 0` returns "do not exit" **on every tick, forever**. Stop loss, take profit, trailing stop and max-hold all silently disabled on a live position. No log, no trace.

**Scale:** 41 `parseFloat(... || 0)` sites across 8 adapters (`InteractiveBrokers` 9, `Alpaca` 9, `Schwab` 6, `Oanda` 6, `Uphold` 5, `CME` 3, `Gemini` 2, `Tastyworks` 1). There is **no shared broker-result normalizer** today — verified.

**Correct fix — one seam, not twelve:** create a shared broker-truth normalizer in `foundation/` that every adapter returns through, which yields **named absence (null) instead of a fabricated 0** for price and quantity. Then nothing downstream needs a guard.

**Do NOT:** patch the 41 sites individually; add a validation gate in `openPosition` and call it done (that is containment, not a cure — it leaves the producer intact and makes it permanent).

**Receipts:** stage a broker response missing both price fields, show the trade refused with a named trace. Then twin backtest runs — with and without the change — must be **trade-for-trade identical** on historical data, proving nothing legitimate is rejected.

## Item 2 — State restore validates nothing

`core/StateManager.js:4404-4435` (`load()`) rehydrates `activeTrades` and rebuilds every trade via `withExitLifecycleFields(trade, { legacy: true })` with **zero per-trade checks**. The validating function `_normalizeActiveTradesInput` (which runs identity + quantity invariants) is only wired to `set('activeTrades', ...)`, not to `load()`. A persisted trade with a broken price, identity, or quantity restores clean.

**Fix:** run the per-trade invariants on the load path and **quarantine** failures using the machinery already present (`quarantinedTrades`, `_normalizeQuarantinedTrades`, the container-quarantine block at `:4412`). **Do not throw** — `_normalizeActiveTradesInput` throws, and a throw on the boot path kills the bot, violating "nothing shuts down my bot altogether."

## Item 3 — Dead data feed does not pause trading

`run-empire-v2.js:2928-2932` — the liveness watchdog detects a fully dead feed, fails REST backfill, prints two `console.error` lines including the literal `- not pausing trading`, emits **no trace**, and continues. Open positions are managed against the last known price indefinitely. Compare `SessionRouter._enterFailedSafe` — the correct pattern, same codebase.

## Item 4 — `ConfigLoader.get()` is the producer behind 101 downstream gates

`ConfigLoader.get()` returns `undefined` for a missing path, so every caller defends itself with `|| {}` / `|| []` / `?? default` — **101 sites**, 40 of them in `core/StrategyOrchestrator.js` alone, including `:942` which hardcodes a shadow copy of the MTF timeframe list. Each local default then feeds another default (`finiteConfigNumber(cfg.x, 'name', 0.95, 0)`), so a missing config path becomes a silently invented number two hops later with no trace at either hop.

**Fix one function** — `ConfigLoader.get()` on a required path names absence loudly — and all 101 downstream guards become unnecessary rather than needing individual removal. Largest Fourth Shape win available.

## Item 5 — One transient provider error permanently disables TRAI

`core/persistent_llm_client.js:143` → `core/TRAIDecisionModule.js:147` → `core/trai_core.js:172,181` → `run-empire-v2.js:1821`. **Zero retry/backoff anywhere** (`rg "retry|backoff|attempt"` returns nothing in the first two files). Inception returns a spurious `402 Account is inactive` on the **first request after idle**, then serves normally — reproduced 402 → 200 ×5 with identical requests. So one cold-start response at boot disables TRAI for the entire process lifetime, announced only via `console.error`.

**Fix:** retry with backoff on transient provider errors before declaring unready; emit a trace, not a console line.

## Item 6 — `_diag` is a production no-op

`core/TradingLoop.js:74` — `if (process.env.STRATEGY_DIAG !== 'true') return;`. Any error path whose only handling is `_diag(...)` emits **zero bytes in production** — e.g. `TradingLoop.js:1078`, where a failed decision-autopsy persist for an exit-check with no price vanishes silently. Also `process.exit(1)` at `run-empire-v2.js:319` and `:3632`.

## Item 7 — "Paper" profile arms live webhook orders

`ecosystem.config.js` `ogz-prime-v2` env sets `EXECUTION_MODE: 'paper'`, `LIVE_TRADING: 'false'` **and** `WEBHOOK_ORDERS_ENABLED: 'true'`, `WEBHOOK_DRY_RUN: 'false'`, with a populated `SIGNALSTACK_WEBHOOK_URL`. `core/OrderExecutor.js:2808` computes `isWebhookExecutionRoute` from the adapter alone — it never consults `paperTrading` — and `:2852` picks `webhook` over `simulated`. Every ConfigLoader guard for this combination is scoped to `config.mode.liveTrading` (`:1199`, `:1257`, `:1263`), so paper + armed webhook **passes validation silently**.

`test/ecosystem-eval-profile.test.js:175-200` **asserts this as correct** under the name "default PM2 env stays paper" — ratified in `76d9ee88 "Fixed PM2 eval live runtime env"`, written for the live posture. Fix the profile and the test together or the test re-arms it. (Same test has a duplicate `STATE_FILE` key, `:194` and `:205`; the second wins and the first assertion is dead.)

**Upstream fix:** `paperTrading === true` should structurally force `executionRoute = 'simulated'` so no env combination can produce a paper-labeled real order.

## Item 8 — Doc truth

- `AGENTS.md:89`, `ogz-meta/AGENTS.md:292`, `Alignment/OGZ-MASTER-ALIGNMENT.md:13` still instruct "keep `SESSION_ROUTER_ENABLED=false`". That variable was **deleted** in `becd6ad4` (2026-07-12) and a test asserts its absence. Cold agents read this and believe the router is off; it is always-on and profile-owned (`sessionRouter.mode` = `static|scheduled`).
- `sessionRouter.schedule` is **required and validated** by `foundation/ConfigLoader.js:587-588,679-681` but **never read** by `SessionRouter.js` or passed by `run-empire-v2.js:863-874`. No profile contains a `schedule` block, so `mode: "scheduled"` hard-fails at boot. Scheduled stock/crypto switching cannot be enabled until this is wired.

---

## Traps

- **Mercury cold-start:** first call after idle returns `402 Account is inactive`, then works. Always retry before concluding the account is down. Keys are denoted in `.env`: `INCEPTION_API_KEY` = TRAI brain, `INCEPTION_API_KEY_DEV` = Mercury adversarial, `MOONSHOT_API_KEY` = Fable/Kimi consensus.
- **Mercury needs `rg`** — the binary, not a shell alias. Without it every grep-backed tool fails closed.
- **Test counts are not evidence.** The suite was green while item 1 was live. Proof is behavior on a receipt; for MTF specifically, proof is money (twin runs).
- **Pre-existing red suites** (fail on a clean tree, unrelated to new work): `session-router-stock-symbol-config` (stale `routerMode` string, renamed in `a0afdc81`), `mercury-index-scope`, `live-report-outcome-contract`, `dashboard-equity-source-contract`, `eval-signal-path-proof`, `trai-llm-config-contract`, `marketing-pages-static-contract`.
- **Never edit files under a live PM2 process** with `autorestart: true` — a crash reloads whatever is on disk, unreviewed.
