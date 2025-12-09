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
