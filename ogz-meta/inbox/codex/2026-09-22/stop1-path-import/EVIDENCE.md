# STOP1 runner path import repair evidence

## Observed failure

The managed paper process repeatedly reached singleton construction and then
terminated with `ReferenceError: path is not defined` at
`run-empire-v2.js:483` in the pre-fix tree. The line calls `path.resolve(...)`
while the module had no module-scope `path` binding. PM2 reported the bot in
`waiting restart` with a rapidly increasing restart count. No PM2 mutation was
performed during diagnosis.

## Atomic correction

`run-empire-v2.js` now imports Node's built-in `path` module at module scope.
No configuration value, trading policy, process descriptor, or runtime state is
changed by this correction.

## Host checks

- `git diff --check` — PASS
- `node --check run-empire-v2.js` — PASS
- `npx jest --runInBand test/startup-exit-code.test.js` — BLOCKED before runner
  construction because the committed pre-STOP1 fixture omits the now-required
  dashboard token and Alpaca credentials. This is recorded as a stale-fixture
  failure, not a pass and not evidence against the import.

## Adversarial review

The required broad command was run unchanged:

`node trai_brain/mercury-bridge/ask.js --max-tokens=7750 "Mercury, break my fix."`

Mercury's first pass alleged an unchanged shutdown defect. Fable rejected the
claim for lack of evidence. On recheck, Mercury inspected the actual diff,
retracted the allegation, and concluded that the import fixes the existing
`path.resolve(...)` reference without changing shutdown behavior. Kimi's final
adjudication was `pass`. The panel's aggregate decision remained `unverified`
because no host-attested runtime receipt was supplied and doctrine coverage was
incomplete. That cap is retained; it is not reported as a gate pass.

## Remaining acceptance proof

A separately authorized controlled paper restart must prove that the managed
process loads the committed SHA, passes singleton construction, remains stable,
and publishes the expected paper/config fingerprint. Until then this is a
source repair, not a runtime acceptance claim.
