# Constructor configuration read review

Static review candidate: `8d0e3d3e937eebbc860b02f14a38dd8e648bd72e`.

Scope: 139 committed JavaScript files under `core/`, `modules/`, and
`foundation/`, plus `run-empire-v2.js`. Tests, documentation, inbox artifacts,
and runtime execution were excluded.

The AST pass examined constructor assignments of the form
`this.<property> = ConfigLoader.get('<literal path>')` and direct constructor
input property assignments. For each assignment it counted later
`this.<property>` member uses in the same class, excluding the assignment
write. It found two direct ConfigLoader candidates:

| Assignment | Result |
| --- | --- |
| `core/StrategyOrchestrator.js:823`, `confidence.regimeMinConfidence` | Already recorded as `confidence-regime-consumer` in `current-source-gaps.jsonl`; no new finding. |
| `core/StrategyOrchestrator.js:824`, `confidence.confluenceMinScore` | Already recorded as `confidence-confluence-consumer`; no new finding. |

The only other no-later-read assignments were `ContractViolation.field`,
`value`, and `expected` at `core/ContractValidator.js:20-22`. They are error
object constructor parameters, not ConfigLoader or configuration inputs, so
they are excluded.

Result: **no additional concrete configuration-consumer gap** in this bounded
pattern.

Limits: no-later-read within a class does not prove a property is dead when an
external caller, subclass, reflection, or object serialization can read it.
Whole-object configuration pass-through and nonliteral/dynamic paths are not
reported as gaps. This is not a full consumer-acceptance audit and did not run
the bot, PM2, network, or a production edit.
