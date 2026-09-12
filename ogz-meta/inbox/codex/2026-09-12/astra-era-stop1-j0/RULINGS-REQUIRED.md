# STOP 1 decisions

This file records Trey's 2026-09-12 decisions. It does not turn audit proposals into implementation instructions.

## K1. Resolved: restart mode

Every process start returns to paper mode. A deliberate live selection applies only to the running process and is not persisted as the next boot mode. Competing mode variables cannot disagree, and paper must govern every mutation path.

The exact runtime toggle transport remains implementation work; it must not create a durable live-on-restart owner.

## K2. Resolved: sizing values only

The configured values are 5% normal position size, 7.5% maximum position size after the existing boost logic, and 25% maximum total exposure.

STOP 1 does not redesign, replace, or newly define confidence and confluence calculations. Implementation work is limited to giving the three values truthful owners and ensuring later multipliers, share adjustment, rounding, current exposure, and pending exposure cannot violate their caps.

## K3. Resolved: daily-loss value

The daily-loss threshold value is 50% of account value. Reaching it blocks new entries, sells nothing, preserves exit handling, and requires an operator restart.

STOP 1 records and wires that value; it does not expand into a new confidence or PnL-model design under this item.

## K4. Resolved: Fourth Shape for earlier live positions

The process's startup mode does not own or reclassify an existing trade. Every accepted trade must persist its immutable execution identity at entry. A restart returns new entries to paper, while an identified earlier live trade continues only its existing exit and recovery lifecycle through its own frozen live identity.

If a broker reports a live position without matching durable trade identity, recovery first attempts to reconstruct the owner from receipts and journals. If it cannot, the external-state path is flatten that position, halt that symbol, and trace/notify the failure. The process and unrelated healthy symbols continue.

Neither an existing position nor paper startup grants permission for a new live entry or general live mutation.

## Footer

WHAT I DID: recorded Trey's restart-mode, sizing-value, daily-loss-value, and Fourth Shape trade-identity decisions.

WHAT I DID NOT DO: recommend hidden defaults or turn engineering discovery into policy questions.

WHAT I ASSUMED: sizing percentages are configuration values, not authorization to redesign confidence; Fourth Shape requires identity to be correct at trade creation and durable restoration.
