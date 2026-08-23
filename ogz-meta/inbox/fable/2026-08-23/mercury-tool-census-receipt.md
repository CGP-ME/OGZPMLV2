# Mercury Tool Census — rebuilt VPS (2026-08-23, Fable lane)

Trey: "everything should be in the output in the receipt — it's supposed to say everything that failed." This receipt enumerates the whole tool roster, every failure logged in the four broker-proof rung rounds, and a direct counted census of every tool on the rebuilt box.

## Roster: 18 tools (from the bridge startup line)

search, grep, regex_grep, find_definition, find_references, rule_scan, open_file, get_chunk, list_files, tavily_search, git_show, git_diff, serena_blast_radius, serena_property_refs, serena_method_callers, serena_class_fields, run_check, web_fetch.

## Everything that failed, by round (from the bridge's own "tool failures" sections)

| Round | Failures | Tools | Cause |
|---|---|---|---|
| 1 (`broker-proof-rung-a-mercury-round1.log`) | **7/16** | search ×4, grep, regex_grep, find_definition | `ripgrep unavailable: install rg before using Mercury grep evidence` |
| 1 recheck | **12/…** | search ×10, grep, find_references | same — ripgrep |
| 2 (`…-round2.log`, after ripgrep install) | **1/25** | open_file | `range too large (max 500 lines per call)` — Mercury asked for >500 lines; a usage error, not a missing dependency |
| 3, 4 (Fable/Kimi over evidence packets) | 0 | — | no Mercury tool calls in those rounds |

Root cause of rounds 1: `rg` existed on this box only as an interactive shell function (`type rg` → "rg is a function"), so `which rg` in the tool adapter (`trai_brain/mercury-bridge/tool-adapter.js:156`) found nothing and every grep-backed tool failed closed. Fix: `apt install ripgrep` → `/usr/bin/rg` 14.1.1. The old box's ledger already recorded this exact prerequisite (`ogz-meta/ledger/meagthread.md:18766` "sudo apt install -y ripgrep"); it was not carried into the rebuild.

## Direct census on the rebuilt box (every tool called once, scratchpad `mercury-tool-census.js`)

| tool | result | evidence |
|---|---|---|
| search | OK | 3 matches |
| grep | OK | 3 matches |
| regex_grep | OK | 3 matches (arg is `query`) |
| find_definition | OK | 1 match |
| find_references | OK | 2 matches |
| rule_scan | OK | 3 rules loaded from `ogz-meta/cognition/mercury-rules/` (no-proof-partial-as-full-close, no-public-dashboard-websocket-token, no-swallowed-trading-path-fallback) |
| open_file | OK | ≤500-line ranges |
| get_chunk | OK | Mongo `ogz_knowledge.chunks_local_nomic` (9,904 chunks) |
| list_files | OK | |
| **tavily_search** | **ERROR** | `requires TAVILY_API_KEY in environment` — key blank in `.env` (on Trey's rotation list; not an install) |
| git_show | OK | |
| git_diff | OK | |
| serena_blast_radius | OK | 194ms |
| serena_property_refs | OK | 268ms |
| serena_method_callers | OK | 23.3s (tree-sitter full-repo walk) |
| serena_class_fields | OK | 24.2s |
| run_check | OK | git-snapshot sandbox, `node --check` ran |
| web_fetch | OK | HTTPS GET to allowlisted host |

**CENSUS: 17/18 OK. The only open failure is `tavily_search` (missing `TAVILY_API_KEY`).**

## What "Serena" and "tree-sitter" are here — nothing to download

- "Serena" in this repo is the in-repo JS bridge `tools/serena-bridge.js` → `tools/dep-scanner.js` → `tools/serena-symbol-scanner.js`, built on the **`tree-sitter` + `tree-sitter-javascript` npm modules** (native binding; loads cleanly under Node 22: verified `require('tree-sitter')` OK). It is NOT the Python/uvx Serena MCP server — the repo has no `uvx`, `serena-mcp`, or `pyright` usage outside three spec/quarantine docs. Nothing Python-side is required.
- No `ctags`, no `web-tree-sitter`, no tree-sitter CLI are referenced by any tool.

## Dependency inventory after rebuild (binary / module / key → state)

| dependency | used by | state |
|---|---|---|
| `rg` (ripgrep binary) | search, grep, regex_grep, find_definition, find_references | **installed 2026-08-23** (was the only missing binary) |
| `git` | git_show, git_diff, run_check sandbox | present |
| `node` 22 | run_check (`node --check`), everything | present |
| `tree-sitter`, `tree-sitter-javascript` (npm, native) | serena_* | present, loads |
| `mongodb` (npm) + `mongod` 8.2 | get_chunk, retrieval | present, index 9,904 chunks |
| `OPENAI_API_KEY` | embeddings (index + query) | live (200) |
| `INCEPTION_API_KEY_DEV` | Mercury LLM | live (200 ×6) |
| `MOONSHOT_API_KEY` | Fable-reviewer + Kimi seats | live (200) |
| `TAVILY_API_KEY` | tavily_search | **blank → tool fails** (rotation item) |
| `SOURCEGRAPH_API_KEY` / `SOURCEGRAPH_INSTANCE_URL` | not read by any tool in the current adapter (grep confirms) | present, unused |

## WHAT I DID NOT DO

- Did not set `TAVILY_API_KEY` (Trey rotates keys).
- Did not change `open_file`'s 500-line cap or any tool code.
