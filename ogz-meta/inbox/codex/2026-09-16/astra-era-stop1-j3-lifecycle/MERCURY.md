# STOP 1 J3 Mercury attack record

The final J3 correction used the required unsteered attack:

```text
node trai_brain/mercury-bridge/ask.js "Mercury, break my fix." --max-tokens=7750 --max-iterations=60
```

Run ID: `2026-09-17T05-51-34-845Z-31f1e9933891`.

The bridge outcome was `UNVERIFIED`, not a pass: Mercury claimed a
singleton-release result-shape break, Kimi completed, and the Fable reviewer seat
was unavailable. The index was stale and the bridge used its current-diff scan.

The claim is disproved by the current source and direct receipt. `cleanup()`
intentionally recognizes boolean `false` and `{success:false}` as failures, so
boolean `true` is a valid success. No later shutdown code dereferences that
boolean. The exact-method probe exercises successful singleton release and exit
code `0`. No extra guard or lifecycle owner was added in response.

Redacted raw tapes, the redacted ledger line, and original/committed SHA-256
receipts are committed in the J3 correction packet at
`ogz-meta/inbox/codex/2026-09-17/astra-era-stop1-j3-lifecycle-correction/`.
The direct offline lifecycle receipt remains the correctness evidence; Mercury is
the required adversarial attempt only.
