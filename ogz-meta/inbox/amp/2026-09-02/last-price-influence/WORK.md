# Work

Mission: `last-price-influence`.

Executor: Amp on trusted runner `ogzprime-prod-001` in clean isolated clone
`/opt/ogzprime/OGZPMLV2-selectable-panel-correction-20260901`.

Base: `4878c01762710c1127a5be541a7250115b5a56bd` on
`codex/multi-asset-symbol-state`.

## Implementation

- `run-empire-v2.js`: converts the already normalized processor OHLC end time
  back to canonical milliseconds before the existing StateManager writer;
  captures the writer's actual result; emits one `LAST_PRICE_INFLUENCE` trace;
  leaves the `if (tf === activeTf)` strategy branch intact.
- `test/aggregate-source-backfill.test.js`: adds only the authorized focused
  Part D checks for source ordering, trace truth, active-only strategy routing,
  later-frame acceptance, and older-frame rejection.
- `CHANGELOG.md`: records the trace and producer correction.

No StateManager code, monotonic comparison, runtime configuration, broker code,
or activation state changed.

## Trusted-path receipts

- Pre-correction mixed-unit probe: REST-ms mark 100 followed by later
  SessionRouter-seconds mark 101 remained 100.
- Post-correction probe: the same later frame advanced 100 to 101; a genuinely
  older frame was rejected and 101 remained stored.
- Full tracked-JavaScript AST scan: 635/635 files parsed with strict Acorn plus
  named loose fallback for four historical/non-runtime artifacts; exactly three
  production `updateLastPrice` calls, all in `run-empire-v2.js`.
- Source receipts prove both REST paths normalize `latest.t`/`latest.etime` to
  milliseconds before their StateManager calls.

Test counts are not authority. Source/diff, host probes, provider tapes, receipt
continuity, and cold-pulls are the evidence surfaces.
