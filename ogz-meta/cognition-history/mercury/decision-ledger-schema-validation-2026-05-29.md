Mercury attack request: Decision ledger schema validation

Context:
P0 logs repeatedly showed:
`[LEDGER] Schema validation skipped: Cannot read properties of undefined (reading '_zod')`

Root cause found locally:
- `core/dto/DecisionLedgerSchema.js` used Zod v4 as `z.record(valueSchema)`.
- Zod v4 requires `z.record(keySchema, valueSchema)`.
- Current real decision-ledger payloads also carry `orchestratorDecision.competingStrategies[].rejectReason: null` for non-rejected strategies.

Patch under attack:
- `core/dto/DecisionLedgerSchema.js:5-23`
- `core/dto/DecisionLedgerSchema.js:59-121`
- `core/DecisionLedgerLogger.js:39-58`
- `test/decision-ledger-schema.test.js:1-80`

Attack questions:
1. Construct a real current decision-ledger payload where `validateLedgerSkeleton()` still throws instead of returning `{ success: true|false }`.
2. Construct malformed `indicatorValues` that are accepted as valid after the `z.record(z.string(), valueSchema)` change.
3. Construct a current real payload with `rejectReason: null` that still fails validation.
4. Construct a malformed payload that `DecisionLedgerLogger.writeOnClose()` now writes to the main `decisions` JSONL instead of the `malformed` JSONL.
5. Find any path where this patch masks an invalid ledger as valid to avoid the warning.
6. Find any new fallback/default/string substitution introduced by this patch.

Return concrete file:line findings only. If an issue is outside this patch but in the same file, label it as pre-existing residual so it does not get hidden.
