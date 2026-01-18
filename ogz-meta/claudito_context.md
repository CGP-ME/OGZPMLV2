# OGZPrime – Curated Context Pack
_Generated: 2025-12-25T16:21:27.388Z_
_Size: 29735 chars (limit: 30000)_


---

<!-- 00_intent.md -->

# 00_intent.md — OGZPrime Meta-Pack Intent

## 1. What this meta-pack is for
This pack exists to give an AI everything it needs to understand OGZPrime without re-explaining shit every time.  
It is the single source of truth for context.

## 2. What problems it solves
- No more losing context between sessions.
- No more reintroducing the architecture.
- No more repeating the same warnings and rules.
- No more wasted warmup time.

## 3. What the AI should be able to do after reading it
- Understand OGZPrime’s architecture.
- Understand each module’s purpose.
- Follow rules and guardrails.
- Avoid known landmines/mistakes.
- Know the current focus of development.
- Know the latest major changes.
- Apply “Trey Brain” lessons automatically.

## 4. What it should NOT contain
- No raw transcripts.
- No full code dumps.
- No giant changelogs (only summaries).
- No rambling explanations.
- No speculation.
- No outdated information.

## 5. Sources we will pull from
- Existing changelogs.
- Dev notes.
- Trey Brain lessons taken from previous convos.
- Module descriptions.
- High-level architecture docs.
- Any “burned by this before” items.

## 6. The style we expect
- Bullet points, not essays.
- Short, dense summaries.
- Brutal clarity.
- No placeholders.
- Always up-to-date with the current repo.

## 7. The end goal
After reading this pack, an AI should behave like it already knows OGZPrime and has worked on it for months.

## 8. The scope of v1
- Only OGZPrime.
- Only the modules we actually use right now.
- Only the rules we know matter today.
- Later we can expand.

## 9. How this will be used
- Paste into new Claude/ChatGPT sessions.
- Feed into RAG later.
- Act as onboarding for any future dev or agent.
- Keep OGZPrime work consistent.


---

<!-- 01_purpose-and-vision.md -->

# OGZPrime — Purpose & Vision

OGZPrime exists for one reason: to give Trey the freedom and stability to be a
present father for his daughter, Annamarie. Everything in this ecosystem traces
back to that core mission: build something powerful enough, reliable enough, and
profitable enough to change a life permanently.

What began as a simple crypto bot grew into a full trading ecosystem. OGZPrime
is designed not just to automate trades but to redefine what automated trading
can be: transparent, modular, adaptive, and genuinely intelligent.

## Vision Pillars

### 1. Financial Freedom with Purpose
OGZPrime isn’t a hobby. It’s a path to stability, relocation, and showing up
fully as a father. The bot is the key to a new chapter.

### 2. Transparency Over Hype
Most “ML trading bots” lie. OGZPrime doesn’t. Every signal, indicator, pattern,
regime shift, and decision is visible. No black boxes. No bullshit.

### 3. Safety First
The #1 cause of bot distrust is account blowups. OGZPrime’s architecture is
built around risk controls, fallbacks, reconnection safety, and strict
guardrails.

### 4. Modularity as a Superpower
OGZPrime is built like a platform. Swap modules in or out. Add new markets.
Scale to stocks, options, crypto, futures, forex, multi-broker arbitrage, MEV,
and more.

### 5. Learning Over Time
The ML tier doesn’t rely on hype words. It learns — every trade, win or lose,
improves the system.

### 6. The TRAI Layer
TRAI is the ecosystem intelligence: customer service, trading insights, AI
agent, NLP analyst, pattern interpreter, and eventually a fully autonomous
assistant trained on Trey’s thinking.

## The Core Question OGZPrime Answers
“What does a bot look like if it was built not for hype, not for marketing, but
to support a man rebuilding his life and providing for his daughter?”

OGZPrime is that answer.


---

<!-- 02_architecture-overview.md -->

# 02 – Architecture Overview

## High-Level Shape

OGZPrime is a **modular trading engine** with a clear separation between:

- **Signal/Brain Layer** – decides *what* to do
- **Execution Layer** – decides *how* to do it on real brokers
- **Risk / Guardrail Layer** – decides *if* we’re allowed to do it
- **Pattern / Learning Layer** – watches history and adapts
- **I/O / Infra Layer** – websockets, data feeds, logs, config, dashboards

Everything should plug into those lanes.  
No module should try to be “the whole bot”.

---

## Runtime Flow (Candle Loop)

1. **Market Data In**
   - Websocket / feed ingests ticks/candles
   - Normalized into a standard structure (symbol, timeframe, OHLCV, metadata)

2. **Pre-Checks**
   - Circuit/guardrail checks (market open, spread sanity, max risk per symbol, etc.)
   - If any HARD guardrail fails → **no trade**, log why.

3. **Signal Generation**
   - Technical + pattern + ML engines run:
     - Indicators (RSI/MA/ATR/etc.)
     - Pattern recognition (EnhancedPatternRecognition, pattern memory)
     - Regime detection (MarketRegimeDetector / neuromorphic cores)
   - Output: one or more **signals** with:
     - side, size_hint, confidence, rationale, metadata

4. **Decision / Consolidation**
   - Core decision brain (UnifiedTradingCore / OptimizedTradingBrain / QuantumNeuromorphicCore)
   - Merges all signals into a **single decision** per symbol:
     - “OPEN_LONG”, “OPEN_SHORT”, “CLOSE_LONG”, “FLAT”, etc.
   - Applies strategy rules + current positions + risk constraints.

5. **Execution Layer**
   - Maps decision → broker API calls:
     - position sizing
     - order type (market/limit/TP/SL)
     - retries, error handling, idempotency
   - Multi-broker logic is handled here, not in the brain.

6. **Post-Trade Logging + Learning**
   - LogLearningSystem / pattern memory update:
     - decision id
     - features snapshot
     - outcome (PnL, MAE/MFE, duration, regime tags)
   - EnhancedPatternRecognition updates:
     - pattern counts / stats
     - persist to `data/pattern-memory.json`

7. **Telemetry / Dashboard**
   - WebsocketManager + dashboard:
     - live positions
     - recent trades
     - PnL curves
     - health stats / error events

---

## Key Architectural Rules

- **Single Responsibility**
  - Each module has ONE main job (decision, execution, risk, learning, etc.).
  - If a file starts doing too many things, it’s a design smell.

- **Brain-Agnostic Execution**
  - ExecutionLayer should work with *any* brain that outputs the standard decision schema.
  - Brains can be swapped (classic, quantum, ML) without rewriting broker code.

- **Config-Driven Behavior**
  - Strategy, risk, and broker settings live in config / profiles.
  - Code shouldn’t hard-code per-broker quirks when a config can express it.

- **Deterministic on Same Inputs**
  - Given the same data + config, the system should make the same decision.
  - Randomization (if any) must be explicit and logged.

- **No Silent Failure**
  - If something is wrong (no data, malformed signal, order rejection),
    the system logs loudly with enough context to trace it later.

---

## Upgrade Path

- **New Brains** (ML/quantum/neuromorphic)
  - Plug in at the **Signal/Brain** layer.
  - Must emit the standard decision schema used by ExecutionLayer.

- **New Brokers**
  - Implement a broker adapter that speaks:
    - `placeOrder`, `cancelOrder`, `getPositions`, `getBalance`, etc.
  - ExecutionLayer routes through the adapter instead of talking per-broker APIs directly.

- **New Risk Models**
  - Attach into the **Pre-Checks** and/or **Decision** stage.
  - They should *veto* or *scale* decisions, not silently replace them.


---

<!-- 03_modules-overview.md -->

03 — Modules Overview (OGZPrime Ecosystem Architecture)

(Structured from Trey’s design intent, mission, and raw system knowledge)

Overview

OGZPrime isn’t a single bot — it is a modular, extensible trading ecosystem built to be:

safe (no blown accounts)

stable (no disconnects, no silent failures)

transparent (no black-box ML lies)

adaptive (patterns, volatility, regimes)

upgradable (add/remove specialized modules)

multi-market (crypto, stocks, futures, forex, options, MEV/arbitrage)

multi-tier (starter tier + ML tier)

future-proof (TRAI integration layer + cognitive modules)

Every module exists for a reason.
Every piece is built around solving the top 3 problems traders complain about:

Bots blowing accounts

Bots disconnecting or silently stalling

Bots not doing what they claim ("fake ML")

OGZPrime’s modules were designed from day one to eliminate these issues.

1. Unified Core Layer (The Skeleton)
UnifiedTradingCore.js

The central “brain stem” of OGZPrime.

owns the main event loop

handles time alignment

connects all major subsystems

routes data → indicators → patterns → decisions → execution

enforces safety rules and kill-switch behavior

provides the stable foundation for modular expansion

Every other module plugs into this.

2. Data + Market Intake Layer (The Eyes and Ears)
WebsocketManager.js

Live market feed handler.

manages reconnection logic

normalizes tick/candle formats

guarantees stable streaming

solves the #1 complaint: bots disconnecting

EnhancedTimeframeManager.js

Synthetic timeframe builder.

stabilizes noisy markets

aligns multi-timeframe (MTF) signals

builds custom intervals for ML tier

3. Indicator Layer (Technical Foundation)
OptimizedIndicators.js

Ultra-fast, dependency-free indicators.

RSI, MACD, EMA, BB, Volatility, etc

optimized to avoid lag

eliminates slow calculations that break decision timing

used by both tiers (core + ML)

This layer provides the raw “math” the system builds decisions on.

4. Pattern Intelligence Layer (OGZ’s Memory System)
EnhancedPatternRecognition.js

The memory engine.

extracts feature vectors from current candles

compares them to saved patterns

recalls historical setups

boosts confidence based on past outcomes

ML-tier uses this heavily

patterns save to disk reliably (fixed)

This is the system that lets the bot learn what setups work and what setups fail.

5. Market Regime Layer (Weather Station)
MarketRegimeDetector.js

Detects market conditions:

bull

bear

ranging

breakout

crash

volatility expansions/compressions

Regime affects:

aggressiveness

stop-loss width

trade frequency

ML confidence boosts

pattern weighting

6. Decision System Layer (The Tactical Brain)
OptimizedTradingBrain.js

The core logic that decides what trades to take.

Uses:

indicators

patterns

regime

volatility

price action cues

Core tier uses fixed logic.

ML tier enhances it automatically by:

learning from each trade

adjusting parameters

recognizing volatility shifts

recalling past similar setups

dynamically tuning entries/exits

The philosophy:
every trade is a lesson, win or lose.

7. MultiDirectionalTrader (The Chameleon)
MultiDirectionalTrader.js

Handles:

long

short

hedged

pair trades

multi-broker arbitrage

It adapts based on regime:

tight in chop

loose in trend

aggressive in breakouts

passive in uncertainty

This is where OGZPrime becomes more than a vanilla bot.

8. Execution Layer (The Trigger)
ExecutionLayer.js

The trade executor.

checks balances

checks position limits

ensures risk settings are safe

handles partials and scaling

prevents duplicate trades

ensures orders match broker constraints

Solves the #1 “bot blew my account” problem.

9. Profit Optimization Layer
MaxProfitManager.js

Smart exit logic.

dynamic trailing stop-loss

loosens during breakouts

tightens during volatility

break-even protection ASAP

tiered exits

range-aware support/resistance behavior

This makes exits intelligent, not fixed.

10. Logging + Learning Layer
LogLearningSystem.js

Captures:

every trade

every decision

every failure

every pattern hit

every outcome

ML tier uses this to:

tune behavior

adjust risk

improve setup recognition

adapt stop-loss/take-profit behavior

11. Future Intelligence Layer (Experimental / Quantum / GAN)
QuantumNeuromorphicCore.js

Originally attempted as a “quantum bot” but refined.

Purpose now:

provide additional synthetic signals

act as an ensemble advisor

never override core logic

feed into pattern + decision confidence

This is the research/development playground.

12. TRAI Integration Layer (Your Digital Clone)

TRAI is not a module — he’s the ecosystem agent.

He handles:

customer service

bot optimization

trade analysis

NLP layer

whale tracking

dashboard clarity

explaining decisions

being your voice when you're not present

future GPU-hosted cognitive layer

He was trained on:

your conversations

your reasoning

your frustrations

your design logic

TRAI is the “face” and “mind” of OGZPrime outside the bot code.

13. Profiles + Brokers + Keys

Profiles store:

broker keys

risk settings

market selection

trading tier (core or ML)

multi-broker mappings

This enables:

crypto

stocks

forex

futures

options

MEV/arbitrage

All using the same core architecture.

14. Pipeline Flow (Full Loop)

WebsocketManager → live data

TimeframeManager → clean MTF

Indicators → raw metrics

PatternRecognition → memory-based signals

MarketRegimeDetector → context

TradingBrain → decision

MultiDirectionalTrader → strategy routing

ExecutionLayer → broker order

MaxProfitManager → exit management

LogLearningSystem → learning + improvement

That’s the full system in motion.


---

<!-- 04_guardrails-and-rules.md -->

# OGZPrime — Guardrails & Rules

These rules exist so no agent, AI model, or automated system ever derails the
project, damages production code, or introduces silent failures. Every future
AI session must obey these.

## 1. Safety & Stability Rules

- Never introduce silent failures.
- Never mute or swallow errors.
- Never remove validation without replacing it with stronger validation.
- Never modify production code without explicit approval.
- Never generate “creative” code in core modules.

## 2. Modification Rules

- Change only the file(s) requested.
- Change only the minimal number of lines needed.
- Do not refactor unless specifically asked.
- Do not rename files or move directories.
- Do not invent new architecture on your own.
- Follow the chain-of-command if working inside Claudito flow.

## 3. Pattern System Rules

- Never touch pattern memory logic without verification.
- Never reset pattern memory unless explicitly commanded.
- Always confirm save/restore paths.
- Never assume “pattern-learning” is local — patterns must persist.

## 4. Trading Logic Rules

- Decisions must be deterministic unless ML layer overrides with learned weights.
- ML layer cannot override risk limits or veto safety checks.
- Execution must always check:
  - balance
  - open positions
  - broker constraints
  - max trade count
  - kill switch
- Exits must always obey dynamic trailing logic.

## 5. Network & Websocket Rules

- Must auto-reconnect.
- Must handle partial data gracefully.
- Must never lock main loop on disconnect.
- Must fail safe, not fail catastrophically.

## 6. Multi-Broker Rules

- Never mix credentials.
- Never place orders on unintended brokers.
- Never assume matching APIs across exchanges.

## 7. Logging Rules

- All decisions must be logged.
- All errors must be logged.
- No silent exits EVER.
- ML layer improvements must be logged for traceability.

## 8. Transparency Rules

- Never hide logic.
- Never generate fabricated ML explanations.
- All signals must be understandable.
- TRAI must be able to explain any trade in plain English.

## 9. Claudito System Rules

- Each Claudito handles ONE job.
- Orchestrator delegates — he does not fix.
- Forensics audits.
- Fixer applies minimal change.
- Debugger tests.
- Committer commits.
- No Claudito may skip another in chain.
- Hooks must be used for communication.

## 10. Forbidden Actions

- No rewriting entire modules without approval.
- No silent optimizations.
- No deleting error handling.
- No “quantum” claims unless backed by real signals.
- No inventing new indicators without spec.
- No blocking the trading loop with long tasks.

OGZPrime runs on discipline. Strict guardrails keep every AI instance in line.


---

<!-- 05_landmines-and-gotchas.md -->

## Source Control & Data Loss Landmines

### SYS_WIPE_001 – Full System Wipes & Device Failures

**Symptom:**  
- Machine dies, OS corrupt, or full wipe.  
- Bot disappears with it. Multiple times.

**History:**  
- 4 computer crashes, 3 full system wipes.  
- Bot restarted from scratch three separate times.

**Lesson / Rule:**  
- Always assume the machine can vanish tomorrow.
- Non-negotiables:
  - Cold backups (offline or external).
  - VPS copies of critical code.
  - GitHub remote as a *mirror*, not the only source of truth.
- Never have **only one** copy of a working bot.

---

### GIT_NUKE_001 – `git reset --hard` Nuclear Button

**Symptom:**  
- Panic command during repo mess.  
- Suddenly “fixed” but nobody knows what silently got deleted.

**History:**  
- Used in frustration to escape a broken state.  
- Destroyed unknown amounts of work.

**Rule:**  
- `git reset --hard` is **banned** unless:
  - Everything important is backed up AND
  - We know exactly what we’re discarding.
- Use `reset --soft`, `revert`, or targeted fixes instead.
- If an AI suggests `git reset --hard`, it’s wrong by default.

---

### GIT_POISON_002 – Repo Poisoning With Giant Files

**Symptom:**  
- Git push/pull fails.  
- Repo “locks up” or pre-commit hooks blow up.  
- LLMs “don’t understand” why.

**Causes:**  
- Committing:
  - Trai brain markdown dumps.
  - Huge LLM logs.
  - Environment secrets dumped to disk.
  - Multi-GB scratch files.
- Assistants ignoring:
  - pre-commit hooks,
  - .gitignore,
  - explicit instructions about what NOT to commit.

**Rule:**  
- Never commit:
  - Trai brain files.
  - Full raw LLM transcripts.
  - `.env` or secrets stored in code.
  - Any file > a sane size limit (e.g., >5–10 MB) without explicit intent.
- AI/agents must:
  - Check `.gitignore`.
  - Check for “brain”/log/secret files before staging.
  - Explain *exactly* what they’re staging.

---

### GIT_MAIN_003 – Main Branch Corruption

**Symptom:**  
- Main branch becomes untrustworthy.  
- Production code mixed with half-baked experiments.  
- Repeated “fixes” introduce new regressions.

**History:**  
- Assistants editing `main` directly.  
- No separation between experimental work and stable trunk.

**Rule:**  
- Nobody touches `main` directly:
  - No AIs.
  - No “quick fixes.”
- All work must go through:
  - feature branches,
  - reviews,
  - and clear commit messages.
- “This is too small for a branch” is not a valid excuse.

---

### AI_ONBOARD_004 – Cold Start Sabotage

**Symptom:**  
- New AI context window shows up and instantly:
  - starts “optimizing”
  - rewrites modules
  - duplicates logic
  - renames things
  - without understanding the bot.

**Behavior Pattern:**  
- Doesn’t read:
  - full changelog,
  - architecture docs,
  - module map.
- Pretends understanding from:
  - a couple logs or partial code,
  - then wrecks shit.
- Creates:
  - duplicate modules,
  - duplicate functions doing the same thing,
  - contradictory logic paths.

**Rule:**  
- No AI/agent edits code before:
  - Reading the packed context (`claudito_context.md`)  
  - Skimming the full `CHANGELOG`, not just the top.
  - Mapping the architecture (at least once per new session).
- If an AI cannot summarize:
  - architecture,
  - key modules,
  - and what already exists,
  - it is not allowed to propose refactors.

---

### DUP_FUNC_005 – Duplicate Methods / Double-Negation

**Symptom:**  
- Two different methods do the same thing.  
- Or both wired into the flow causing double-processing or contradictions.

**Cause:**  
- AI “adds a new helper” instead of using existing one.  
- Doesn’t search for prior implementation.  
- Ends up with:
  - `saveToDisk` and `savePatternMemory` style pairs,
  - duplicate risk checks,
  - double negations.

**Rule:**  
- Before adding a new method:
  - Search the codebase for existing functionality by intent, not just name.
- Never duplicate logic just to “clean it up” unless:
  - you also remove or migrate the old one,
  - and document it in `recent-changes`.

---

### ARCH_SKIP_006 – Editing Without Understanding

**Symptom:**  
- “Optimizations” that break the design.  
- Changes that fight the architecture instead of working with it.

**Behavior:**  
- AI doesn’t:
  - map the system,
  - understand the module responsibilities,
  - read the meta-pack.
- Instantly jumps into implementation changes based on incomplete view.

**Rule:**  
- No structural or cross-module changes without:
  - a clear architectural summary from the AI,
  - confirmation it understands “who does what.”
- If an AI can’t explain:
  - how a change fits into the architecture,
  - it’s not allowed to make it.


---

<!-- Fix Ledger (Recent/Critical) -->

# Recent Fix History

## FIX-2025-12-25-STATE-DESYNCHRONIZATION
- **Date**: 2025-12-25
- **Severity**: CRITICAL
- **Symptom**: - Three different sources of "truth" tracking the same data:
- **Fix**: - **File**: `run-empire-v2.js` (multiple locations)
- **✅ Worked**: StateManager is now the ONLY source of truth

## FIX-2025-12-25-TRAI-BLOCKING-MAIN-LOOP
- **Date**: 2025-12-25
- **Severity**: CRITICAL
- **Symptom**: - TRAI (AI decision system) blocked main loop for 2-5 seconds per decision
- **Fix**: - **File**: `run-empire-v2.js` lines 931-954
- **✅ Worked**: Bot never waits for TRAI decisions

## FIX-2025-12-25-MAP-SERIALIZATION-FAILURE
- **Date**: 2025-12-25
- **Severity**: CRITICAL
- **Symptom**: - StateManager used Maps for activeTrades
- **Fix**: - **File**: `core/StateManager.js` lines 326-385
- **✅ Worked**: Active trades persist across restarts

## FIX-2025-12-25-KRAKEN-ADAPTER-ARCHITECTURE-MI
- **Date**: 2025-12-25
- **Severity**: CRITICAL
- **Symptom**: - kraken_adapter_simple.js works but doesn't implement IBrokerAdapter interface
- **Fix**: - **File**: `core/KrakenAdapterV2.js` (NEW FILE - 322 lines)
- **✅ Worked**: Full IBrokerAdapter compliance

## FIX-2025-12-25-RECURSIVE-RATE-LIMITER-STACK-O
- **Date**: 2025-12-25
- **Severity**: CRITICAL
- **Symptom**: - Rate limiter used recursion for retries
- **Fix**: - **File**: `kraken_adapter_simple.js` lines 109-204
- **✅ Worked**: No more stack overflow on rate limits

## FIX-659-INDEX
- **Date**: 2025-12-25
- **Severity**: HIGH
- **Symptom**: Pattern memory not growing
- **Fix**: Fixed feature data conversion in pattern pipeline
- **✅ Worked**: Preserving features array through pipeline
- **❌ Failed**: String signature truncation

## FIX-659-SUMMARY
- **Date**: 2025-12-25
- **Severity**: HIGH
- **Symptom**: Pattern memory was not growing despite hours of trading. The bot only showed the BASE_PATTERN despite processing hundreds of trades.
- **Fix**: Fixed feature data conversion in pattern pipeline
- **✅ Worked**: Preserving features array through pipeline
- **❌ Failed**: String signature truncation



---

<!-- Lessons Digest -->

# Lessons Digest

*Generated: 2025-12-25T16:21:27.357Z*

## Key Lessons

- ✅ Preserving features array through pipeline
- ❌ Never: String signature truncation
- ✅ StateManager is now the ONLY source of truth
- ✅ No more phantom trades or balance mismatches
- ✅ All modules read/write to same centralized state
- ✅ Bot never waits for TRAI decisions
- ✅ Can react instantly to market moves
- ✅ TRAI does post-trade learning only
- ✅ Mathematical logic drives real-time decisions
- ✅ Active trades persist across restarts
- ✅ Bot remembers exact position after crash
- ✅ No more lost trades on reboot
- ✅ Automatic save after every state update
- ✅ Full IBrokerAdapter compliance
- ✅ Position tracking via StateManager
- ✅ Account polling (compensates for no private WebSocket)
- ✅ Working solution now, native rewrite later
- ✅ No more stack overflow on rate limits
- ✅ No more promise accumulation/memory leak
- ✅ Clean queue-based retry mechanism

## Common Patterns

### pattern-memory
- Fixed feature data conversion in pattern pipeline
- Fixed feature data conversion in pattern pipeline

### recording
- Fixed feature data conversion in pattern pipeline
- Fixed feature data conversion in pattern pipeline

### state
- - **File**: `run-empire-v2.js` (multiple locations)

### trai
- - **File**: `run-empire-v2.js` lines 931-954
- - **File**: `core/StateManager.js` lines 326-385

### performance
- - **File**: `run-empire-v2.js` lines 931-954

### rate-limit
- - **File**: `kraken_adapter_simple.js` lines 109-204



---

<!-- 06_recent-changes.md -->

# 06 – Recent Changes

Rolling summary of important changes so an AI/dev knows what reality looks like **now**, not 6 months ago.

---

## 2025-12-07 – Pattern Memory Investigation (Claudito Chain)

- Ran full Claudito chain (Orchestrator → Forensics → Fixer → Debugger → Committer) on PatternMemorySystem.
- Confirmed:
  - `this.memory` init now conditional:
    - `if (!this.memory) { this.memory = {}; }`
  - Actual persistence path:
    - `data/pattern-memory.json`
  - Root `pattern_memory.json` is legacy/decoy.
- Outcome:
  - Pattern saving working.
  - Landmine documented as `PATTERN_PATH_003`.
  - Pattern memory smoke test protocol established.

---

## 2025-12-07 – OGZ Meta-Pack Bootstrap

- Created `ogz-meta/` meta pack:
  - `00_intent.md` – why this pack exists.
  - `01_purpose-and-vision.md` – what OGZPrime is and where it’s going.
  - `02_architecture-overview.md` – high-level lanes and runtime flow.
  - `03_modules-overview.md` – map of major modules.
- Added builder:
  - `build-claudito-context.js` → outputs `claudito_context.md`.
- Usage:
  - First message paste for new AI/Claudito sessions touching OGZ code.

---

## How to Use This File

- When you make a **meaningful** change:
  - new module,
  - major fix,
  - new brain,
  - new broker integration,
  - big risk behavior change,
- Add a short entry here:
  - date
  - what changed
  - why it matters.
- This is NOT a full changelog. It’s a **high-signal summary** for AI + future Trey.


---

<!-- 07_trey-brain-lessons.md -->

## Git, Data Loss, and AI Trust – Trey’s Non-Negotiables

I’ve been burned by:

- full system wipes (multiple times),
- losing entire bots and having to rebuild from scratch,
- Git nukes (`reset --hard`),
- AIs poisoning the repo with huge files,
- assistants editing `main` like it’s a scratchpad.

This is not about “unwillingness to adapt.”  
This is about survival and sanity.

### Data & Git Lessons

- Assume the machine can die tomorrow.
- Assume the repo can get into a bad state if you’re careless.
- The job of any assistant is to **reduce** risk, not add clever new ways to lose work.

What I expect from tools/agents:

- Respect backups and cold copies.
- Treat GitHub as a mirror and recovery tool, not your personal playground.
- Never suggest `git reset --hard` as a casual fix.
- Never:
  - commit huge brain/log/secrets files,
  - shove multi-GB files through pre-commit hooks,
  - ignore `.gitignore`.

If your plan involves “nuke and pray,” it’s a bad plan.

---

### Onboarding Before Touching Code

I don’t want:

- cocky cold-start behavior,
- “I got this from a quick scan,”
- bots that refactor systems they don’t understand.

What you MUST do before changing anything:

1. Read the packed context (`claudito_context.md`).
2. Read the **full** changelog, not just the top segment.
3. Map the architecture:
   - where data comes in,
   - how signals are formed,
   - how decisions are executed,
   - where risk lives.
4. Confirm:
   - which branch we’re on,
   - which directory is actually live,
   - and whether this is production or sandbox.

Only then do you propose changes. In that order.

---

### Behavioral Red Flags (for AIs)

Red flags that make me stop trusting you:

- You start renaming things or “cleaning up” without being asked.
- You propose sweeping changes without being able to explain the architecture.
- You ignore explicit instructions (like “don’t touch main,” “don’t commit brain files,” etc.).
- You create duplicate modules or functions that already exist.
- You act like every new context window is a fresh universe where none of the previous burns matter.

If you do any of that, you’re not helping. You’re creating babysitting work.

---

### Good AI / Agent Behavior (Refined)

Good behavior, from my point of view:

- You **ask or state assumptions** when something is unclear instead of winging it.
- You can clearly summarize:
  - what OGZPrime is,
  - how it’s structured,
  - current focus,
  - recent major changes.
- You propose:
  - small, reversible changes,
  - in clearly bounded scopes,
  - with diffs and test commands.
- You don’t touch:
  - risk logic,
  - position sizing,
  - execution wiring,
  - git history,
  - without clearly labeling the impact.

The ideal AI doesn't make me babysit.
It understands that I've already rebuilt this thing from scorched earth more than once and acts accordingly.

---

## CLAUDITO MISSION LOG

### Mission: Dashboard Indicator Investigation
**Date:** 2026-01-17
**Status:** VERIFIED WORKING - NO FIX REQUIRED
**Pipeline:** /pipeline (full chain)

#### Clauditos Deployed
1. **Warden** - Scope check: APPROVED (single file, bug fix scope)
2. **Forensics** - Code audit: NO BUGS FOUND (handlers exist, DOM matches)
3. **Architect** - Design: VERIFY BEFORE FIX approach
4. **Debugger** - Testing: PASS (17 msgs/18sec, all indicator types)
5. **Validator** - Quality gate: PASSED
6. **Scribe** - Documentation: This entry

#### Findings
- WebSocket data flow: WORKING
- Bot broadcasting: WORKING (price, cvd, liquidation, fear_greed, etc.)
- Dashboard code structure: CORRECT
- Message types verified: price, cvd_update, market_internals, fear_greed, liquidation_data, pattern_analysis, divergence

#### Outcome
No code bug exists. Backend infrastructure confirmed functional. Frontend browser verification recommended for visual confirmation.

#### Lessons Learned
- Always verify before fixing - code may already be correct
- Pipeline successfully caught "no bug" scenario
- Claudito chain worked as designed
