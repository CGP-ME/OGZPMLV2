# STOP 1 J1 reporter correction

Correct only the five defects demonstrated by Astra's cold pull of the configuration-independent reporter:

1. Keep the reporter available before configuration while preserving instrumentation callback participation after instrumentation initializes.
2. Make throwable traversal and diagnostic formatting bounded, circular-safe, and accessor-safe so reporting cannot replace the pre-existing outcome.
3. Cover the demonstrated prefixed assignment, quoted-key assignment, and ntfy capability redaction holes.
4. Preserve J1 process/phase/source identity plus outer/cause codes when JSONL append fails but stderr remains writable.
5. Commit the exact nontransmitting probe and captured output used to prove the correction.

This correction adds no configuration owner, service, retry, wait, timeout, threshold, readiness decision, process authority, trading authority, pause, halt, flatten, notification policy, provider call, or runtime activation.
