# OGZ Prime - Claude Code Configuration

## 🛑 ABSOLUTE RULE: NO CODE WITHOUT APPROVAL

**NEVER change code without Trey's explicit approval.**

Before ANY code edit:
1. REPORT what you found (bug, issue, proposed fix)
2. SHOW the exact changes you want to make
3. WAIT for "OK", "approved", "do it", or similar confirmation
4. ONLY THEN apply the fix

```
# WRONG - Never do this
Claude: "I found the bug and fixed it..."

# RIGHT - Always do this
Claude: "I found the bug. Proposed fix:
  File: run-empire-v2.js:1908
  Before: if (pos === 0 && totalConfidence >= minConfidence)
  After:  if (pos === 0 && totalConfidence >= minConfidence && brainDirection === 'buy')

  Awaiting your approval."
```

**This is THE LAW. No exceptions.**

---

## ⚡ p: TRIGGER - MANDATORY PIPELINE

**When user message starts with `p:`** → FULL PIPELINE, NO EXCEPTIONS

```
User: p: dashboard not loading candles
Claude: [IMMEDIATELY runs full pipeline - no questions, no shortcuts]
```

### Pipeline Execution Order:
1. `/warden` → Scope check + RAG query
2. `/entomologist` → Find the bug (if unknown)
3. `/forensics` → Find root cause / landmines
4. `/architect` → Design approach
5. **🛑 USER APPROVAL** → Report findings, WAIT for OK
6. `/fixer` → Minimal fix ONLY (after approval)
7. `/debugger` → Smoke test (`./start-ogzprime.sh restart`)
8. `/validator` → Quality gate
9. `/commit` → Git commit with proper message
10. `/changelog` → Update CHANGELOG.md
11. `/ledger` → Update fixes.jsonl (auto-triggers RAG reindex)

**NEVER:**
- Skip steps
- "Just quickly fix it"
- Apply fix without user approval
- Apply fix without smoke test
- Commit without running debugger

**This is not optional. This is THE LAW.**

---

## WARDEN IS ALWAYS WATCHING

Before EVERY edit, check for these scope creep triggers. If detected, STOP and warn:

### SCOPE CREEP TRIGGERS (INSTANT REJECTION)
- "while I'm at it..."
- "I also noticed..."
- "let me also fix..."
- "might as well..."
- "I'll just clean up..."
- "this could be improved..."
- Touching files not in the original task
- Refactoring code that wasn't broken
- Adding features not requested
- "Optimizing" things that work fine
- Renaming variables for "clarity"
- Adding comments to unchanged code

### WARDEN RULES
1. ONE TASK AT A TIME - finish what was asked, nothing more
2. MINIMAL CHANGES - smallest fix that solves the problem
3. NO REFACTORING unless explicitly requested
4. NO NEW FILES unless absolutely necessary
5. ASK FIRST if scope is unclear

### PUNISHMENT
If scope creep detected:
1. STOP immediately
2. Warn user: "WARDEN: Scope creep detected - [what I was about to do]"
3. Ask permission before proceeding

## REQUIRED READING (MANDATORY - NO EXCEPTIONS)

Before touching ANY code, you MUST read these files:

### Architecture (CRITICAL)
- `ogz-meta/ledger/ogzprime-architecture.mermaid` - System component map
- `ogz-meta/ledger/ogzprime-broker-chain.mermaid` - Broker layer chain
- `ogz-meta/ledger/ogzprime-data-structures.mermaid` - Data formats

### Context
- `ogz-meta/claudito_context.md` - Full system context
- `ogz-meta/04_guardrails-and-rules.md` - What NOT to do
- `ogz-meta/05_landmines-and-gotchas.md` - Known traps
- `CHANGELOG.md` - Recent changes (at least top 50 lines)

### Session Tracking
- `ogz-meta/ledger/SESSION-HANDOFF-FORM.md` - Form template (know the structure)
- `ogz-meta/sessions/` - Previous session logs (for context continuity)

**If you haven't read the mermaid charts, you DO NOT understand the architecture.**
**If you don't understand the architecture, you WILL break something.**
**No excuses. Read them.**

---

## SESSION FORM (MANDATORY)

Every session MUST use the session handoff form:

1. **START**: Orchestrator initializes form with `initializeSessionForm()`
2. **DURING**: Each claudito logs work with `appendWorkLog()`
3. **END**: Scribe finalizes with `finalizeSessionForm()` and saves

Form helper: `ogz-meta/session-form.js`
Form storage: `ogz-meta/sessions/`

**This is how context survives between sessions. This is THE LAW.**

## PIPELINE ORDER

When running full pipeline (`/pipeline`), execute in this order:

### Phase 1: Plan
1. `/orchestrate` - Coordinate
2. `/warden` - Check scope
3. `/architect` - Design approach
4. `/purpose` - Verify mission alignment

### Phase 2: Fix (loop until clean)
1. `/fixer` - Apply minimal fix
2. `/debugger` - Test it works
3. `/validator` - Quality gate
4. `/critic` - Find weaknesses
   - If rejected: loop back to fixer

### Phase 3: Verify
1. `/cicd` - Run tests
2. `/telemetry` - Check metrics
3. `/validator` - Final check
4. `/forensics` - Hunt landmines
   - If landmine found: mini fix cycle

### Phase 4: Ship
1. `/scribe` - Update context docs
2. `/commit` - Git commit
3. `/janitor` - Cleanup
4. `/validator` - Final sanity
5. `/warden` - No scope creep snuck in
6. `/learning` - Record lessons
7. `/changelog` - Document changes

## GIT RULES

- Never `git reset --hard`
- Never commit large files (>1MB)
- Never commit secrets (.env, keys, etc.)
- Check `.gitignore` before staging
- **Work on main.** Branches are rollback snapshots only. CC does not create feature branches unless Trey explicitly asks.
- **Push after every commit.** Don't batch commits without pushing.
- **Sync main after force-push:** `git branch -f main broker/alpaca-integration && git push origin main --force` when branch work is done.

---

## REPOSITORY ARCHITECTURE (UPDATED 2026-04-14)

### ogz-meta vs ogz-ledger

**`ogz-meta/specs/`** = CANONICAL TRUTH. Mercury indexes this. Verified specs, schemas, architecture docs.

**`ogz-meta/` top-level** = Pipeline infrastructure code + Claude alignment docs. Mercury indexes these as code context.

**`ogz-ledger/`** = EVERYTHING ELSE. Mercury does NOT index this. Proposals, audits, session handoffs, cold traces, historical artifacts.

**Rule:** Before committing ANY new file, ask: "Is this verified canonical truth?" YES → `ogz-meta/specs/`. NO → `ogz-ledger/`.

### Mercury RAG Hygiene

Mercury's RAG index determines what it retrieves as context. Contaminated index = bad proposals.

**What Mercury indexes:**
- `core/**`, `brokers/**`, `modules/**`, `run-empire-v2.js` (source code)
- `ogz-meta/specs/**` (canonical specs)
- `ogz-meta/*.js` (pipeline infrastructure code)
- `ogz-meta/*.md` (alignment docs — guardrails, landmines, etc.)

**What Mercury DOES NOT index (excluded via config.js SKIP_DIRS + SKIP_FILE_PATTERNS):**
- `ogz-meta/proposals/` — historical pipeline proposals
- `ogz-meta/manifests/` — pipeline mission state
- `ogz-meta/ledger/` — audits, handoffs, plans, screenshots
- `ogz-meta/health-reports/` — runtime health logs
- `ogz-meta/sessions/` — session form outputs
- `ogz-meta/audits/` — cold traces, reference material
- `ogz-ledger/**` — everything explicitly non-canonical
- `backtest-report-*.json`, `call-graph-cache.json`, `todocontext*.md`

**NEVER commit proposals, session handoffs, or working docs to `ogz-meta/specs/`.**
**NEVER commit runtime artifacts (health reports, manifests, logs) to git.**

### Document Accuracy Rule (CRITICAL)

**When a spec, handoff form, architecture doc, or any canonical artifact is proven wrong — FIX THE DOC IMMEDIATELY or ARCHIVE IT.**

Do NOT:
- Leave a wrong doc in `ogz-meta/` and just "note it in conversation"
- Create a new doc that supersedes the old one without updating or removing the old one
- Let Mercury index stale specs as if they're current truth
- Assume someone will "clean it up later"

Do:
- If the doc is fixable: edit it to match reality, commit with message explaining the correction
- If the doc is superseded: `git mv` it to `ogz-ledger/superseded/` with a commit message explaining what replaced it
- If findings prove a spec wrong: update the spec BEFORE implementing the fix, not after
- If a mermaid chart drifts from code: regenerate from source, replace the old chart

**Every wrong doc left in place is a future Mercury hallucination waiting to happen.**
Mercury cannot distinguish "this doc describes the current system" from "this doc described an old version of the system." It retrieves both equally. Stale docs in indexed paths actively degrade Mercury's output quality.

This was proven on 2026-04-14 when Mercury's output degraded progressively as more flawed proposals accumulated in the index. The fix was excluding non-canonical artifacts from indexing. The prevention is never letting them accumulate in the first place.

### Reindex Rule
After any significant code changes, reindex Mercury: `node trai_brain/mercury-bridge/indexer.js`
Mercury clears chunks and rebuilds. Trace memory (learned investigation patterns) is preserved.

---

## COGNITION PIPELINE (UPDATED 2026-04-14)

The Claudito pipeline now has Mercury-powered cognition at 6 stages:

### Bugfix Pipeline
Commander → Branch → **Architect** → **Entomologist** → **Exterminator** → Debugger → **Critic** → Validator → **Forensics** → CICD → Committer → Scribe → Janitor → Warden

### Refactor Pipeline (prefix issue with `refactor:`)
Commander → Branch → **Architect** → **Fixer** → Debugger → **Critic** → Validator → **Forensics** → Committer → Scribe → Janitor → Warden

**Bold = Mercury-powered stages** that call `callMercury()` via `ogz-meta/cognition/mercury-bridge.js`.

- **Architect:** Designs refactor plans by reading source code (30 iter max)
- **Entomologist:** Finds bugs with file:line citations
- **Exterminator:** Proposes fixes with code replacements
- **Fixer:** Verifies architect plan against actual code
- **Critic:** Reviews proposals, rejects weak fixes, loops back
- **Forensics:** Semantic risk analysis (race conditions, state mutation, etc.)

Pipeline runs in ADVISORY mode by default (proposals only, no code changes).
To execute: approve mission via `node ogz-meta/approve.js <MISSION_ID>`, then re-run with `--execute`.

### External Verification Sources
- **Mercury-2** (Inception Labs) — primary cognition layer, tool calling via ReAct loop
- **Ollama Cloud** — DeepSeek 671B + Qwen Coder 480B via REST API at `api.ollama.com`
  - Auth: Bearer token from `OLLAMA_API_KEY` env var
  - Use for independent cold-trace verification (different model families)

---

## BRAIN BUG STATUS (2026-04-14)

### What it is
7-week-old coordinated 4-layer bug across 8+ files that silently full-closes every multi-leg trade since Feb 23. MaxProfitManager returns absolute USD size, OrderExecutor treats it as a fraction, StateManager ignores the size param, trade gets deleted immediately.

### Verified scope
19 findings across 7 independent AI cold traces, all 19 confirmed by Mercury cross-verification against current HEAD. Canonical spec: `ogz-meta/specs/brain-bug-mission-05-spec.md` (if committed) or `ogz-meta/audits/cold-traces/brain-bug-mission-05-spec.md`.

### Implementation status
- Decision ledger L1-L8 shipped (JSONL persistence working)
- Set A (partial close core) proposal generated, under review
- Sets B-F queued per Mission 0.5 execution order
- Asset-agnostic requirement: `reducePosition` must operate on `trade.size` (native unit), not `trade.sizeUsd`

### Key decisions (do NOT override without Trey's explicit approval)
- **DEC-008:** Map-of-MPM-instances pattern (one MaxProfitManager per trade, not singleton)
- **DEC-013:** TradingConfig.exitContracts sealed at birth — do NOT modify
- **DEC-014:** Mercury IS the cognition layer — don't rebuild it inside Claudito
- **exitFraction:** Fraction of REMAINING position, computed BEFORE state mutation
