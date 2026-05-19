# OGZPrime — Grand Scheme

**Author:** Trey Buhidar (The Architect)
**Status:** North star document. This is the vision OGZPrime is being built toward.
**Last updated:** 2026-04-07

---

## What OGZPrime actually is

OGZPrime is not a trading bot. It is a fully autonomous fintech product with three integrated layers:

1. **A multi-broker, multi-asset, multi-direction, multi-timeframe trading engine** that can trade anything with a price and a venue — stocks, options, futures, forex, crypto — across any number of broker accounts simultaneously.

2. **A cross-broker arbitrage engine** that captures spread opportunities between venues for the same instrument, starting with crypto and extending to ADRs, dual-listed equities, and futures-vs-spot basis trades.

3. **TRAI — the autonomous AI brain layer** that runs everything above it, talks to the outside world on Trey's behalf, and only escalates to him when something crosses a priority threshold he sets.

The goal is not to be another retail algo bot. The goal is to be a self-running fintech company that generates trading P&L and content revenue simultaneously, with the operator (Trey) free to live his life instead of babysitting screens.

4. The bot should be Multi broker multi directional multi position multi time frame scanner that watches eight to ten specified tickers on every time frame checking it against known patterns and setups trying to find the best one or a good enough 1 to take the trade  All of the strategies fire independently they have their independent pipeline's in their own exit independent As the as the architecture develops the strategies can become more robust adding liquidity manipulation checks and fake out reversal checks and whatever else that you use multi time frame validation for Checking for liquidity checking for manipulation candles all of the above More robust strategies better signals more profit less trade    Oh I think it's said before down here on the bottom   
and it can swap between crpto and stocksn automatically autonomously and know whats ---

## The trading engine

**Bottom layer — execution.** The bot abstracts brokers behind a common adapter interface (`IBrokerAdapter.js`, `BrokerFactory.js`, `BrokerRegistry.js`). Each broker — Alpaca, IBKR, Schwab, Tastyworks, Kraken, Coinbase, Binance, OANDA, Gemini, Uphold — implements the same contract. Strategies don't know or care which broker they're trading on. The orchestrator picks signals, the executor routes orders to whichever broker the user has configured.

**Middle layer — strategies and orchestration.** Independent strategy modules emit signals each candle. The `StrategyOrchestrator` collects them, picks the highest-confidence winner, hands the trade to the executor with a per-strategy locked exit contract, and uses confluence (multiple agreeing strategies) to scale position size from 1x to 2.5x. Current strategies: RSI, EMASMACrossover, MADynamicSR, LiquiditySweep, MarketRegime, MultiTimeframe, OGZTPO, OpeningRangeBreakout, SmartMoneySweep. Coverage spans trending, ranging, breakout, and structural regimes.

**Asset class roadmap:**

- **Stocks** — primary focus, target broker Alpaca for live deployment
- **Crypto** — 90% built, paused when fees were killing edge and backtesting was unreliable. Both blockers are now addressable: backtest framework was hardened on 2026-04-07, and exchange selection (Kraken Pro / Binance / Coinbase Advanced 0% maker tiers) solves the fee problem
- **Options** — Tastyworks adapter half-built. Sequencing: comes after Apex extraction because options give leveraged amplification of strategies already validated on the underlying
- **Futures** — via IBKR adapter, primarily for index futures and CME products
- **Forex** — OANDA adapter exists, lowest priority
- **Multi-broker arbitrage** — phase 2 build, starting with crypto where spreads exist constantly across Coinbase/Kraken/Binance

**Key invariants:**

- Position size flows in USD throughout the entire pipeline (no asset-unit conversions)
- Exit contracts are locked per strategy with `_validated` fingerprints — tuning happens deliberately, not via env var sweeps
- Backtests and live trading must use identical code paths with only the execution layer swapped
- Every account is isolated — one process, one state file, one log directory, one kill switch per account

---

## TRAI — the brain layer

TRAI is not a feature. TRAI is the entire interface between OGZPrime and every human or system that touches it. The current implementation in code (`TRAIPatternIntegration.js`, `TRAIDecisionModule.js`) handles only one of TRAI's many original functions — LLM-backed pattern modulation. The full spec is much larger.

### TRAI's responsibilities

**1. News crawler + NLP layer.** TRAI continuously ingests financial news from multiple sources — Reuters, Yahoo Finance, SEC EDGAR filings, Polygon news API, sector-specific feeds — and runs sentiment analysis on every headline. It tags news by ticker, urgency, novelty, and direction. When a major catalyst is incoming (FOMC, earnings, CPI, NFP, breaking events), TRAI modulates strategy confidence in real time. On dangerous days, it can suspend all trading. On opportunity days, it can boost confidence on aligned strategies. This is the layer that prevents the bot from getting blown out by news events backtests can't see.

**2. Whale watcher.** TRAI tracks institutional flow that retail traders can't see: unusual options activity, dark pool prints, block trades, 13F filings, Form 4 insider transactions, short interest changes, ETF rebalance flows. Unusual options activity is the highest-priority signal because it gives 30-60 minute lead time on big moves — exactly the timeframe OGZPrime's strategies trade on. Whale data feeds back into strategy confidence: if SmartMoneySweep detects a sweep at a liquidity level AND TRAI's whale watcher confirms unusual options flow in the same direction, the conviction is much higher than either signal alone.

**3. Pattern modulator.** What TRAI currently does — apply confidence boost/penalty multipliers from pattern packs to orchestrator signals based on LLM-evaluated context. This is the smallest piece of the original spec but the only one currently implemented.

**4. Trade analyst and pattern sculptor.** TRAI reviews every closed trade, identifies patterns in winners and losers, and proposes refinements to the strategy logic. Over time, it acts as a continuous improvement loop — the bot learns from its own history with TRAI as the teacher.

**5. Customer service and technical support.** When OGZPrime is released to customers, TRAI handles inbound questions. It knows the bot's source code, current state, historical performance, known issues, and the customer's account context. It can debug problems, explain trade decisions, walk users through configuration, and only escalates to Trey when something actually requires human attention.

**6. Boomer onboarding assistant.** Specifically engineered to help non-technical users find their broker API keys. Schwab, IBKR, Tastyworks, Alpaca, Kraken — each broker buries its API access in a different place with different terminology. TRAI knows where each one is and walks users through screen by screen. This is the single biggest dropoff point for retail algo trading products and most companies don't bother solving it. TRAI does.

**7. Content generation.** TRAI auto-generates video content using ElevenLabs (voice) and D-ID (face). Two tracks:

- **Long-tail SEO content:** "How to get your [broker] API key" tutorials, kept current automatically as broker UIs change. Every video has a soft mention of OGZPrime. Free pipeline.
- **Performance reports and trade explanations:** TRAI reads OGZPrime's trade logs, generates a script explaining what the bot did and why, narrates it, produces shorts for TikTok/YouTube/Instagram. Automated daily/weekly content with zero human input.

**8. Dashboard widget and website chat.** TRAI is the chatbot on ogzprime.com. Same persona, same knowledge, same continuity whether you're a trader looking at your dashboard, a prospective customer asking pricing, or a support ticket.

**9. Operations manager.** TRAI ranks every event by priority — trade outcomes, system errors, news catalysts, customer messages, performance anomalies — and decides what needs Trey's attention vs what it can handle itself. Trey gets pinged on his cell only when something actually requires him. The rest runs autonomously.

### Why this matters

The trading engine is commodity work. Plenty of people build algo bots. TRAI is the moat. It's the layer that turns a trading bot into an autonomous fintech business with content marketing, customer support, and operations all running off the same AI brain. No competitor has this, and most don't even think to build it.

---

## The phased monetization plan

This is the sequence that funds itself at each step.

### Phase 1 — Apex evaluation extraction

Pass the Apex prop firm evaluation (~15% profit, sub-5% drawdown). Clone the working configuration across 20 Apex accounts running in parallel. Extract the first $25k payout cap from each cleared account. 20 accounts × $25k = $500k of working capital from one extraction cycle.

This phase has one objective: free Trey from job hunting and let him work on OGZPrime full time. Single account passing = $25k = move to Houston to be with his daughter. Twenty accounts passing = life-changing capital.

The tail risk math matters here: tuning targets the worst-case across 20 simultaneous accounts, not the average case of one. A strategy with 12% return and 3% max drawdown beats a strategy with 20% return and 8% max drawdown for Apex because you're optimizing for "20 out of 20 don't fail" rather than "one backtest looks good."

Account isolation is critical. Each Apex clone runs as its own process with its own state file, log directory, and kill switch. One account's bug never cascades to another.

### Phase 2 — Crypto arbitrage completion

Crypto build is 90% done. Resume work after Apex extraction is funding operations. Two reasons crypto was paused (fees killing edge, no backtest framework) are both now solved. Multi-broker arbitrage on Kraken/Coinbase/Binance becomes a second uncorrelated income stream.

### Phase 3 — Options trading layer

Tastyworks adapter is half-built. After arbitrage, extend OGZPrime to options. Strategies already validated on the underlying get amplified through options leverage. Same code, new execution layer. Options first because they generate higher percentage returns on smaller capital, which compounds the trading P&L faster.

### Phase 4 — Public release as a hardened product

Release OGZPrime publicly as a skeleton — bot framework with core strategies but without Trey's tuned exit contracts and proprietary configurations. Two paths considered:

- **Subscription model** — public release, support burden, race-to-the-bottom pricing. Lower priority.
- **White-glove licensing** — small number of high-paying contracts with companies who want OGZPrime wrapped in their own branding. Trey owns the source, they pay royalties. Less operational headache, higher margin.

White-glove is the preferred path. Trey stays the engineer and royalty collector. The licensee handles their customer side. The product still bears Trey's IP and the underlying TRAI brain.

### Phase 5 — Sell or move on

If OGZPrime succeeds at the white-glove tier, the option exists to either continue collecting royalties indefinitely, or sell the entire IP to a fintech company for a lump sum and move on to the next project. Both options remain open.

---

## What's running concurrently

These don't happen in strict sequence. They overlap.

- **TRAI is fleshed out continuously** as Trey extracts capital from Apex. The current LLM pattern modulator gets expanded into news crawler, then whale watcher, then content generator, then dashboard widget, etc. By the time public release happens, TRAI is the front door of the product.

- **Backtesting framework discipline is maintained at all costs.** The lessons from 2026-04-07 (locked baselines, env var audit, honest sweeps, documentation) are non-negotiable. Every future strategy goes through the validated test playbook. No shortcuts.

- **Documentation is treated as a first-class deliverable.** BACKTESTING-GUIDE.md, ENV-VAR-AUDIT.md, GRAND-SCHEME.md (this file), and every future architecture doc lives in version control. Future Treys, future Claudes, and eventually future white-glove licensees all need to be able to pick up the code cold and understand it.

---

## The personal layer

This is not a hobby project. The reason OGZPrime exists is that Trey's daughter has been in Houston for six years, four hours away, and the rat race in Corpus Christi has not generated enough income to put away savings or close that distance. OGZPrime is the path out.

**Apex extraction = Houston.** Phase 1 success means Trey moves to be with his daughter. Everything else after that — crypto, options, white-glove licensing, TRAI buildout — happens with Trey already in the same city as his kid.

The autonomous architecture is not just about elegant engineering. It's about Trey not having to babysit screens when he could be present in his daughter's life. TRAI exists so the bot runs without a human in the loop, which means the operator can be a father instead of a screen-watcher.

The end state of OGZPrime is generational wealth — a self-running business that can be passed down or sold or scaled, that earns income while Trey lives his life, that doesn't require him to choose between making money and being a present parent.

**That's the grand scheme. Everything else is implementation detail.**

---

## Status as of 2026-04-07

- **Trading engine:** working, multi-strategy, locked baseline matrix established tonight
- **Backtesting framework:** hardened and audited tonight, BACKTESTING-GUIDE.md committed
- **Broker adapters:** Alpaca primary target for live, others in various states of completion
- **Crypto:** 90% built, paused
- **Arbitrage:** planned, not started
- **Options:** Tastyworks adapter exists, not wired
- **TRAI:** pattern modulator only (5% of original spec)
- **Dashboard:** built, working, deployed at ogzprime.com
- **Infrastructure:** migrating from Vultr A100 to Vultr bare metal (vbm-4c-32gb New York) for live deployment proximity
- **Documentation:** BACKTESTING-GUIDE, ENV-VAR-AUDIT, GRAND-SCHEME (this doc) all committed to repo
- **Apex evaluation:** tuning phase, target ~15% profit / sub-5% drawdown
- **Houston:** pending Apex extraction
