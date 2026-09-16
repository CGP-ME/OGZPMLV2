# STOP 1 J1 reporter correction evidence

## Reproduction

From the repository root:

```bash
node ogz-meta/inbox/codex/2026-09-15/astra-era-stop1-j1-reporter-correction/probe-j1-reporter.js /tmp/j1-reporter-recheck.json
```

The committed `PROBE-RECEIPT.json` was produced by the same command with the output path changed to that file. The receipt records SHA-256 values for the three runtime inputs and the probe source so a cold pull can establish that it is running the same program against the same source bytes.

The entrypoint child processes write stdout and stderr to regular scratch files before the parent reads them. The probe requires the expected non-secret diagnostic prefixes and redaction markers to be present; empty output cannot satisfy those assertions. Checkout's early-failure fixture stubs Express and CORS before injecting the dotenv failure, so the documented command does not depend on those packages being installed.

## Direct results

- Eight sink cases passed: four redaction cases, mixed Error/object cycle, ordinary cause chain, writable-stderr append failure, and throwing code accessor.
- The prefixed assignment, quoted-key assignment, and ntfy capability canaries were absent from JSONL and diagnostic output.
- The mixed cycle produced a record with a bounded circular marker; formatting returned normally.
- The throwing accessor was named without being invoked.
- The writable-stderr fallback retained process role, phase, source receipt ID, runtime scope, outer code, and cause code.
- ModuleAutoLoader continued after optional failure, retained `REQUIRED_MODULE_LOAD_FAILED`, retained that code when the reporter itself threw, returned the existing empty result for an absent directory, and still threw for missing required modules.
- All four entrypoints exited 1 on an intercepted early failure and wrote role/phase/source receipt plus outer/cause codes with the invented canary absent.
- All four early-failure diagnostics contained the expected process-specific prefix plus `[REDACTED]` and `[REDACTED_URL]`; the probe rejects an empty diagnostic capture.
- Dashboard and checkout dotenv-returned-error cases recorded `continued=true` before the intercepted next-service stop.
- The instrumentation-order fixture recorded the unhandled-rejection instrumentation listener before the application listener and recorded the uncaught instrumentation callback before the terminating application reporter.
- Supervisor runtime handlers recorded both events, returned from both emissions, and the stub continued afterward with exit 0.
- Supervisor stdout contained both lifecycle fixture messages, and stderr contained both redacted runtime-event diagnostics.
- Importing checkout as a library changed neither process error-listener count.

## Mechanical results

- `node --check` passed for the three runtime files and the probe source.
- `git diff --check` passed for the prepared correction.
- No successful application boot, Jest suite, SDK, provider, broker, notification, network, PM2, or trading operation is part of this receipt.

`PROBE-RECEIPT.json` contains the exact redacted JSONL/stdout/stderr captured by the probe, not only this summary. The earlier receipt's empty child output is withdrawn as diagnostic-output evidence; the regenerated receipt must contain the positively asserted captures.
