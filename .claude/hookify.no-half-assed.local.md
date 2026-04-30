---
name: warn-no-half-assed
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (quick\s+fix|for\s+now|good\s+enough|clean\s+(this|that|it)\s+up\s+later|temporary\s+(fix|workaround|patch)|band[- ]?aid|quick\s+and\s+dirty|stopgap|placeholder\s+for\s+now|hack\s+around\s+it|patch\s+for\s+now|hotfix\s+then\s+revisit)
---

**No half-assed. Do it right the first time.**

Trey's standard:
> We don't do things half-assed and lazy here. We do them right the first time even if it takes a little longer so we aren't back here fixing it when nobody is happy.

Bandaid-style language detected. Per the bandaid-vs-fix rule:
- Mercury's tactical adversarial prompts catch bug-class divergences but NOT architecture-class bandaids
- Always include architectural framing: "is this the right shape? what new failure modes does it introduce?"
- "Intentional / by-design" responses to Mercury adversarial flags are a smell — Mercury is flagging a trade-off

Default to the hard path. The "responsible engineering choice that respects the deadline" framing is bias masquerading as wisdom. Pick modular over monolithic, refactor-now over refactor-later, root-cause over patch-symptom.
