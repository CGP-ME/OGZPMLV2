# STOP 1 J1 review state

## Current review

This packet is a read-only architecture and implementation-boundary proposal. No production diff exists yet, so the trading-path Mercury attack and cold-pull source review have not been run.

## Required cold-pull checks

The reviewer should independently verify:

1. ConfigLoader's dotenv parse does not mutate `process.env`.
2. Telegram/Discord imports currently supply the accidental mutation used by later main-bot consumers.
3. The proposed consumer list covers every credential-bearing consumer reached from all four current ecosystem entrypoints.
4. Removing the hardcoded Sentry fallback does not leave Sentry with another hidden source.
5. The early sink can be installed before ConfigLoader and service imports without importing those services itself.
6. ModuleAutoLoader's caught optional failures reach the proposed reporter without changing required-module propagation.
7. The proposal introduces no process refusal, trade gate, halt, flatten, retry threshold, behavior setting, or mode owner.
8. J3, J4, J7/J8, J15, and J17 boundaries remain explicit rather than silently treated as complete.
9. No packet line contains a credential value or secret-derived fingerprint.

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
