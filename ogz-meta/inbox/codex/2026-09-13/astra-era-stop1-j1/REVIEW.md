# STOP 1 J1 review state

## Current review

This packet is a read-only architecture and implementation-boundary proposal. A cold pull of packet commit `922873cae71d54f1ed19e36e741df72f6d2a3b1f` returned HOLD for missing pattern-memory identity, bot stock-history configuration, bot read-only-tool policy coupling, raw reporting bypasses, and proof-timing overclaims. Those findings were verified against current source and are corrected in this packet revision. A new cold pull is pending. No production diff exists, so no trading-path Mercury attack has been run.

## Required cold-pull checks

The reviewer should independently verify:

1. ConfigLoader's dotenv parse does not mutate `process.env`.
2. Telegram/Discord imports currently supply the accidental mutation used by later main-bot consumers.
3. The proposed consumer list covers every credential-bearing consumer reached from all four current ecosystem entrypoints.
4. Removing ambient dotenv mutation does not strand pattern-memory identity, bot stock-history configuration, or nonsecret news/provider companion configuration.
5. Bot read-only tools obtain `mercury.ignore` policy without importing provider/embedding configuration or requiring an embedding key, and optional toolbox initialization failure is reported rather than silently swallowed.
6. Removing the hardcoded Sentry fallback does not leave Sentry with another hidden source.
7. The early sink can be installed before ConfigLoader and service imports without importing those services itself, using configuration-independent context.
8. ModuleAutoLoader's caught optional failures reach the proposed reporter without changing required-module propagation, and raw stderr/console bypasses are redacted.
9. The proposal introduces no process refusal, trade gate, halt, flatten, retry threshold, behavior setting, or mode owner.
10. The supervisor's conditional alert-hook path accompanies its bootstrap view without changing extension policy, while the generated HMAC key remains under its existing owner and outside bootstrap receipts.
11. J3, J4, J7/J8, J15, and J17 boundaries remain explicit rather than silently treated as complete.
12. Commit/canary acceptance and later PM2 activation acceptance are separated.
13. No packet line contains a credential value or secret-derived fingerprint.

## Required implementation review

If Trey approves the proposal, the later production diff is trading/bootstrap critical. Before its commit:

- show the complete diff;
- run the direct canary and consumer probes in `PROPOSED-IMPLEMENTATION.md`;
- run one broad unsteered Mercury attack using the current repository rules;
- stop on any evidence that a consumer still depends on ambient import order or a credential can reach output;
- obtain an independent cold pull before any PM2 operation;
- obtain Trey's explicit approval before restart/reload.

Mercury is adversarial support. The paper restart and real service/source receipts remain the proof.

## Footer

WHAT I DID: defined the review questions and implementation gates appropriate to this proposal.

WHAT I DID NOT DO: manufacture a PASS, run a provider, or pre-authorize runtime activation.

WHAT I ASSUMED: cold pull occurs against the exact packet SHA and reviewers do not read local credential files.
