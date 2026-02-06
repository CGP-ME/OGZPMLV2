---
description: Full Claudito pipeline - the complete chain for bulletproof fixes
allowed-tools: Skill, Bash, Read, Grep, Edit, Write
---

# Pipeline - Master Chain Command

## CRITICAL: USER APPROVAL GATE

**NO CODE CHANGES WITHOUT TREY'S EXPLICIT APPROVAL**

The pipeline ALWAYS stops after ARCHITECT and BEFORE FIXER to:
1. REPORT all findings
2. SHOW proposed changes with code preview
3. WAIT for "OK" or "approved" from Trey
4. ONLY THEN proceed to apply fixes

```
WARDEN → ENTOMOLOGIST → FORENSICS → ARCHITECT
                                          ↓
                                   🛑 USER APPROVAL
                                   (Pipeline PAUSES here)
                                          ↓
                              (After Trey approves)
                                          ↓
                                       FIXER → DEBUGGER → etc.
```

## PROMPT CHAINING EXECUTION

This pipeline uses **prompt chaining** - each step outputs in XML tags that feed into the next step.

### STEP 1: WARDEN (Scope Check)
```
Input: $ARGUMENTS (the task)
Output: <scope_approved>true/false</scope_approved>
        <scope_notes>what's in/out of scope</scope_notes>
```
**IF scope_approved=false, STOP and ask user.**

### STEP 2: FORENSICS (Find Issues)
```
Input: <task>$ARGUMENTS</task>
Output: <risk_map>
          <issue id="X" severity="CRITICAL|HIGH|MEDIUM|LOW">
            <location>file:line</location>
            <description>what's wrong</description>
            <fix>minimal change needed</fix>
          </issue>
        </risk_map>
```

### STEP 3: ARCHITECT (Plan Fix)
```
Input: <risk_map>{{from step 2}}</risk_map>
Output: <fix_plan>
          <approach>how to fix</approach>
          <files>files to modify</files>
          <constraints>what NOT to touch</constraints>
        </fix_plan>
```

### STEP 4: FIXER (Apply Fix)
```
Input: <fix_plan>{{from step 3}}</fix_plan>
Output: <changes>
          <file path="X">
            <before>old code</before>
            <after>new code</after>
          </file>
        </changes>
```

### STEP 5: DEBUGGER (Test)
```
Input: <changes>{{from step 4}}</changes>
Output: <test_results>
          <syntax>pass/fail</syntax>
          <smoke_test>pass/fail</smoke_test>
          <regression>pass/fail</regression>
        </test_results>
```

### STEP 6: CRITIC (Review) - LOOP POINT
```
Input: <changes>{{from step 4}}</changes>
       <test_results>{{from step 5}}</test_results>
Output: <review>
          <approved>true/false</approved>
          <weaknesses>list of issues</weaknesses>
          <constraints>additional requirements for re-fix</constraints>
        </review>
```
**IF approved=false, LOOP back to FIXER with constraints. Max 3 loops.**

### STEP 7: VALIDATOR (Quality Gate)
```
Input: <changes>{{final}}</changes>
       <test_results>{{final}}</test_results>
Output: <validation>
          <passed>true/false</passed>
          <blocking_issues>any showstoppers</blocking_issues>
        </validation>
```

### STEP 8: FORENSICS AGAIN (Landmine Check)
```
Input: <changes>{{final}}</changes>
Output: <landmine_scan>
          <clean>true/false</clean>
          <new_issues>any new bugs introduced</new_issues>
        </landmine_scan>
```
**IF clean=false, mini fix cycle: FIXER → DEBUGGER → VALIDATOR → back here**

### STEP 9: SCRIBE (Document)
```
Input: All previous outputs
Output: Updates to ogz-meta/claudito_context.md
```

### STEP 10: COMMITTER (Git)
```
Input: <changes>{{final}}</changes>
Output: <commit>
          <hash>abc123</hash>
          <message>commit message</message>
        </commit>
```

### STEP 11: CHANGELOG
```
Input: <changes>{{final}}</changes>
       <commit>{{from step 10}}</commit>
Output: Append to CHANGELOG.md
```

### STEP 12: JANITOR (Cleanup)
```
Output: <cleanup>
          <removed>temp files</removed>
          <organized>what was tidied</organized>
        </cleanup>
```

### STEP 13: LEARNING (Record)
```
Input: All outputs from pipeline
Output: <lessons>
          <learned>what we learned</learned>
          <prevent>how to prevent similar issues</prevent>
        </lessons>
```

### STEP 14: WARDEN (Final Check)
```
Input: All changes made
Output: <final_scope_check>
          <scope_maintained>true/false</scope_maintained>
          <violations>any scope creep that snuck in</violations>
        </final_scope_check>
```

## EXECUTION COMMAND

When `/pipeline` is invoked with arguments, execute ALL steps above in sequence.
Pass outputs between steps using the XML tags shown.
STOP on any blocking failure and report to user.

## THE FULL CHAIN

### PHASE 1: Analysis & Planning
```yaml
step: 1
clauditos: [Orchestrator, Warden, Architect, Purpose]
flow:
  1. Orchestrator: Receive task, coordinate team
  2. Warden: Check for scope creep, enforce standards
  3. Architect: Design technical approach
  4. Purpose: Verify alignment with mission
hooks:
  - TASK_RECEIVED → Orchestrator
  - SCOPE_CHECKED → Warden
  - APPROACH_DESIGNED → Architect
  - MISSION_ALIGNED → Purpose
```

### PHASE 2: Fix Cycle (ITERATIVE)
```yaml
step: 2
clauditos: [Fixer, Debugger, Validator, Critic]
flow:
  1. Fixer: Apply minimal fix
  2. Debugger: Test the fix works
  3. Validator: Quality gate check
  4. Critic: Find weaknesses

  LOOP until Critic approves:
    → Fixer (address weaknesses)
    → Debugger (retest)
    → Validator (revalidate)
    → Critic (review again)

max_iterations: 3
hooks:
  - FIX_APPLIED → Fixer
  - TESTS_PASSED → Debugger
  - QUALITY_GATE_PASSED → Validator
  - CRITIC_APPROVED → Critic (or CRITIC_REJECTED with constraints)
```

### PHASE 3: Deep Verification
```yaml
step: 3
clauditos: [CI/CD, Telemetry, Validator, Forensics]
flow:
  1. CI/CD: Run full test suite
  2. Telemetry: Check metrics, no regressions
  3. Validator: Final quality check
  4. Forensics: Hunt for landmines introduced

  IF Forensics finds issues:
    → Fixer → Debugger → Validator → Critic → Forensics
    (mini fix cycle)

hooks:
  - PIPELINE_PASSED → CI/CD
  - METRICS_CLEAN → Telemetry
  - FINAL_VALIDATION → Validator
  - NO_LANDMINES → Forensics (or LANDMINE_FOUND)
```

### PHASE 4: Final Salvo
```yaml
step: 4
clauditos: [Scribe, Committer, Janitor, Validator, Warden, Learning]
flow:
  1. Scribe: Update context docs (claudito_context.md)
  2. Committer: Create clean git commit
  3. Janitor: Clean up temp files, stale branches
  4. Validator: Final sanity check
  5. Warden: Enforce no scope creep snuck in
  6. Learning: Record lessons for future

hooks:
  - CONTEXT_UPDATED → Scribe
  - COMMITTED → Committer
  - CLEANED → Janitor
  - FINAL_CHECK → Validator/Warden
  - LESSONS_RECORDED → Learning
```

## EXECUTION PROTOCOL

### Starting the Pipeline
```yaml
hook: "PIPELINE_START"
to: Orchestrator
payload:
  task: "Description of what needs fixing"
  target_files: ["file1.js", "file2.js"]
  urgency: "normal|high|critical"
```

### Pipeline Completion
```yaml
hook: "PIPELINE_COMPLETE"
from: Learning
payload:
  phases_completed: [1, 2, 3, 4]
  fix_iterations: 2
  landmines_found: 0
  commit_hash: "abc123"
  lessons: ["Always check null before method call"]
```

## ABORT CONDITIONS

Pipeline STOPS immediately if:
1. **Warden** detects scope creep beyond original task
2. **Critic** rejects 3 times (escalate to human)
3. **Forensics** finds CRITICAL landmine
4. **CI/CD** tests fail after fix cycle
5. **Validator** fails final check

## QUICK REFERENCE

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Plan                                              │
│  Orchestrator → Warden → Architect → Purpose                │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: Fix (loop)                                        │
│  Fixer → Debugger → Validator → Critic ─┐                   │
│    ↑                                     │                  │
│    └─────── (if rejected) ──────────────┘                   │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: Verify                                            │
│  CI/CD → Telemetry → Validator → Forensics                  │
│    ↓ (if landmine found)                                    │
│  [mini fix cycle] → Forensics again                         │
├─────────────────────────────────────────────────────────────┤
│  PHASE 4: Ship                                              │
│  Scribe → Committer → Janitor → Validator → Warden → Learn  │
└─────────────────────────────────────────────────────────────┘
```

## YOUR MOTTO
"Every step, every time. No shortcuts to production."

---

When invoked, run ALL phases in order. The pipeline is only complete when Learning has recorded lessons.
