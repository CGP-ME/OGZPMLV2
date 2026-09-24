# Evidence

- replay-kimi.cjs, kimi-replay-start.json, kimi-replay-receipt.json: exact historical request hash 279227d1c8872dd87207b8ed6a03ea8f0be1e098943529b1513581d416d1d3d6; before/after shared system hashes; actual provider result.
- New raw output 3,904 bytes, SHA 10360d9094e24c7fcb11e54553dc5667e3fcc8fbba5a3907cb2dfc02c2df5a67, preserved locally at kimi_tie_breaker-1.raw (0600), not staged.
- Before shared system SHA 1ec078f9eca9d12c4a71867c073b16b7e1cb9dc441f53df5896663ec4a14310c; after aaac8a57868900fe47e12a6ebaf3799e351dba6116438e814fcc3b88bffe3f79.

Source chain: mercury.config.json consensus.systemPrompt -> config.CONSENSUS_SYSTEM_PROMPT -> llm-client.js resolveKimiTieBreakerClientOptions/createKimiTieBreakerClient -> adversarial-review.js runKimiFinalAdjudication. Shared Fable producer uses the same config; its existing role-specific request fields remain intact. Configuration diff changes no other value.
