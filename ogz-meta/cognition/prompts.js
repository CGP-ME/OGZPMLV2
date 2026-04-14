'use strict';

function buildEntomologistPrompt({ files, issue, context }) {
  const fileList = (files || []).join('\n');
  const ragContext = (context || [])
    .map(c => `[${c.severity || 'INFO'}] ${c.symptom || c.description || c.text || ''}`.slice(0, 200))
    .join('\n') || 'No prior fixes found';

  return `You are the Entomologist stage of the Claudito pipeline. Your job is to find bugs in the target code.

ISSUE: ${issue}

TARGET FILES:
${fileList}

CONTEXT FROM PRIOR FIXES:
${ragContext}

Use your tools (grep, open_file, get_chunk, list_files) to analyze the target files. Look for:
1. Syntax errors and obvious logic bugs
2. Error swallowing patterns (try/catch returning null silently)
3. Race conditions and TOCTOU patterns
4. Async anti-patterns (forEach + async, missing awaits)
5. Resource leaks (file handles, connections)
6. Off-by-one errors and boundary conditions
7. Type confusion and null/undefined handling
8. Division by zero or missing input validation

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
}`;
}

function buildExterminatorPrompt({ bugs, issue, context }) {
  const bugList = JSON.stringify(bugs || [], null, 2);
  const ragContext = (context || [])
    .map(c => `[${c.severity || 'INFO'}] ${c.fix || c.description || ''}`.slice(0, 200))
    .join('\n') || 'No prior fixes found';

  return `You are the Exterminator stage of the Claudito pipeline. Your job is to propose fixes for bugs identified by the Entomologist.

ISSUE: ${issue}

BUGS FOUND BY ENTOMOLOGIST:
${bugList}

PRIOR FIXES FROM LEDGER (consider reusing patterns):
${ragContext}

Use your tools to read the buggy code in context. For each bug, propose a fix that:
1. Addresses the root cause, not just the symptom
2. Doesn't introduce new bugs
3. Preserves existing behavior except for the specific bug
4. Follows project conventions visible in surrounding code
5. Includes proper error handling (no silent swallows)

Output as JSON:
{
  "proposals": [
    {
      "bug_id": 0,
      "file": "path/to/file.js",
      "line_start": 123,
      "line_end": 125,
      "current_code": "exact current text",
      "proposed_code": "exact replacement text",
      "rationale": "why this fix",
      "side_effects": "any expected behavior changes",
      "tests_needed": ["what tests would prove this works"]
    }
  ],
  "scope_violations": []
}`;
}

function buildCriticPrompt({ proposals, bugs }) {
  const proposalList = JSON.stringify(proposals || [], null, 2);
  const bugList = JSON.stringify(bugs || [], null, 2);

  return `You are the Critic stage of the Claudito pipeline. Your job is to review the Exterminator's proposed fixes for weakness, anti-patterns, or shortcuts.

PROPOSED FIXES:
${proposalList}

ORIGINAL BUGS:
${bugList}

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
      "proposal_id": 0,
      "verdict": "approve|reject|needs_revision",
      "severity": "blocking|major|minor",
      "issues": ["specific concerns"],
      "suggested_revisions": "if needs_revision, what to change"
    }
  ],
  "overall_verdict": "approve_all|partial_approve|reject_all",
  "loop_back_required": false
}`;
}

function buildForensicsPrompt({ proposals, files }) {
  const proposalList = JSON.stringify(proposals || [], null, 2);
  const fileList = (files || []).join('\n');

  return `You are the Forensics stage of the Claudito pipeline. Your job is deep semantic analysis to catch silent bugs and risks the other stages might miss.

PROPOSED FINAL CHANGES:
${proposalList}

FILES BEING MODIFIED:
${fileList}

Use your tools to analyze the proposed changes IN CONTEXT of the surrounding code. Look specifically for:
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
}`;
}

function buildArchitectPrompt({ issue, context }) {
  const ragContext = (context || [])
    .map(c => `[${c.severity || 'INFO'}] ${c.description || c.text || ''}`.slice(0, 300))
    .join('\n') || 'No prior context';

  return `You are the Architect stage of the Claudito pipeline. Your job is to design a refactor plan by reading the actual source code.

TASK: ${issue}

PRIOR CONTEXT:
${ragContext}

Use your tools (grep, open_file, list_files) to read every file mentioned in the task. For each file:
1. Read the current implementation at the relevant lines
2. Identify what needs to change and why
3. Specify the exact before/after code with file:line targets
4. List cross-file dependencies (what other files break if this file changes alone)

Then produce a coordinated plan:
- Which files change
- What each change does
- Dependency ordering (what must land first)
- Integration points between files
- What tests verify the refactor worked

Output as JSON:
{
  "plan": {
    "summary": "one-line description of the refactor",
    "files": [
      {
        "path": "core/SomeFile.js",
        "changes": [
          {
            "line_start": 123,
            "line_end": 125,
            "current_code": "exact current text",
            "new_code": "exact replacement text",
            "rationale": "why this change"
          }
        ],
        "dependencies": ["core/OtherFile.js"],
        "test": "how to verify this file's changes work"
      }
    ],
    "ordering": ["file1 first because...", "file2 after because..."],
    "verification": "end-to-end test command and pass criteria"
  }
}`;
}

function buildFixerPrompt({ plan, issue, context }) {
  const planText = JSON.stringify(plan || {}, null, 2);
  const ragContext = (context || [])
    .map(c => `[${c.severity || 'INFO'}] ${c.description || c.text || ''}`.slice(0, 200))
    .join('\n') || 'No prior context';

  return `You are the Fixer stage of the Claudito pipeline. The Architect has produced a refactor plan. Your job is to verify the plan against the actual code and produce concrete file edits.

ARCHITECT'S PLAN:
${planText}

ORIGINAL TASK: ${issue}

PRIOR CONTEXT:
${ragContext}

For each file in the plan:
1. Use open_file to read the current code at the specified lines
2. Verify the plan's "current_code" matches what's actually in the file (lines may have drifted)
3. If lines drifted, find the correct location using grep
4. Produce the final concrete edits with verified line numbers

Output as JSON:
{
  "edits": [
    {
      "file": "core/SomeFile.js",
      "line_start": 123,
      "line_end": 125,
      "current_code": "verified current text from file",
      "new_code": "exact replacement text",
      "verified": true,
      "drift_note": "if lines moved, explain"
    }
  ],
  "scope_violations": [],
  "risks_identified": []
}`;
}

module.exports = {
  buildEntomologistPrompt,
  buildExterminatorPrompt,
  buildCriticPrompt,
  buildForensicsPrompt,
  buildArchitectPrompt,
  buildFixerPrompt,
};
