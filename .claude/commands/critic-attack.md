---
description: Adversarial Mercury attack on a proposed change, enriched with Serena blast radius
---

# /critic-attack — Serena × Mercury Adversarial Review

Adversarial review of a proposed change to a file. Serena (dep-scanner) supplies
the call-graph blast radius first, Mercury attacks the change second. The blast
radius tells Mercury which callers a change can break — Mercury can't infer this
from the file alone.

## Usage

```
/critic-attack <file-path> "<change description>"
```

Examples:
```
/critic-attack core/CandleProcessor.js "Add RTH-aware gap detection"
/critic-attack core/SessionRouter.js "Force-close on session swap"
/critic-attack modules/NoWickImbalance.js "Switch ctx.candles to ctx.priceHistory"
```

## Flow (serial — Serena first, Mercury second)

1. **Serena pass.** Call `tools/serena-bridge.js` -> `getBlastRadius(filePath)`.
   Returns `{file, callers, callerCount, riskLevel, summary, latencyMs}` with
   the inverse call graph for the target file. 5-second timeout via
   `Promise.race`. If Serena fails or times out, log it and continue without
   blast radius — never block the attack.

2. **Format for Mercury.** Call `formatForMercury(blastRadius)` to render the
   structured object as the markdown prompt section Mercury sees. Capped at
   the first 30 callers per the spec to prevent context overflow.

3. **Independent Mercury review.** Trey's 2026-11-10 correction supersedes
   the old attack wording. Dispatch one specific, neutral question through
   `trai_brain/mercury-bridge/ask.js`. Supply observations and source identity,
   not the implementer's diagnosis, preferred fix or desired verdict. Mercury
   chooses the relevant tools, callers and evidence, then derives its own answer.
   Do not turn the change description or caller list into a bundle of questions.
   Current invocation guidance: `trai_brain/mercury-bridge/README.md`.

4. **Report.** Surface Mercury's verdict to the user with file:line citations
   and the blast radius summary. Distinguish real bugs / re-flags / false
   positives openly per `feedback-transparent-audit-categorization.md`.

## Decisions locked (per spec)

- Max 30 callers in prompt (truncation prevents context overflow)
- 10-line citation tolerance per Mercury citation
- Serial sequencing: Serena first, Mercury second (no parallelism)
- 5-second Serena timeout via `Promise.race` with fallback to no-blast-radius
- Mercury max-tokens = 7750 per `feedback-mercury-max-tokens.md`

## Programmatic invocation (under the hood)

```js
const { getBlastRadius, formatForMercury } = require('./tools/serena-bridge');
const { runAgentic } = require('./trai_brain/mercury-bridge/ask');

const br = await getBlastRadius(filePath);
const blastRadius = formatForMercury(br);

const attackPrompt = [
  question, // One specific, neutral behavior question, not the work summary.
  `Relevant source location: ${filePath}; follow other evidence as needed.`,
  `Derive your own answer from current evidence. Cite the deciding source and name gaps.`,
].join('\n');

const result = await runAgentic(attackPrompt, {
  blastRadius,
  maxTokens: 7750,
  attack: true, // Existing flag enables independent-review evidence receipts.
  // No iteration limit unless Trey sets one for this run.
});
```

## When NOT to use

- Config files / docs / non-executable surfaces (per
  `feedback-mercury-scope-hot-path.md` — Mercury attack passes are for
  hot-path/bot code only).
- Single-file standalone scripts with no callers (Serena will return 0
  callers; Mercury attack still runs but blast radius adds no signal).
- Routine refactors with no behavioral change (waste of Mercury budget).

## Files

| File | Role |
|------|------|
| `tools/dep-scanner.js` | Serena core — `getCallers(target)` exposes inverse call graph |
| `tools/serena-bridge.js` | Mercury-formatting wrapper + 5s timeout enforcement |
| `trai_brain/mercury-bridge/ask.js` | `runAgentic({blastRadius})` programmatic entry |
| `trai_brain/mercury-bridge/react-loop.js` | Blast-radius injection as system message |
