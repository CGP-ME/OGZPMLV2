---
name: block-no-backtest-timeout
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: timeout\s+\d+[smh]?\s+.*(backtest|sweep|walk[- ]?forward|run[- ]empire|run-empire-v2|run\.js|\bnode\s+.*backtest|\bnode\s+.*sweep|matrix-runner|phase[- ]full)
---

**BLOCKED: Backtest wrapped in `timeout`.**

Trey's rule (feedback-no-backtest-timeout):
> Never wrap backtest in `timeout`; silent false passes are worse than visible hangs.

A `timeout`-wrapped backtest exits with code 124 if it runs over — and downstream tooling may interpret a clean kill as a clean run. The result: false-positive sweep results, corrupted walk-forward output, unexplained "passes" that are actually truncations.

If the backtest is genuinely hanging:
- Find the hang and fix it (root cause)
- Use `--max-iter` flags inside the backtest (real signal, not a kill signal)
- Use `&` + monitoring (catch the hang explicitly)
- Use PM2 with logs (visible, not silent)

Visible hangs are diagnosable. Silent timeouts are landmines.

If you genuinely need to time-box a one-off probe (not a sweep, not data feeding into the matrix), set `enabled: false` on this rule, run, then re-enable. Document the bypass in the session doc.
