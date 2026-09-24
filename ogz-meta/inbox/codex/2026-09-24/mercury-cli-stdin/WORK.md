# Work

Actual full run 2026-09-24T02-31-33-458Z-759ba9639dea failed Fable before provider execution: spawn E2BIG, prompt 190,403 bytes. ba999ed0's local reviewer-method interception proved prompt assembly, but stopped before the OS boundary and missed this transport failure.

Read llm-client.js completely and checked installed Claude --help: print mode accepts text input/pipes. Removed the prompt positional argument and used stdin in the existing execFile promise. Preserve stdout/stderr and propagate pipe errors through the existing provider failure path. Version/auth commands have no stdin input and remain unchanged. No trust, auth, tools, MCP or model changes.

Real OS observation reproduced E2BIG before, delivered all 380,000 multibyte bytes after (matching SHA), retained no-input commands, child exit 7/stderr, and EPIPE. The child was an explicitly synthetic byte reader, not a provider.

Then rebuilt the EXACT historical failed Fable prompt from preserved original artifact bytes and verified its SHA before sending. Actual Fable completed with claude-fable-5, matched identity, no exposed tools, all 32 host excerpts, verdict needs_more_evidence. This proves large-prompt delivery, not a full-chain pass. Missing historical Mercury output remains absent in that replay.
