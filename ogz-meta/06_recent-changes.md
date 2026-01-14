# 06 – Recent Changes

Rolling summary of important changes so an AI/dev knows what reality looks like **now**, not 6 months ago.

---

## 2026-01-12 – MAExtensionFilter (Feature Flagged, Disabled)

- **New Module**: `core/MAExtensionFilter.js`
- **Purpose**: Mean-reversion filter that skips first touch after price accelerates away from 20MA
- **Logic**:
  - Tracks extension = (close - sma20) / ATR
  - Tracks acceleration = rate of change of extension
  - After "accelerating away" event, skips first MA touch, allows second
  - Timeout reset after N bars if no second touch
- **Feature Flag**: `MA_EXTENSION_FILTER` in `config/features.json` (disabled by default)
- **Verification**: `test/verify-ma-extension-filter.js` - passed against 60k candles
- **Status**: NOT integrated into live bot yet - awaiting decision to enable

---

## 2026-01-09 – TRAI Local-First Architecture

- **Architectural Shift**: No cloud LLM/embeddings by default
- **Files Created**:
  - `trai_brain/memory_store.js` – Journal-based memory (keyword+recency, NO embeddings)
  - `trai_brain/research_mode.js` – Web search via SearXNG (OFF by default)
  - `trai_brain/prompt_schemas.js` – Structured output schemas
  - `trai_brain/read_only_tools.js` – Safe read-only toolbox
- **Files Modified**:
  - `trai_brain/trai_core.js` – Returns TRAI_OFFLINE when local LLM down (no cloud fallback)
  - `trai_brain/inference_server.py` – Embeddings disabled by default
- **Key Principle**: Local persistent LLM only, explicit flags to enable cloud features
- **Env Flags**:
  - `TRAI_ENABLE_EMBEDDINGS=1` to enable embedding server
  - `TRAI_RESEARCH_ENABLED=1` to enable web search

---

## 2026-01-10 – Decision & Trade Outcome Telemetry (Gate 7 Compliance)

- Added JSONL telemetry for PatternMemoryBank learning evaluation
- **Files Modified**:
  - `core/TRAIDecisionModule.js` – Enhanced `logDecision()` with sanitized input, version hash, mode detection
  - `core/PatternMemoryBank.js` – Added trade outcome JSONL append in `recordTradeOutcome()`
  - `core/AdvancedExecutionLayer-439-MERGED.js` – Thread `decisionId` through position object
  - `run-empire-v2.js` – Generate `decisionId` at trade execution for pattern attribution
- **New Log Files**:
  - `logs/trai-decisions.log` – JSONL decision telemetry
  - `logs/trade-outcomes.log` – JSONL trade outcome ground truth
- **Key Feature**: `decisionId` joins decisions to outcomes for pattern evaluation
- **Protocol**: Async fire-and-forget, no trading behavior changes, silent failure
- **Gate 7 Compliance**: traceId threading, decision logs, fill logs, reconcile results

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
