# Mercury Bridge — repository knowledge and engineering review

Mercury retrieves indexed repository passages and uses read-only repository tools
to investigate engineering questions. Retrieval supplies evidence; an answer is
not verified merely because a model returned it. Check its citations, source
version, tool receipts and stated limitations.

This bridge is separate from the TrAI trading inference path. It does not own
trading settings, positions or permission to stop or restart the bot.

## Configuration and credentials

`mercury.config.json` is the bridge configuration contract, loaded by `config.js`.
It owns the embedding provider/model/dimensions, MongoDB collections, chunking,
retrieval and reviewer configuration. `MERCURY_CONFIG_FILE` can explicitly select
another configuration file; it is not an implicit fallback. The trading runtime's
Stop 1 files remain `config/settings.json` and `config/internals.json`.

The current repository configuration selects:

| Purpose | Configuration |
| --- | --- |
| Query and source embeddings | Local Ollama, `nomic-embed-text`, 768 dimensions |
| Embedding endpoint | `http://localhost:11434/api/embed` |
| Indexed knowledge | `ogz_knowledge.chunks_local_nomic` |
| Index build records | `ogz_knowledge.index_stats_local_nomic` |
| Engineering inference | `mercury-3`, `reasoning_effort: low` |
| Engineering API credential | `INCEPTION_API_KEY_DEV` |
| Astra reviewer | Codex subscription, `gpt-6-astra` |
| Opus reviewer (legacy ID `fable`) | Claude Code subscription, `claude-opus-5-5` |
| Decide advisory | `mercury-decide`, engineering credential |

`INCEPTION_API_KEY` belongs to TrAI. Do not substitute it for the engineering key.
The indexer and query CLI load the repository `.env` for configured credential
names; dotenv does not replace an already-set process environment value. Inspect
credential presence and provenance without printing credential values.

Local Nomic embeddings do not require `OPENAI_API_KEY`. The supported
OpenAI-compatible embedding transport is a separate configured provider option,
not the active default. Old instructions to tune the bridge through `EMBED_*`
or `MONGO_URI` environment variables do not describe the current configuration
loader. Provider/model/dimension/index identity must stay coherent when changing
an embedding provider; vectors from different identities are not interchangeable.

MongoDB, Ollama with the configured model, and the repository's Node dependencies
must be available before indexing. Actual build time, chunk count and provider
usage come from that run's receipts. Prices in the configuration are accounting
estimates, not the provider's invoice.

## Retrieval and repository tools

The existing hybrid search combines BM25 keyword ranking with cosine similarity
of embeddings and applies query-dependent content-type weighting. Keyword search
matches stored words; semantic search compares vectors. The AST tools inspect
JavaScript structure and callers. These are different evidence sources.

`ask.js` defaults to the agentic loop. Its tools include literal/regex search,
file reads, indexed chunk reads, Git reads, Serena dependency/AST inspection, and
policy-bounded web lookup. `find_definition` and `find_references` are regex-backed
and report uncertainty; they must not be described as AST proof. There is no
arbitrary shell or proof-command tool in the model's tool schema.

`--single-shot` uses retrieved passages in one model call without repository
tools. It cannot independently establish that an indexed passage is still the
current source. Even an agentic answer needs its individual citations checked.

## Query and review commands

Run commands from the repository root. Engineering requests use the configured
reviewer defaults unless explicitly selected otherwise.

### One neutral question at a time — Trey, 2026-11-10

The generic `Mercury, break my fix.` prompt is retired. One dispatch investigates
one behavior or uncertainty. A single sentence asking for the entire repair,
every changed file, or the whole work summary still bundles multiple questions.

State the question, relevant observations and source identity. Do not supply the
implementer's diagnosis, preferred fix, expected answer or desired verdict. Do
not tell Mercury a defect must exist, ask it to approve your work, or present an
earlier model's conclusion as fact. Let Mercury select its tools, follow relevant
producers and consumers, compare competing explanations, and reach its own
answer. Source pointers help locate evidence; they do not forbid contradictory
evidence or necessary dependency reads.

Keep initial context relevant to that question. Do not paste a session summary
or a list of independent checks into the prompt. Read the complete answer and
check its citations, unresolved claims and receipt before the next dispatch.
One question's result is not approval of the entire change. Every selected peer
first investigates independently, with tools and without other reviewers' answers.
If their code outcomes differ, all selected peers receive the same first-round
evidence and independently cast a vote after checking it. Each peer has one vote;
no final judge or casting vote exists. Preserve each position, evidence and dissent.
Missing or incomplete answers are recorded separately from disagreement.

```bash
node trai_brain/mercury-bridge/ask.js --agentic --reviewers=mercury --max-tokens=7750 "Where does the engineering API credential come from? Cite its producer and consumer."
node trai_brain/mercury-bridge/ask.js --single-shot "Summarize the indexed embedding configuration."
```

For an authorized change, stage only its files/hunks and pin the source comparison:

```bash
candidate=$(git write-tree)
node trai_brain/mercury-bridge/ask.js --agentic --attack --reviewers=mercury,astra,fable --max-tokens=7750 --review-ref="$candidate" --review-base=HEAD --change-path=core/TradingLoop.js "What happens to a queued entry decision's input values when another candle arrives before execution? Cite the relevant producers and consumers."
```

The refs resolve to immutable trees before evidence capture. The run records those
trees and a source manifest. Initial evidence, file/search/AST tools and Mercury
rechecks use that captured source view. Explicit history reads retain their
requested ref. Invalid refs do not silently select the working tree.
`--change-path=P` without a pinned comparison uses working-tree evidence.
The example's question and initial source target concern queued decision inputs;
choose the question and relevant target for the actual task. The captured tree
remains available for dependency reads. Pinning the tree does not request a
whole-tree audit. `--attack` is the existing flag name for independent review
and evidence receipts; it does not prescribe a defect or any other conclusion.

Dispatch one review question at a time. Do not add `--max-iterations` unless Trey
sets a limit. Selected seats execute in order. An unavailable reviewer remains
unavailable; another model's answer does not complete that seat. A zero CLI exit
code or provider success does not certify the code. Every peer reports
`found_break`, `no_break_found` or `cannot_verify`; `pass` is not an agreement or
code-outcome label. The receipt separates the vote tally, majority outcome,
agreement, completeness and dissent. A tie is `unresolved_vote`; a selected
reviewer without a completed vote leaves `review_incomplete`, even when the
available votes form a majority. The denominator remains the selected panel;
read the complete conclusion, disagreement, supporting evidence and missing work.
Missing, retired or repeated decision labels are incomplete ballots, not an
invented `cannot_verify` vote. Only an explicit `cannot_verify` counts as that vote.
The terminal prints every initial answer and every evidence-round vote, including dissent.
For a failed or incomplete run, inspect the actual request and provider receipt
before another paid dispatch. Correct the question/context problem instead of
repeating the same request or increasing limits without Trey's instruction.
The CLI and hook checks cannot mechanically prove that a question is focused or
unbiased. The dispatching agent must inspect both its visible question and added
context. Review completion and source/evidence checks remain required.

Architecture and planning are explicit synthesis modes:

```bash
node trai_brain/mercury-bridge/ask.js --agentic --architecture --adversarial-review --max-tokens=7750 "Assess the supplied architecture question."
node trai_brain/mercury-bridge/ask.js --agentic --planning --adversarial-review --max-tokens=7750 "Plan the supplied implementation question."
```

These modes provide independent analysis of the supplied question.
Every selected reviewer receives the explicit mode framing. Their responses are
recorded as `synthesis_received` or `synthesis_incomplete`, with no code outcome
or inferred agreement. This is not a commit-review gate. The operator selects
any resulting implementation scope.

## Subscription reviewers and readiness

Astra and Opus are independent peers, through the Codex/ChatGPT and installed
Claude Code subscriptions respectively. The panel
accepts `mercury`, `astra` and the compatibility ID `fable` for Opus. Kimi is not a panel selection; independent
direct-question configuration and historical receipts are separate.

The existing `consensus` configuration supplies Astra's provider settings;
the legacy-named `tieBreaker` key supplies Opus's settings, not a judging role.
It pins `provider=claude-code` and
`model=claude-opus-5-5`, with no API key or endpoint. The adapter verifies first-party
subscription auth, enables read-only `Read`, `Grep` and `Glob` tools in restricted
mode, binds them to the selected source/evidence directories, strips API-routing overrides and
records requested/applied models. The pinned invocation excludes user/project CLI
settings and supplies no fallback chain. A flagged request remains a refusal.
These invocation settings do not edit the user's Claude settings.
Claude CLI versions that confirm a stored first-party `claude.ai` login but omit
the subscription tier are accepted with `subscriptionType: null` and a named
`not_reported_by_claude_cli` absence. This is login evidence, not a claim about
plan entitlement or quota; an actual response must still attest the pinned model.
Pinned reviews supply the exact source snapshot and a separate baseline snapshot.
Full captured evidence remains readable from a file instead of being forced into
every subscription request. Existing repository exclusions remain in effect;
an explicitly supplied evidence file is not a canonical RAG admission.

A missing login, failed response or different applied model is not a successful
Opus 5.5 review. No other model is an authorized substitute. Trey selected Opus
on 2026-11-11 because his subscription cannot run Fable; historical receipts and
the `fable` selection ID retain their existing identifiers.

```bash
claude auth status --json
node trai_brain/mercury-bridge/ask.js --check-providers
```

`--check-providers` makes actual provider calls to Mercury, Astra and Opus. Its
current aggregate `ok` covers Mercury and Astra; inspect `tieBreakerReady` and the
Claude attempt independently. A successful process exit does not establish all-seat
readiness. Login status alone also does not prove model access or remaining quota.

Decide classifies the supplied review reports after the selected seats. It has no
reviewer seat, vote, authority to replace a verdict, or permission to take action.

## Indexing and trace memory

```bash
node trai_brain/mercury-bridge/indexer.js
```

This is an explicit full rebuild. Run it only when the repository content is
approved for indexing. `ask.js` reads the published chunk collection; ordinary
queries do not rebuild it. Check successful publication, active nonzero chunks,
embedding identity, freshness and actual retrieval before claiming the RAG is
current. A pushed commit alone does not update stored knowledge.

Investigation traces are a separate collection and write decision. Ordinary asks
may retrieve prior trace hints; `--capture-trace` explicitly permits capturing an
answer. Capture only an answer that is suitable to teach a later investigation.

The file walker applies `mercury.ignore`, repository policy, supported extensions
and the configured size limit. It does not use `.gitignore` as its index policy.
Within `ogz-meta`, the indexer's explicit targets are
`Alignment/OGZ-MASTER-ALIGNMENT.md`, `Alignment/TREY-RULINGS.md`, and `specs/`;
other repository policy restrictions still apply.

JavaScript chunking labels recognized definitions with regex and brace matching,
then indexes every remaining nonempty source range with character windows. Imports,
module constants, exports, tiny functions and unrecognized syntax therefore remain
retrievable within eligible files. Structural labels are heuristic, not AST proof.
Markdown splits at H1-H6 headings and retains short nonempty sections. Oversized
sections use configured character windows; JSONL records are rendered separately.
Current settings are 1,000-character windows, 100-character overlap, a
1,500-character section threshold and a 500,000-byte file limit. These changes do
not admit excluded files or noncanonical packets.

New source chunks carry their actual first line/column, final line and file hash.
Displayed line numbers refer to that indexed version; window boundaries can cut a
line. JSONL display text is a rendering of its original record line, not source
lines. Older records without this metadata remain explicitly unverified spans
until rebuilt; open the source before claiming exact current-checkout citations.

Chunk records include `file_path`, source span, kind/name, text, embedding identity,
vector, source hash and indexing time. `file_sha` is SHA-1 of the source text, not a
Git blob hash. Scoring runs in JavaScript over the active identity's MongoDB
records. Check actual run observations instead of assuming a fixed latency or
repository size.

## Where the evidence lives

- `config.js` and `mercury.config.json`: bridge configuration and credential names.
- `indexer.js` and `mongo-store.js`: source collection, embedding and publication.
- `searcher.js`: retrieval and single-shot prompt assembly.
- `ask.js` and `react-loop.js`: agentic dispatch and evidence use.
- `tool-adapter.js`: actual model tool registry and schema.
- `adversarial-review.js` and `reviewer-panel.js`: reviewer contracts and sequencing.
- `provider-preflight.js`: provider readiness and its aggregation semantics.
- `run-ledger.js` and `ogz-meta/cognition-history/mercury-runs/`: durable run receipts.
- `CHANGELOG.md`: changes, observed failures, verification and unresolved work.

Do not treat old example answers or historical receipts as current source facts.
Verify the referenced lines and the source identity that produced each answer.
