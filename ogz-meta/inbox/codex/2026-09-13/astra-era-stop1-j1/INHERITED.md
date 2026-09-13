# STOP 1 J1 inherited and deferred boundaries

## Remains for J3

- One operator shutdown and failure lifecycle.
- Removal of competing uncaught/rejection/SIGINT/SIGTERM owners.
- Whether and when a startup failure changes process exit status.
- Waiting for an attempted remote failure notification before process termination.

J1 records failures but does not add or preserve process-death authority.

## Remains for J4

- Required versus optional component classification.
- Route-specific broker credential requirements.
- Removal of the unconditional Kraken credential check on Alpaca-only routes.
- Retry and recovery ownership.
- Trading readiness when configuration or a required service is unavailable.

J1 supplies truthful absence/source facts; it does not decide readiness.

## Remains for J7/J8

- Keys-only versus behavioral environment migration.
- One accepted configuration revision and nested fingerprint repair.
- Removal of mode, tier, strategy, sizing, exit, and other behavioral environment owners.
- PM2 descriptor cleanup beyond credential-source ownership.

The J1 source's effective-environment output is explicitly transitional for ConfigLoader compatibility.

## Remains for J15

- Full notification event selection.
- Retry policy and recovery.
- Attempt versus service acceptance versus watched-phone delivery.
- Publisher-off write-path work.

J1 may name `unavailable` or `attempted`; it cannot claim delivery.

## Remains for J17 and tooling owners

- Mercury bridge/direct-question/provider credential loading.
- Provider cost and receipt work.
- Gate, downloader, and one-off script credential boundaries.

These tools do not become bot credential owners merely because they use the same local secret file.

## Remains for STOP 2 and later packages

- Candle acquisition/admission and removal of acquisition-derived trading authority.
- SessionRouter startup restoration, switching, and complete symbol coverage.
- Execution mode propagation, exit policy, sizing, fees, cooldown, halts, and daily loss.

## Security incident during this investigation

A read-only source-census command accidentally matched the ignored local `.env` and displayed its contents in the agent tool transcript. No value is reproduced, transformed, hashed, or committed in this packet. The repository was not modified by the command. Because transcript exposure is still exposure, the affected credentials must be rotated by the operator before runtime acceptance. Rotation itself is an external administrative action and was not performed.

The file is ignored by Git at `.gitignore:10`. That fact prevents normal staging; it does not undo transcript exposure.

## Footer

WHAT I DID: preserved the later work boundaries and disclosed the read-only credential-exposure incident without reproducing values.

WHAT I DID NOT DO: rotate credentials, edit `.env`, access provider consoles, or claim the ignored file is safe merely because it is untracked.

WHAT I ASSUMED: Trey will rotate affected credentials before authorizing any real authentication or PM2 acceptance run.
