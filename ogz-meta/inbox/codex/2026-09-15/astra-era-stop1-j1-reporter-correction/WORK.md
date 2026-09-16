# STOP 1 J1 reporter correction work

1. `run-empire-v2.js` gives the existing terminating bootstrap listeners stable identities. They remain installed before configuration. After instrumentation loads, the same listeners are removed and appended again so instrumentation callbacks retain their pre-J1 participation order.
2. `core/RuntimeAuditSink.js` now carries one shared depth/cycle set across Error and object shapes. Property descriptors are read without invoking accessors, and every public formatting path returns a safe string.
3. The redactor recognizes sensitive tokens inside prefixed names and quoted assignment keys. The ntfy topic is explicitly classified as capability-bearing input.
4. The writable-stderr fallback now retains process role, phase, source receipt identity, runtime scope, outer code, and bounded cause evidence from the original event.
5. `core/ModuleAutoLoader.js` no longer reaches back into an unsanitized reporter error or original error when the reporter has no usable record. Required and optional outcomes remain unchanged.
6. `probe-j1-reporter.js` is the exact direct probe. It uses invented inputs, scratch directories, intercepted service imports, and a nontransmitting instrumentation callback. Its complete captured output is `PROBE-RECEIPT.json`.

The audit sink intentionally redacts complete URLs because failure formatting cannot safely infer whether a URL path or query carries capability material. This does not alter ordinary connection logging that does not pass through the audit sink.

The sink's ambient environment read supplies redaction values and diagnostic process metadata such as PM2 identity. It selects no bot configuration and changes no bot behavior. The later atomic configuration cut must classify this as sanitization and diagnostic metadata input, not as a surviving bot-configuration consumer.

## Footer

WHAT I DID: corrected the five reporter defects at their existing owners and added reproducible direct probes.

WHAT I DID NOT DO: migrate configuration, start an application successfully, call providers/brokers/network services, run Jest, or touch PM2.

WHAT I ASSUMED: J1 remains reporter-only and J2 remains held until this correction passes cold pull.
