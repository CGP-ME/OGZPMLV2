# Evidence

The actual active-tree tool adapter and context serializer were invoked before editing on 2026-09-23T18:42:30.596Z: ConfigLoader had 62 allowed caller entries; only 30 reached the serialized result; 32 were omitted. Source SHA-256 was `ffb28f0ed53e5e01edfd75c8a5a7bcfb5e2503393dedb8bdcf5a740fb032c37d`.

After editing, at 18:43:34.616Z the same actual path delivered 62/62, with no unexpected entry or compaction; serialized result was 5,005 characters. Repaired source SHA-256: `4af758959e0c84f6f848c535c6d6fa184817b1d849efe88ed39033d0b56de664`.

`delivery-receipt.json` retains the repeatable source-bound before/after comparison, full delivered outputs, caller locations/source hashes, and read-only replay against the recovery candidate. Reproduce from repo root without a provider or database connection:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules DOTENV_CONFIG_PATH=/opt/ogzprime/OGZPMLV2/.env MERCURY_CONFIG_FILE=/opt/ogzprime/OGZPMLV2/ogz-meta/inbox/codex/2026-09-22/mercury-stop1-recovery-continuation/mercury.verdict-repair.isolated.json GIT_OPTIONAL_LOCKS=0 node -r dotenv/config ogz-meta/inbox/codex/2026-09-23/mercury-caller-delivery/verify-delivery.cjs
```

Credentials are loaded by the existing config path but are neither printed nor fingerprinted. `node --check tools/serena-bridge.js` and `git diff --check` also completed; these are syntax/hygiene checks, not product acceptance. No Jest or paid review ran. No bot runtime/migration outcome is established.
