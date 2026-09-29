# Sizing choices requiring runtime review

Status: NEEDS REVIEW / MAY NEED CHANGE after observing the bot. These are not validated trading recommendations and are not prerequisites for configuration migration.

Trey, September 28, 2026: "just make sure you flag it as these need to be changed kinda thing". He wants to see running behavior, graphs and decision traces before deciding these values.

| Item | What remains to be decided | Evidence needed |
| --- | --- | --- |
| Normal entry size | Appropriate customer-configured fraction; historical 5% is not a validated target. | Requested and executed dollars, account basis, fees and outcomes. |
| Boosted size | Appropriate independent ceiling; historical 7.5% is not a validated target. | Base size, each multiplier, limiting value, final quantity and outcome. |
| Aggregate allocation | Whether/how to apply the proposed total limit; historical 25% and a denominator are not approved by this note. | Open allocations, orders in flight, cash/equity/buying-power identities and concurrent entries. |
| Boost eligibility | Confidence/confluence versus proven pattern-history contributions. | Named contributing signals, pattern provenance/sample history, actual multiplier and outcome. |

The earlier assistant recommendation to use equity is withdrawn from the migration. "Accessible funds" is not treated as a settled technical definition. Do not silently translate it into cash, equity or leveraged buying power.

Migration obligation remains: enumerate and connect all producers, consumers, aliases, initialization captures, reload paths, explicit profile overrides and receipts to the intended canonical owner; preserve and expose actual units and behavior. Do not leave contradictory ownership or a silent override merely because numerical tuning is deferred. Surface a semantic conflict when it cannot be resolved from evidence and current instructions.

Before later tuning, show the current configured value alongside the value actually consumed and explain any difference. A graph or decision trace must expose the calculation, not invent a rationale. This note authorizes no runtime activation or policy change.
