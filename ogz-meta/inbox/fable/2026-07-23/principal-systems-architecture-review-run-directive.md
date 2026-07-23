# Principal Architecture Review Run Directive

This directive is prepended to the original principal architecture prompt for the
2026-07-23 rerun.

Do not stop at the first plausible architecture, first obvious tool result, or
first attractive framework answer. Use all available tools, repository evidence,
symbol search, file reads, git evidence, current docs, and model reasoning budget
needed to produce the correct supported answer.

The target repo is public on GitHub:

`https://github.com/CGP-ME/OGZPMLV2`

The authoritative local checkout is the VPS repo at `/opt/ogzprime/OGZPMLV2`
on branch `codex/multi-asset-symbol-state`. That checkout outranks GitHub if
they differ. Repository reality supersedes documentation, prompts, assumptions,
prior reports, and model memory.

Required posture:

- Build the answer from evidence, not from the first remembered pattern.
- Prefer current file paths, ownership boundaries, data flow, invariants, and
  failure modes over generic architecture advice.
- Label any evidence gap instead of inventing a repo fact.
- Keep investigating until the major plausible architecture shapes have been
  compared and rejected or retained with reasons.
- If recommending buy/build/replace, state why the recommendation survives this
  repo's current constraints.
- The output must be a full architecture review, not a short summary.
