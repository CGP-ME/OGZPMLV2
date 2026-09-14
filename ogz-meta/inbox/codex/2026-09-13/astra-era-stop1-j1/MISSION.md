# STOP 1 J1: one configuration owner and early failure reporting

## Authority

J0 assigned credential production and early failure reporting to J1 and the final configuration cut to J7/J8 (`ogz-meta/inbox/codex/2026-09-12/astra-era-stop1-j0/CONTROLLING-SPEC.md:44-53,159-166`). Trey's 2026-09-13 ruling rejects a temporary full `process.env` projection because it would preserve the scattered ambient-reader architecture that this work is meant to remove.

Current doctrine requires upstream repair, truthful receipts, and no new supervisory or trading authority. Sources: `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md:7-21,49-57` and `ogz-meta/Alignment/TREY-RULINGS.md:12`.

## Question investigated

How do we remove competing dotenv producers without either disconnecting existing inputs or preserving an ambient compatibility layer that becomes another permanent owner?

## Result

The credential-source removal and the J7/J8 configuration cut are one atomic ownership change. J1 must not delete dotenv independently and must not replace it with temporary full-environment hydration.

The final ownership contract is:

- credentials, capability-bearing URLs, and true process-bootstrap inputs: one bootstrap source;
- customer/trading behavior: `config/settings.json`;
- static implementation values: `config/internals.json`;
- one ConfigLoader-built immutable runtime snapshot delivered explicitly to consumers;
- no production module independently loads dotenv or reads ambient `process.env` after the bootstrap boundary.

Current source has six dotenv read or mutation sites on declared runtime paths:

1. `foundation/ConfigLoader.js:473-492,1478-1507` parses `.env` privately.
2. `ecosystem.config.js:5-13` hydrates the PM2 descriptor process.
3. `utils/telegramNotifier.js:44-52` hydrates and captures at import.
4. `utils/discordNotifier.js:47-54,472-484` hydrates, captures, and constructs at import.
5. `ogzprime-ssl-server.js:46` hydrates at dashboard entry.
6. `public/stripe-checkout.js:11-16` hydrates at checkout entry.

ConfigLoader does not populate global `process.env` (`foundation/ConfigLoader.js:1478-1507`). The notifier imports accidentally supply later ambient readers. Removing only those calls changes lock, asset, pattern, output, dashboard, and publication inputs. Moving hydration earlier also changes values captured before the current notifier import. Astra's front-loaded census established the candidate set; Codex independently reproduced all 643 tracked JavaScript files, 110 autoload candidates, and the same 41 direct-input files.

The existing durable sink is also installed too late for ConfigLoader and Sentry failures (`run-empire-v2.js:3-6,36-37,108-126`). The same atomic configuration package moves the existing reporter to the bootstrap boundary and adds bounded redaction. It adds no process, service, or trading decision.

## Scope

The implementation package covers:

- one bootstrap source implementation per OS process;
- creation of the two ruled configuration files and one ConfigLoader snapshot;
- explicit delivery to every reached consumer dispositioned from the 41-file census;
- removal of all declared-runtime dotenv readers and downstream ambient reads;
- removal of the hardcoded Sentry credential fallback;
- the earliest local failure receipt for each declared runtime process;
- direct receipts proving source, resolved ownership, and actual consuming boundaries.

This work does not classify required versus optional services, redesign lock policy, change startup/trading authority, alter mode behavior, change confidence, add a gate, add a retry policy, or change Mercury provider behavior. Those semantic owners remain in their assigned packages.

## Dependency correction

J1 remains the front-loaded investigation and early-reporting owner, but its credential-source runtime cut cannot land separately from J7/J8. The J0 execution order must therefore treat the configuration ownership work as one atomic J1+J7/J8 landing package. Until that package is approved, current production source remains unchanged.

## Authorization state

This remains a documentation-only correction for cold pull. No production implementation, commit approval, provider call, or PM2 operation is implied.

## Footer

WHAT I DID: checked Astra's front-loaded handoff against the frozen tree and corrected the design so the final ownership model is implemented once, without a temporary ambient layer.

WHAT I DID NOT DO: edit runtime source, inspect credential values, invoke services, run tests, restart processes, or claim the 41 syntax candidates all require edits.

WHAT I ASSUMED: “one location” means one source by value class and one ConfigLoader runtime owner, not one file containing credentials and public behavioral settings together.
