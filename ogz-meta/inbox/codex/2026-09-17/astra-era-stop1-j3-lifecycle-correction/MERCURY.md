# STOP 1 J3 lifecycle correction Mercury record

## Invocation

```text
node trai_brain/mercury-bridge/ask.js "Mercury, break my fix." --max-tokens=7750 --max-iterations=60
```

- Run ID: `2026-09-17T05-51-34-845Z-31f1e9933891`.
- Bridge outcome: `UNVERIFIED`, because the Fable reviewer seat was unavailable.
- Mercury claimed a singleton-release result-shape break.
- Kimi completed; Fable did not.
- The index was stale, so the bridge used its current-diff scan. No claim of a
  fresh indexed repository is made.

## Source disposition

Mercury's claimed break does not match the reviewed live source:

- `cleanup()` deliberately accepts the two actual existing contracts: boolean
  `false`, or `{success:false}`, as failure. Boolean `true` is therefore success;
- no later shutdown code reads `result.success`, `result.reason`, or another
  property from the successful boolean result;
- the direct exact-method probe exercises successful singleton release, records
  it completed, and preserves exit code `0`.

No new guard, refusal, exit, or lifecycle owner was added for those claims. The
source paths and direct offline probe are the controlling evidence.

## Raw evidence and limits

`TAPE-MANIFEST.json` contains original and committed hashes for the redacted raw
tapes under `tapes/`. `capture-mercury-tapes.js` performs the mechanical
source-hash verification and redaction. The committed tapes were scanned after
capture without finding an unredacted credential-style assignment or
capability-bearing URL.

This run did not execute the lifecycle probe, did not read every changed file in
full, and did not obtain a two-reviewer pass. It establishes that the required
unsteered attack occurred; it is not runtime acceptance.
