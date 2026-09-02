# Work

Mission: `protected-path-alarm`.

Executor: Amp on trusted runner `ogzprime-prod-001` in clean isolated clone
`/opt/ogzprime/OGZPMLV2-selectable-panel-correction-20260901`.

Base: `4ac6d0108bf169d44874d74181a4ee883477434f` on
`codex/multi-asset-symbol-state`.

## Implementation

- Reconstructed preserved `scripts/check-protected-paths.js` and
  `.github/workflows/protected-paths.yml` on the latest branch.
- Removed the entire trailer parser, approval gate, exemption semantics, and
  protected-touch failure path.
- Each touching commit produces one max-priority ntfy body containing author,
  full SHA, subject, and exact protected files.
- Missing `NTFY_TOPIC` is a named green absence with delivery explicitly
  unavailable and unproven. Git/range/internal/HTTP malfunction is red.
- Corrected two mechanically reproduced defects in the preserved source:
  zero-base new-branch pushes no longer replay repository history, and merge
  result changes use explicit first-parent merge diff mode.

No bot code, runtime, PM2, broker, environment/config values, activation, main,
or unrelated files changed.

## Commit relationship

Implementation and packet are delivered atomically. Per the established
predecessor-SHA mechanism, this packet names base `4ac6d0108bf169d44874d74181a4ee883477434f`;
the commit message and packet path form the reverse link without inventing the
future commit SHA.
