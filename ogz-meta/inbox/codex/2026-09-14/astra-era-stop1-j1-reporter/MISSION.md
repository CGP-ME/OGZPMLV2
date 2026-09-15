# STOP 1 J1: configuration-independent early reporting

Implement only the reporter package approved by the J1 documentation PASS.

The existing `RuntimeAuditSink` must be available before each declared process performs fallible configuration or service initialization. It records the process role, phase, PID, source receipt identifier, bounded cause chain, and redacted context. Module loading must report optional, required, directory, and required-absence outcomes without changing continuation or propagation.

The four declared process entrypoints are the bot, dashboard relay, checkout service, and supervisor. Existing uncaught outcomes remain unchanged: bot, dashboard, and standalone checkout exit nonzero; supervisor bootstrap failure exits as before, while supervisor runtime handlers continue as before.

This change moves no configuration input, removes no dotenv call, changes no readiness or trading decision, creates no retry, threshold, gate, supervisor, halt, flatten, or notification policy, and performs no runtime activation.
