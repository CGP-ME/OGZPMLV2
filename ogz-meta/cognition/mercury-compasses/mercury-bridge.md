# mercury-bridge compass

Use this compass when changing Mercury, reviewing Mercury output, debugging
tool use, or checking whether Mercury had enough evidence to make a claim.

Read these first:

1. `mercury.config.json`
   - `mercury.config.json:57-98` is the adversarial agentic prompt and current
     tool-use contract.
   - Treat RAG and trace memory as orientation only when current code proof is
     needed.

2. `trai_brain/mercury-bridge/ask.js`
   - CLI and programmatic entry point.
   - Loads repo `.env`, validates max-iteration and token caps, retrieves
     starter context, injects trace hints, builds the tool adapter, runs the
     ReAct loop, writes the run ledger, and returns the result.

3. `trai_brain/mercury-bridge/react-loop.js`
   - Native tool-calling loop.
   - Owns final-answer evidence warnings, tool telemetry, file-open tracking,
     and run-check artifact summaries.

4. `trai_brain/mercury-bridge/tool-adapter.js`
   - Read-only repo tool boundary.
   - Owns grep, regex_grep, open_file, get_chunk, list_files, git_diff,
     git_show, serena_blast_radius, run_check, web_fetch, and tavily_search.
   - Execution commands stay behind the `run_check` allowlist and write output
     artifacts under `ogz-meta/cognition-history/mercury-execution/`.

5. `trai_brain/mercury-bridge/run-ledger.js`
   - Durable JSONL run envelope writer.
   - Stores prompt hashes/excerpts, repo state, telemetry, answer-quality flags,
     verdict, optional Fable consensus metadata, and artifact citations under
     `ogz-meta/cognition-history/mercury-runs/`.

6. `trai_brain/mercury-bridge/indexer.js` and
   `trai_brain/mercury-bridge/trace-memory.js`
   - Indexed repo context and guarded trace memory.
   - If Mercury freshness matters after a push, prove the indexer ran for the
   pushed code before claiming fresh context.

7. `trai_brain/mercury-bridge/consensus.js`
   - Default-on Fable second-opinion pass behind
     `mercury.config.json:consensus.defaultEnabled=true`; suppress per run with
     `ask.js --no-consensus` when intentionally needed.
   - Fable does not receive repo tools in this pass. It evaluates Mercury's
     answer and telemetry, names evidence gaps, and must not invent new
     file:line claims.
   - Current default provider is local Claude Code (`consensus.provider=claude-code`),
     which uses the logged-in CLI subscription instead of Anthropic API env keys.

Common bug classes:

- Mercury answers from RAG or prior trace without opening current files.
- Tool descriptions push the wrong tool or recreate a hidden current-diff-first
  cage for broad `Mercury, break my fix.` reviews.
- A run_check claim cites no execution artifact.
- A broad test failure is attributed to the active diff without isolating the
  failing suite.
- A bridge failure returns an answer without a durable run ledger row.
- External fetched content is treated as instructions instead of data.
- Secret-shaped prompt, answer, or env text leaks into ledger or artifact
  output.
- Fable consensus is mistaken for Mercury tool evidence or local Claude Code
  auth is bypassed by stale API-key environment variables.

Proof hints:

- For schema/tool-description changes, run focused Mercury bridge tests before
  any broad suite.
- For executable bridge changes, run Mercury adversarial review before commit.
- For current-diff review prompts, preserve the visible attack frame
  `Mercury, break my fix.` and let tools provide structure.
