# STOP 1 J1 reporter evidence

## Source receipts

- Earliest bot reporter and existing nonzero uncaught outcome: `run-empire-v2.js:3-74`.
- Config-resolved sink location/source receipt and ModuleAutoLoader connection: `run-empire-v2.js:76-80,352-362`.
- Existing optional TrAI continuation and startup shutdown now record first: `run-empire-v2.js:1864-1877,1951-1954`.
- Dashboard earliest reporter and source-result receipt: `ogzprime-ssl-server.js:46-86`.
- Standalone-checkout-only reporter and source-result receipt: `public/stripe-checkout.js:11-59,127-133`.
- Supervisor bootstrap/runtime distinction and deadman diagnostic containment: `scripts/supervisor-daemon.js:39-78,267-317`.
- Redaction, causes, receipt fields, output rebinding, and stderr fallback: `core/RuntimeAuditSink.js:16-143,166-280`.
- Module failure reporting while preserving outcomes: `core/ModuleAutoLoader.js:73-91,162-244,315-338`.

## Direct receipts

All probes used invented canary material. No real environment file or credential value was read or printed.

### Four entrypoints

An import interceptor forced one configuration-source failure after each entrypoint had loaded the sink but before its targeted source/service module loaded.

| Process role | Intercepted boundary | Exit | JSONL role/phase | Cause retained | Diagnostic and JSONL canary absence |
| --- | --- | ---: | --- | --- | --- |
| `ogz-prime-v2` | `ConfigLoader` | 1 | `ogz-prime-v2` / `configuration_source` | yes | yes |
| `ogz-websocket` | `dotenv` | 1 | `ogz-websocket` / `configuration_source` | yes | yes |
| `ogz-stripe` | `dotenv` | 1 | `ogz-stripe` / `configuration_source` | yes | yes |
| `ogz-supervisor` | `Supervisor` import | 1 | `ogz-supervisor` / `configuration_source` | yes | yes |

The resulting local JSONL contained exactly four records. Every record contained an event type, role, phase, PID, nonempty source receipt ID, outer error code, and cause code. The invented credential value and invented URL were absent from both the records and captured diagnostics.

A separate nontransmitting probe made dotenv return an error and then stopped the entrypoint at the next service import. Dashboard and standalone checkout each wrote `configurationSourceUnavailable` with `phase=configuration_source`, `source=dotenv`, `continued=true`, and the original error code. The invented credential and URL were absent from JSONL and diagnostics.

### ModuleAutoLoader

Direct fixture results:

- optional module failure produced `optionalModuleLoadFailed` and iteration continued;
- required module failure produced `requiredModuleLoadFailed`, then preserved `REQUIRED_MODULE_LOAD_FAILED` through the directory boundary;
- directory propagation produced `moduleDirectoryLoadFailed` without replacing the required error;
- missing validation produced `requiredModuleAbsent` and still threw;
- absent directory produced `moduleDirectoryAbsent` and still returned the existing empty result;
- a deliberately throwing reporter did not replace `REQUIRED_MODULE_LOAD_FAILED`;
- invented credential and URL material were absent from JSONL and diagnostics.

### Sink fallback and checkout import

- Forcing JSONL append against a directory returned `success=false`, emitted the existing stderr fallback, and exposed neither invented credential nor URL material.
- Requiring checkout as a library with an invented test credential exported the app and added zero uncaught-exception or unhandled-rejection listeners.

### Mechanical checks

- `node --check` passed for all six runtime files.
- `git diff --check` passed.
- No Jest, provider, broker, network, PM2, or successful bot/service boot was run.
