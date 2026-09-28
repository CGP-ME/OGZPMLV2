# Sourcegraph Deep Search — Stop 1

## Primary prompt

```text
Repository: github.com/CGP-ME/OGZPMLV2
Branch: astra-era

Help finish STOP 1 of Trey's original walk: consolidate configuration into config/settings.json for customer settings and config/internals.json for implementation constants, with the actual consumers connected. Credentials and runtime state remain separate. No silent fallbacks, overrides, or dead settings.

Start with the Stop 1 requirements in:
- ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md — Part A is Trey's words, including later additions.
- ogz-meta/inbox/astra/OGZ-HANDOFF-2026-09-02-FABLE-WALK.md — the original walk assignment, especially Stop 1.

Use those requirements and the current code to identify the concrete changes needed to finish the configuration migration. Prioritize the customer-facing configuration shape so it can be handed to the UI developer. Include the affected consumers, not just where values are declared.

These documents may save you work; use them where helpful:
- ogz-meta/inbox/astra/STOP1-CONFIG-EVIDENCE.csv — existing configuration locations and reader candidates. A reading map to check, not assumed truth.
- ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md
- ogz-meta/Alignment/TREY-RULINGS.md
- ogz-meta/inbox/astra/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md — the earlier original copy, if useful for context.

Base the result on the intended Stop 1, not on preserving prior agents' implementations. Later verbatim rulings take precedence over older conflicting notes. Stay within configuration migration; do not revive the J-series or invent new architecture, gates, or a larger audit campaign.
```
