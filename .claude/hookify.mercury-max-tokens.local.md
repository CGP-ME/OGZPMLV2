---
name: warn-mercury-max-tokens
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: (mercury|callMercury|mercury-bridge|mercury-cli)
  - field: command
    operator: not_contains
    pattern: --max-tokens=7750
---

**Mercury dispatch missing `--max-tokens=7750`.**

Trey's rule (feedback-mercury-max-tokens):
> Mercury dispatch ALWAYS uses --max-tokens=7750. Never lower. Cap-truncation silently drops tasks from multi-task audits.

Cap-truncation is silent. A truncated multi-task audit returns answers for the first task and silently omits later ones — and the answer LOOKS complete. Past incidents: claimed "all 3 audits clean" when audit 3 was never executed.

Add `--max-tokens=7750` to this Mercury invocation.

If you genuinely need fewer tokens (impossible to imagine why), confirm explicitly with Trey before bypassing.

Related rules (`mercury-dispatch-playbook.md`):
- CAP TRUNCATION → bump tokens (7750)
- WRONG-PATH ANSWER → split prompt with exact file:line ranges
- ACTUAL ERROR → direct bash invocation
