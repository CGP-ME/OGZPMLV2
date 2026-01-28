# OGZ Prime - Claude Code Configuration

## ⚡ p: TRIGGER - MANDATORY PIPELINE

**When user message starts with `p:`** → FULL PIPELINE, NO EXCEPTIONS

```
User: p: dashboard not loading candles
Claude: [IMMEDIATELY runs full pipeline - no questions, no shortcuts]
```

### Pipeline Execution Order:
1. `/warden` → Scope check (approve/reject)
2. `/forensics` → Find root cause (if unknown)
3. `/fixer` → Minimal fix ONLY
4. `/debugger` → Smoke test (`./start-ogzprime.sh restart`)
5. `/validator` → Quality gate
6. `/commit` → Git commit with proper message
7. `/changelog` → Update CHANGELOG.md

**NEVER:**
- Skip steps
- "Just quickly fix it"
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

## REQUIRED READING

Before touching code, read:
- `ogz-meta/claudito_context.md` - Full system context
- `CHANGELOG.md` - Recent changes (at least top 50 lines)

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
- Never commit to main directly
- Never commit large files (>1MB)
- Never commit secrets (.env, keys, etc.)
- Check `.gitignore` before staging
