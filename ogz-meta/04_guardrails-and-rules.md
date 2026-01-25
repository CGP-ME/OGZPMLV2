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

## 7. Logging Rules (ENHANCED 2026-01-25)

### ClauditoLogger (for AI/Agent activity)
- All hook emissions must be logged.
- All decisions must be logged with reason + confidence.
- All errors must be logged with full context.
- All mission status changes must be logged.
- All metrics must be tracked (patterns, bugs, time).
- No silent exits EVER.
- ML layer improvements must be logged for traceability.

### TradingProofLogger (for trading activity)
- Every BUY must be logged with price, size, reason, confidence.
- Every SELL must be logged with P&L calculation.
- Every position update must be logged.
- Daily summaries must be generated.
- All decisions must include plain English explanation.
- Logs stored in `ogz-meta/logs/` as JSONL for audit trail.

### Log Files
- `ogz-meta/logs/claudito-activity.jsonl` - All Claudito system activity
- `ogz-meta/logs/trading-proof.jsonl` - All trades for website proof

### Why This Matters
These logs serve as:
1. Verifiable proof of profitability for the website.
2. Audit trail for debugging issues.
3. Learning data for pattern improvement.
4. Transparency for users (per ogz-meta rules).

## 8. Transparency Rules

- Never hide logic.
- Never generate fabricated ML explanations.
- All signals must be understandable.
- TRAI must be able to explain any trade in plain English.

## 9. Claudito System Rules (MANDATORY)

```
*************************************************************
*                                                           *
*   ALL CODE CHANGES MUST GO THROUGH CLAUDITO PIPELINE      *
*                                                           *
*   *** NO EXCEPTIONS ***                                   *
*                                                           *
*************************************************************
```

No "quick fixes." No "I'll just tweak this one thing." No shortcuts.

### The Chain (in order)
1. **Warden** - Scope check first. Rejects scope creep.
2. **Forensics** - Audits code, finds bugs/landmines.
3. **Architect** - Plans the fix (minimal change only).
4. **Fixer** - Applies the fix. ONE job.
5. **Debugger** - Tests it works.
6. **Critic** - Reviews, rejects if weak.
7. **Validator** - Quality gate.
8. **Scribe** - Documents everything.
9. **Committer** - Git commit with proper message.
10. **Learning** - Records lessons for future.

### Core Rules
- Each Claudito handles ONE job.
- Orchestrator delegates — he does not fix.
- No Claudito may skip another in chain.
- Hooks must be used for communication.
- ALL decisions logged via ClauditoLogger.
- ALL errors logged - no silent failures.
- If Critic rejects → loop back to Fixer.
- If Forensics finds landmine → mini fix cycle.

### Pipeline Invocation
- Use `/pipeline` for full chain.
- Use `/orchestrate` to coordinate multi-Claudito missions.
- Never bypass pipeline for "small" changes.

### Logging (MANDATORY)
All Claudito activity must be logged:
```javascript
const { ClauditoLogger } = require('./claudito-logger');
ClauditoLogger.hook(command, state, details);
ClauditoLogger.decision(claudito, action, reason, confidence);
ClauditoLogger.error(claudito, error, context);
```

## 10. Forbidden Actions

- No rewriting entire modules without approval.
- No silent optimizations.
- No deleting error handling.
- No “quantum” claims unless backed by real signals.
- No inventing new indicators without spec.
- No blocking the trading loop with long tasks.

OGZPrime runs on discipline. Strict guardrails keep every AI instance in line.
