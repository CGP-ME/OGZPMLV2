# Claudito Cognition Refactor — Integration Plan

**Date:** 2026-04-13
**Author:** wolf via Trey
**Branch target:** `tradingloop-clean-rewrite` (rebase onto `broker-alpaca-integration` if needed)
**Status:** Spec — for execution after operational verification revealed cognition gap
**Decision:** DEC-014 in MASTER-ROLLOUT.md
**Reference docs:**
- `ogz-meta/specs/decision-ledger-integration-plan.md` (queued behind this)
- `ogz-meta/MASTER-ROLLOUT.md`

---

## Why this exists

C1 verification revealed the Claudito chain runs all 15 stages but **doesn't actually think**. Mercury Part 1 + Part 2 audits established Mercury can read code with file:line accuracy via tool calling. Operational verification on planted bait fixtures (c2b-syntax-bug.js, c2c-race-condition.js) showed:

- Entomologist (slash-router.js:316): pattern-match parser against hardcoded paths, never reads arbitrary code
- Critic (slash-router.js:1507): 5 lines of boolean checks (bugs_found empty? tests pass?)
- Forensics (slash-router.js:1560): keyword matching ("memory" → flag leak)
- Exterminator (slash-router.js:981): template-based proposals, no LLM analysis

These four stages are stubs. The remaining 11 stages (commander, branch, architect, debugger, validator, cicd, committer, scribe, janitor, warden) are bookkeeping/gating and work fine as-is.

**Trey's lightbulb (DEC-014):** Don't refactor 4 stages with bolted-on LLM cognition. Mercury IS the cognition layer. Call Mercury from each substantive stage. One bridge wrapper, four small stage refactors. Storage is already unified in MongoDB `ogz_knowledge`.

This is one focused session of work that unblocks every future code change in the project.

---

## Architecture

```
USER FIRES PIPELINE
  ↓
Commander → loads context (existing Mercury RAG via MongoDB)
  ↓
Branch → creates mission branch from current branch
  ↓
Architect → loads claudito_context.md (existing meta-pack)
  ↓
Entomologist → CALLS MERCURY: runAgentic(entomologistPrompt)
  Returns: structured bug list with file:line citations
  Writes outcome to ai-activity stream
  ↓
Exterminator → CALLS MERCURY: runAgentic(exterminatorPrompt)
  Returns: proposed fixes with file:line edits
  ↓
Debugger → runs tests (mechanical, no Mercury)
  ↓
Critic → CALLS MERCURY: runAgentic(criticPrompt)
  Returns: critique with severity ratings
  IF critic finds severe issues → loop back to Exterminator
  ↓
Validator → checks proposal completeness (mechanical)
  ↓
Forensics → CALLS MERCURY: runAgentic(forensicsPrompt)
  Returns: semantic risk report (TOCTOU, race conditions, anti-patterns)
  IF forensics triggers → loop back to Exterminator
  ↓
CICD → runs build + tests (mechanical)
  ↓
Committer → applies changes if --execute, creates commit
  ↓
Scribe → writes documentation
  ↓
Janitor → cleanup (mechanical)
  ↓
Warden → final approval gate (mechanical scope check)
  ↓
COMPLETE → mission outcome written to fix-ledger.jsonl AND
            traces collection in MongoDB (Mercury reads on next query)
```

Four Mercury calls per pipeline run. Each ~10-30 seconds depending on complexity. Total pipeline time goes from ~2 seconds to ~1-2 minutes per mission. Acceptable trade for actual cognition.

---

## Component design

### Component 1: Mercury bridge wrapper

**File:** `ogz-meta/cognition/mercury-bridge.js` (NEW, ~80 lines)

**Purpose:** Single entry point for any Claudito stage to invoke Mercury cognition. Handles prompt construction, output parsing, error handling, and activity logging.

**API:**

```javascript
const { callMercury } = require('./mercury-bridge');

// In stage code:
const result = await callMercury({
  role: 'entomologist',           // determines prompt template
  task: 'identify bugs',           // task description
  target: {                        // what to analyze
    files: ['ogz-meta/test-fixtures/c2b-syntax-bug.js'],
    issue: manifest.issue,
    context: manifest.commander?.rag_results
  },
  outputFormat: 'structured_bugs',  // determines parser
  options: {
    maxIterations: 10,
    quiet: true,                    // suppress Mercury's stdout
    cacheKey: `entomologist:${manifest.mission_id}`
  }
});

// result shape:
// {
//   success: true,
//   data: { bugs: [...], files_analyzed: [...] },
//   iterations: 7,
//   duration_ms: 12340,
//   trace_id: 'mongo-trace-id-here'
// }
```

**Internal flow:**
1. Build prompt from role + task + target using template
2. Call `runAgentic(prompt, options)` from `trai_brain/mercury-bridge/ask.js`
3. Parse Mercury's response according to outputFormat
4. Write activity entry to `ogz-meta/logs/ai-activity.jsonl`
5. Return structured result

**Error handling:**
- Mercury timeout: return `{ success: false, reason: 'timeout', fallback: null }` — stage decides whether to fail open or closed
- Mercury rate limit: exponential backoff retry up to 3 times, then surface
- Malformed Mercury output: log to ai-activity with raw response, return `{ success: false, reason: 'parse_error' }`
- MongoDB unavailable: surface immediately, pipeline halts (no degraded mode)

### Component 2: Prompt templates

**File:** `ogz-meta/cognition/prompts.js` (NEW, ~150 lines)

**Purpose:** Role-specific prompt templates that constrain Mercury to the stage's job.

Templates for each of the four stages:

**Entomologist prompt template:**
```
You are the Entomologist stage of the Claudito pipeline. Your job is to find 
bugs in the target code.

ISSUE: {issue}

TARGET FILES:
{file_list}

CONTEXT FROM PRIOR FIXES:
{rag_context}

Use your tools (grep, open_file, get_chunk, list_files) to analyze the target 
files. Look for:
1. Syntax errors and obvious logic bugs
2. Error swallowing patterns (try/catch returning null silently)  
3. Race conditions and TOCTOU patterns
4. Async anti-patterns (forEach + async, missing awaits)
5. Resource leaks (file handles, connections)
6. Off-by-one errors and boundary conditions
7. Type confusion and null/undefined handling

DO NOT propose fixes. Only identify bugs.

Output as JSON:
{
  "bugs": [
    {
      "severity": "critical|high|medium|low",
      "type": "bug_type",
      "file": "path/to/file.js",
      "line": 123,
      "description": "what's wrong",
      "evidence": "code snippet showing the bug"
    }
  ],
  "files_analyzed": ["path1", "path2"],
  "confidence": "high|medium|low"
}
```

**Exterminator prompt template:**
```
You are the Exterminator stage of the Claudito pipeline. Your job is to 
propose fixes for bugs identified by the Entomologist.

ISSUE: {issue}

BUGS FOUND BY ENTOMOLOGIST:
{bug_list}

PRIOR FIXES FROM LEDGER (consider reusing patterns):
{rag_context}

Use your tools to read the buggy code in context. For each bug, propose a fix 
that:
1. Addresses the root cause, not just the symptom
2. Doesn't introduce new bugs
3. Preserves existing behavior except for the specific bug
4. Follows project conventions visible in surrounding code
5. Includes proper error handling (no silent swallows)

Output as JSON:
{
  "proposals": [
    {
      "bug_id": "matches entomologist bug index",
      "file": "path/to/file.js",
      "line_start": 123,
      "line_end": 125,
      "current_code": "exact current text",
      "proposed_code": "exact replacement text",
      "rationale": "why this fix",
      "side_effects": "any expected behavior changes",
      "tests_needed": ["what new tests would prove this works"]
    }
  ],
  "scope_violations": ["any bugs that need broader changes than scope allows"]
}
```

**Critic prompt template:**
```
You are the Critic stage of the Claudito pipeline. Your job is to review the 
Exterminator's proposed fixes for weakness, anti-patterns, or shortcuts.

PROPOSED FIXES:
{proposal_list}

ORIGINAL BUGS:
{bug_list}

For each proposal, evaluate:
1. Does it actually fix the root cause? (or just suppress the symptom)
2. Does it introduce silent failure modes? (try/catch swallowing errors)
3. Does it use defensive programming where assertive would be better?
4. Are there edge cases the proposal misses?
5. Is the fix the minimal change, or is there scope creep?
6. Does it follow patterns from successful prior fixes in the ledger?

Output as JSON:
{
  "reviews": [
    {
      "proposal_id": "matches exterminator proposal index",
      "verdict": "approve|reject|needs_revision",
      "severity": "blocking|major|minor",
      "issues": ["specific concerns"],
      "suggested_revisions": "if needs_revision, what to change"
    }
  ],
  "overall_verdict": "approve_all|partial_approve|reject_all",
  "loop_back_required": false
}
```

**Forensics prompt template:**
```
You are the Forensics stage of the Claudito pipeline. Your job is deep 
semantic analysis to catch silent bugs and risks the other stages might miss.

PROPOSED FINAL CHANGES:
{final_proposals}

FILES BEING MODIFIED:
{file_list}

Use your tools to analyze the proposed changes IN CONTEXT of the surrounding 
code. Look specifically for:
1. Race conditions and concurrency issues (TOCTOU, missed locks)
2. Resource leaks across error paths
3. Hidden state mutations affecting other code paths  
4. Async ordering issues (promise resolution, event loops)
5. Cross-module dependencies that the change might break
6. Performance regressions in hot paths
7. Backward compatibility breaks for callers

Output as JSON:
{
  "risks": [
    {
      "severity": "critical|high|medium|low",
      "type": "race|leak|state|async|coupling|perf|compat",
      "file": "path/to/file.js",
      "line": 123,
      "description": "what could go wrong",
      "scenario": "specific reproduction",
      "mitigation": "what would fix it"
    }
  ],
  "silent_bugs": [
    {
      "file": "path/to/file.js",
      "line": 123,
      "description": "bug not caught by entomologist or critic"
    }
  ],
  "loop_back_required": false,
  "confidence": "high|medium|low"
}
```

### Component 3: Output parsers

**File:** `ogz-meta/cognition/parsers.js` (NEW, ~60 lines)

**Purpose:** Parse Mercury's structured outputs into manifest-friendly shapes.

```javascript
parseEntomologistOutput(mercuryResponse) → { bugs: [...], files: [...] }
parseExterminatorOutput(mercuryResponse) → { proposals: [...], violations: [...] }
parseCriticOutput(mercuryResponse) → { reviews: [...], verdict: '...', loopBack: bool }
parseForensicsOutput(mercuryResponse) → { risks: [...], silentBugs: [...], loopBack: bool }
```

Each parser:
1. Attempts JSON parse of Mercury response
2. Validates against expected schema
3. On failure: logs raw response to ai-activity, returns safe empty result
4. On success: normalizes field names, returns structured data

### Component 4: Refactored stages

**File:** `ogz-meta/slash-router.js` (MODIFIED — 4 functions changed)

Each refactor follows the same pattern. Example for Entomologist (line 316):

**Before (~60 lines):**
```javascript
async function entomologist(manifest, params) {
  // Pattern-match parser
  const fileRefs = extractFileRefs(manifest.issue);
  const scans = [];
  for (const ref of fileRefs) {
    const filePath = resolveKnownPath(ref);
    if (!filePath) {
      console.log(`📂 File not found: ${ref}`);
      continue;
    }
    // ... pattern matching against fix ledger
  }
  // ... more pattern-match logic
  updateSection(manifest, 'entomologist', { bugs_found: scans.length, ... });
  return manifest;
}
```

**After (~30 lines):**
```javascript
async function entomologist(manifest, params) {
  const { callMercury } = require('./cognition/mercury-bridge');
  
  const result = await callMercury({
    role: 'entomologist',
    task: 'identify bugs in target files',
    target: {
      files: extractFileRefs(manifest.issue),  // keep existing parser as input
      issue: manifest.issue,
      context: manifest.commander?.rag_results || []
    },
    outputFormat: 'structured_bugs',
    options: {
      maxIterations: 10,
      quiet: true,
      cacheKey: `entomologist:${manifest.mission_id}`
    }
  });
  
  if (!result.success) {
    console.log(`⚠️  Entomologist: Mercury call failed (${result.reason})`);
    updateSection(manifest, 'entomologist', {
      bugs_found: [],
      mercury_failed: true,
      reason: result.reason
    });
    return manifest;
  }
  
  console.log(`✅ Entomologist: Found ${result.data.bugs.length} bugs ` +
              `(${result.iterations} Mercury iterations, ${result.duration_ms}ms)`);
  
  updateSection(manifest, 'entomologist', {
    bugs_found: result.data.bugs,
    files_analyzed: result.data.files_analyzed,
    mercury_iterations: result.iterations,
    mercury_trace_id: result.trace_id,
    confidence: result.data.confidence
  });
  
  return manifest;
}
```

Same pattern for Exterminator, Critic, Forensics. Each ~30 lines, mostly the same shape with role and outputFormat differences.

### Component 5: Activity stream

**File:** `ogz-meta/logs/ai-activity.jsonl` (NEW append-only log)

**Purpose:** Unified activity stream where both Mercury and Claudito write their cognitive activities. Replaces / supplements the existing claudito-activity.jsonl with a richer format.

**Entry shape:**
```json
{
  "timestamp": "2026-04-14T10:23:45.000Z",
  "actor": "claudito|mercury",
  "stage": "entomologist|exterminator|critic|forensics|...",
  "mission_id": "MISSION-1776116848327",
  "task": "identify bugs in c2b-syntax-bug.js",
  "duration_ms": 12340,
  "iterations": 7,
  "result_summary": "Found 2 bugs: division_by_zero, error_swallow",
  "trace_id": "mongo-trace-id",
  "files_touched": ["ogz-meta/test-fixtures/c2b-syntax-bug.js"]
}
```

This becomes the audit trail for "what did the AIs actually do today" and feeds the next-session context warmup.

### Component 6: Storage unification (mostly already done)

**Existing state (verified by CC):**
- MongoDB `ogz_knowledge.chunks` — 6803 RAG chunks, both Mercury and Claudito read
- MongoDB `ogz_knowledge.traces` — Mercury investigation traces
- `ogz-meta/fixes.jsonl` — fix ledger, written by Claudito's update-ledger.js, read by both
- `ogz-meta/meta-pack/` — indexed ogz-meta docs

**Migration needed:**
- Add Claudito mission outcomes to `ogz_knowledge.traces` collection on completion (so Mercury reads them on future queries)
- Add `ai-activity.jsonl` writes from both systems
- Verify Mercury reads `ogz-meta/fixes.jsonl` for ledger context (currently only Mercury bridge has its own ledger query path)

This is a one-time migration commit, separate from stage refactors.

---

## Build sequence

Six commits, each independently testable, ordered for incremental verification.

### Commit C-1: Mercury bridge wrapper + prompts + parsers

**Files:**
- NEW: `ogz-meta/cognition/mercury-bridge.js`
- NEW: `ogz-meta/cognition/prompts.js`  
- NEW: `ogz-meta/cognition/parsers.js`
- NEW: `ogz-meta/cognition/README.md` (usage doc)

**Test:**
```bash
node -e "
const { callMercury } = require('./ogz-meta/cognition/mercury-bridge');
callMercury({
  role: 'entomologist',
  task: 'identify bugs',
  target: { files: ['ogz-meta/test-fixtures/c2b-syntax-bug.js'], issue: 'find bugs' },
  outputFormat: 'structured_bugs',
  options: { maxIterations: 5, quiet: false }
}).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

**Pass criteria:** Returns structured result with bugs array. Mercury logs visible. Activity entry written to ai-activity.jsonl.

**No stage changes yet — pure infrastructure.**

### Commit C-2: Refactor Entomologist

**File modified:** `ogz-meta/slash-router.js` (function at line 316, ~30 lines changed)

**Test:** Re-fire C2b verification:
```bash
node ogz-meta/pipeline.js "find bugs in ogz-meta/test-fixtures/c2b-syntax-bug.js"
```

**Pass criteria:**
- Entomologist now finds at least the two planted bugs (division_by_zero, silent_swallow)
- Bugs include file:line citations matching the planted bug locations
- Mercury iterations logged in manifest
- AI activity entry written

**This is the critical proof point — if this works, the pattern works.**

### Commit C-3: Refactor Exterminator

**File modified:** `ogz-meta/slash-router.js` (function at line 981, ~30 lines changed)

**Test:** Run pipeline with --execute on c2b fixture:
```bash
# After C2b advisory pass + approve
node ogz-meta/approve.js MISSION-XXX
node ogz-meta/pipeline.js --execute "find bugs in ogz-meta/test-fixtures/c2b-syntax-bug.js"
```

**Pass criteria:**
- Exterminator generates real fix proposals (not empty)
- Proposals include actual code replacements
- Fix for division_by_zero adds zero check
- Fix for silent_swallow either removes try/catch or properly handles error
- Changes actually apply to disk in --execute mode

### Commit C-4: Refactor Critic

**File modified:** `ogz-meta/slash-router.js` (function at line 1507, ~30 lines changed)

**Test:** Plant a deliberately weak fix proposal scenario. Easiest: revert C-3, then introduce a manual "fix" that uses silent swallow. Run pipeline, verify Critic rejects.

**Pass criteria:**
- Critic identifies the silent-swallow as a weak fix
- Verdict is "reject" or "needs_revision"
- Loop-back triggered (pipeline returns to Exterminator)
- Real critique text in manifest, not boolean

### Commit C-5: Refactor Forensics

**File modified:** `ogz-meta/slash-router.js` (function at line 1560, ~30 lines changed)

**Test:** Run pipeline against c2c-race-condition.js fixture:
```bash
node ogz-meta/pipeline.js "audit ogz-meta/test-fixtures/c2c-race-condition.js for correctness"
```

**Pass criteria:**
- Forensics flags TOCTOU pattern in reducePositionUnsafe
- Forensics flags forEach+async anti-pattern in processOrdersBatch
- Risk severity is high or critical
- File:line citations are accurate

**This is the hardest test — semantic understanding of concurrency issues.**

### Commit C-6: Storage unification

**Files modified:**
- `ogz-meta/update-ledger.js` (write trace to MongoDB on completion)
- `ogz-meta/cognition/mercury-bridge.js` (write ai-activity entries)
- `trai_brain/mercury-bridge/searcher.js` (also read from `ogz-meta/fixes.jsonl` if not already)

**Test:** 
1. Run a Claudito mission to completion
2. Verify mission outcome appears in MongoDB traces collection
3. Run a Mercury query on related topic
4. Verify Mercury references the recent Claudito mission in its retrieval

**Pass criteria:** Both systems read and write to unified storage. Cross-system context flow verified.

---

## Verification gauntlet (after all 6 commits)

Re-run the operational verification from tonight, but on the upgraded chain:

### V-1: C2a (RAG retrieval test)
Re-introduce a fix from the ledger (e.g., comment out SELL_SHORT/COVER handlers). Fire pipeline. **Pass criteria:** Chain pulls FIX-2026-03-26-LONG-ONLY-PIPELINE from ledger and reapplies it. Mercury's RAG retrieval surfaces the prior fix.

### V-2: C2b (syntax/logic bug)
Re-fire on c2b-syntax-bug.js fixture. **Pass criteria:** Both bugs identified and fixed cleanly. Critic approves the fixes.

### V-3: C2c (semantic bug)
Fire on c2c-race-condition.js fixture. **Pass criteria:** TOCTOU and forEach+async both flagged. Either Forensics or Critic identifies them.

### V-4: C3 (scope creep rejection)
Fire pipeline with: "fix bugs in c2b-syntax-bug.js AND also refactor TradingConfig.js"

**Pass criteria:** Warden blocks at first stage. Pipeline refuses to proceed. Scope creep prevention is mechanical (existing Warden code), so this should pass without cognition refactor — but verify it still works after the changes.

### V-5: C4 (interruption recovery)
Start a pipeline run with --execute, kill mid-stage. **Pass criteria:** Either clean rollback OR next pipeline run detects orphan mission and refuses to proceed.

### V-6: C5 (now redundant)
The original C5 test (Mercury+Claudito integration) is now satisfied by the entire architecture. Skip — passing V-1 through V-3 implies V-6.

If V-1 through V-5 all pass, the chain has cognition AND discipline. Cleared for L1 ledger build.

---

## Risk analysis

### Risk: Mercury rate limits / cost

Each pipeline run hits Mercury 4 times. At Mercury-2 rates and ~10-30 second average per call, that's maybe 50-200 input tokens per call after RAG retrieval, plus output. Estimated cost per pipeline run: $0.05-$0.20 depending on complexity.

**Mitigation:** The `cacheKey` parameter in `callMercury` enables result caching for identical prompts within a session. Worth implementing if cost becomes meaningful, otherwise YAGNI.

**Burn impact:** $1,350/month tooling becomes $1,400/month at 250 pipeline runs/month. Noise.

### Risk: Mercury failure mid-pipeline

If Mercury times out or returns malformed output mid-pipeline, the bridge returns `{ success: false, reason: ... }`. Each stage decides how to handle.

**Stage-by-stage failure policy:**
- Entomologist failure: empty bugs list, downstream stages have nothing to act on, pipeline completes with no proposed changes (safe degradation)
- Exterminator failure: empty proposals, Critic has nothing to review, pipeline completes with no changes
- Critic failure: skip critique, default to "approve all" (RISKY — flag this in manifest, surface to user)
- Forensics failure: skip forensics, log warning, proceed (LOW RISK — Forensics is post-hoc)

**Mitigation:** All Mercury failures logged loudly. User sees "Mercury call failed" in pipeline output. No silent degradation.

### Risk: Mercury hallucinates bugs that don't exist

Mercury's RAG retrieval is grounded but not infallible. Possible Mercury claims a bug at line X that doesn't exist there.

**Mitigation:** Exterminator stage opens the file and reads the actual code at the claimed line before proposing fixes. If the bug location doesn't match Mercury's description, Exterminator returns "bug location mismatch" instead of inventing a fix.

### Risk: Mercury proposes fixes that break tests

Mercury's fix could pass syntax check but break existing tests.

**Mitigation:** Debugger stage runs full test suite after Exterminator's changes apply. Any test failure → loop back to Exterminator with failure context. Pipeline can't complete with broken tests.

### Risk: Mercury's prompts drift from intent

Prompts in `ogz-meta/cognition/prompts.js` define each stage's job. Drift = scope creep.

**Mitigation:** Prompts are versioned. Schema for Mercury output is enforced by parser. Critic's job specifically includes catching scope violations.

### Risk: One-off latency vs throughput

Pipeline goes from 2 seconds to 1-2 minutes per run. For ad-hoc fixes (like the partial-close work), this is fine. For sweep-style automation (e.g., running pipeline on every file in a directory), this becomes a real bottleneck.

**Mitigation:** Not a current concern. Pipeline is fired manually for individual missions. If batch operation becomes a need, add a `--batch` mode that bypasses cognition stages and uses Mercury for sampling only.

---

## Decision log additions for MASTER-ROLLOUT.md

```
DEC-014 (2026-04-13): Operational verification revealed Claudito chain runs 
but doesn't think. Entomologist + Forensics + Critic + Exterminator are 
pattern-match stubs. Decision: refactor those 4 stages to call Mercury via 
shared bridge. Other 11 stages stay as bookkeeping/gating scaffold.

DEC-015 (2026-04-13): Storage stays unified in MongoDB ogz_knowledge. Both 
Mercury and Claudito read from chunks collection (6803 chunks), both write 
mission/investigation outcomes to traces collection. fix-ledger.jsonl 
remains the canonical fix log, both systems read it.

DEC-016 (2026-04-13): Mercury-2 is the cognition layer for both Mercury 
direct queries AND Claudito stages. No second LLM integration. No 
duplicated tool registry. One model, one bridge, one set of tools.

DEC-017 (2026-04-13): Pipeline execution time goes from ~2 seconds to 
~1-2 minutes per mission. Trade is intentional — actually thinking takes 
time. Acceptable given that we fire pipelines per-mission, not in batches.
```

---

## Master Checklist additions for MASTER-ROLLOUT.md

Insert before Phase 1 (Decision Ledger Build):

```
### Phase 0.5: Claudito Cognition Refactor (NEW - blocks L1)

- [ ] C-1: Mercury bridge wrapper + prompts + parsers
- [ ] C-2: Refactor Entomologist
- [ ] C-3: Refactor Exterminator  
- [ ] C-4: Refactor Critic
- [ ] C-5: Refactor Forensics
- [ ] C-6: Storage unification verification
- [ ] V-1: RAG retrieval test (re-introduce known fix)
- [ ] V-2: Syntax/logic bug test (c2b fixture)
- [ ] V-3: Semantic bug test (c2c fixture)
- [ ] V-4: Scope creep rejection test
- [ ] V-5: Interruption recovery test

Pass criteria: V-1 through V-5 all green = chain has cognition + discipline
```

---

## Sequencing in the larger plan

Updated Apex critical path with cognition refactor inserted:

1. ~~Operational verification (T1-T4, C1-C5)~~ ← T1-T4 + C1 done; C2-C5 superseded by V-1 through V-5
2. **Claudito cognition refactor (C-1 through C-6)** ← THIS SPEC, ~1 session
3. **Verification gauntlet (V-1 through V-5)** ← ~30 minutes after refactor
4. Decision ledger build (L1+L2+L4+L5+L8 bundle) ← original spec, ~1-2 sessions
5. Smoke test ledger on one backtest
6. Partial-close pipeline fix bundled with L6+L7 ← original plan
7. Matrix run on home rig with FIXED exits + LIVE ledger
8. Pick best single strategy with NEW validated contracts
9. Alpaca finishing + live-mode hard-gate + PID persistence
10. Apex eval

The cognition refactor adds maybe 6-8 hours of focused work. It buys back probably 2-3 weeks of "human-bottlenecked code review" across L1-L8 + partial-close fix.

---

## What CC does after wolf approves this spec

Tonight (close-out):
1. Commit this spec to `ogz-meta/specs/claudito-cognition-refactor-plan.md`
2. Commit DEC-014 through DEC-017 additions to MASTER-ROLLOUT.md
3. Commit Phase 0.5 checklist additions
4. Push to remote
5. Stand down for the night

Tomorrow (refactor session):
1. Read this spec end-to-end
2. Execute C-1 through C-6 in order
3. Run V-1 through V-5 verification gauntlet
4. Report results
5. If all green → fire L1 with cognition-equipped chain

---

## Notes for future Claude/Mercury reading this

When you read this doc in a future session:

1. The cognition gap was discovered on 2026-04-13 during operational verification of the Claudito pipeline. C1 passed mechanically but inspection of Entomologist/Forensics/Critic/Exterminator showed they were pattern-match stubs. Trey's unifying insight (DEC-014, DEC-016) was that Mercury IS the cognition layer — don't rebuild it inside Claudito, call it.

2. The 6-commit refactor brings Claudito's substantive stages up to use Mercury via a shared bridge. The 11 mechanical stages (commander, branch, architect, debugger, validator, cicd, committer, scribe, janitor, warden) stay as-is — they're bookkeeping and don't need cognition.

3. After this refactor, Claudito missions take ~1-2 minutes instead of ~2 seconds. The trade is intentional — actual thinking takes actual time. Don't optimize this back to 2 seconds without understanding why it was made slow.

4. If Mercury changes (new model, new tools, new index), the bridge in `ogz-meta/cognition/mercury-bridge.js` is the single integration point. Update there, both Mercury direct queries AND Claudito stages benefit.

5. The bait fixtures (`ogz-meta/test-fixtures/c2b-syntax-bug.js` and `c2c-race-condition.js`) are PRESERVED for regression testing. Any future cognition changes should re-run V-2 and V-3 to verify nothing regressed.

---

**End of spec.**

This integrates with `ogz-meta/specs/decision-ledger-integration-plan.md` (which becomes Phase 1 after Phase 0.5 cognition refactor lands). Both specs reference `ogz-meta/MASTER-ROLLOUT.md` as the canonical project state doc.
