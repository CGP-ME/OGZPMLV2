# Active caller census

Coverage: all 11 production files in the Astra change, plus a tracked-repository search excluding historical ogz-meta artifacts. No active non-artifact callers of runFableConsensus, runFableAdversarialReview, createFableChallengerClient, createOpusChallengerClient, or reviewer CLI selections containing fable remain.

| Producer/reader | Change and evidence |
| --- | --- |
| mercury.config.json / config.js | Subscription provider and gpt-6-astra replace Claude/Fable; emergency model is absent. Existing configuration-owner validation is updated, not extended with new response gates. |
| llm-client.js:createAstraChallengerClient | Creates CodexChallengerClient; existing createConsensusLlmClient routes here. Historical Claude parser/client code remains for receipt compatibility; active Claude challenger factories are removed. |
| codex-challenger.js | Invokes the installed Codex CLI with ChatGPT auth, read-only tools, stdin prompt and selected working directory. Captures stdout/stderr, SSE actual model, full tool events, usage, initialization, timing and errors. Does not suppress the answer or reject it based on those diagnostics. |
| adversarial-review.js:executePromptOnlyStage | Existing Kimi tool restriction remains. Astra tools and diagnostics are retained in the existing receipt. No new response-rejection throw remains. |
| adversarial-review.js:runAstraAdversarialReview | Runs only Astra. Existing identity/quarantine reporting and substantive recheck behavior remain. No Fable→Opus fallback. |
| ask.js:runAgentic | Dispatches the Astra seat and passes the existing reviewRoot snapshot to its client. Keeps Mercury rechecks and Kimi sequence/dependency evidence. |
| reviewer-panel.js | Registry is Mercury/Astra/Kimi. Kimi attachment still requires the actual prior challenger answer hash and sequence. Existing reporting/diagnostics are preserved. |
| provider-preflight.js | Substitutes Astra in the existing preflight; no Opus fallback. Kimi code remains but was not invoked by this mission. |
| run-ledger.js | New subscription reviews are grouped as Astra. Historical Fable groups remain Fable. Both historical fableSupported and new astraSupported fields can be retained. |
| ask.js:printDispatchReceipt | Derives historical challenger self-report label from the recorded provider rather than relabeling old Fable entries. |
| consensus.js / doctrine-review.js | Active function alias and assigned-role prose identify Astra. Mercury and Kimi vocabularies remain. |

Verification command: `git grep -n -E 'runFableConsensus|runFableAdversarialReview|createFableChallengerClient|createOpusChallengerClient|reviewers=[^ ]*fable' -- ':!ogz-meta' ':!package-lock.json'` returned no matches after the active caller migration. Historical artifacts are deliberately not rewritten.
