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
