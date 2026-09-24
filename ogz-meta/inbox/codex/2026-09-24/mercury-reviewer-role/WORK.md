# Work

Verified resolveKimiTieBreakerClientOptions uses config.CONSENSUS_SYSTEM_PROMPT, whose source explicitly said You are Fable and required Fable's fields. Kimi's request builder instead requires Kimi adjudication fields with one final verdict. The actual raw Kimi answer in run 2026-09-24T02-31-33-458Z-759ba9639dea emitted both templates: VERDICT blocked first, needs_more_evidence later; the existing parser read the first. No parser rule is weakened here.

Changed only the existing shared systemPrompt text in mercury.config.json to role-neutral evidence/read-only instructions. The existing per-role request builders still supply distinct roles and required fields. Host evidence is explicitly usable and distinguished from model testimony. No new knob, provider, fallback, tool or bot behavior.

Replayed the exact 191,354-byte historical Kimi request, verified SHA before dispatch. Only shared system prompt changed. Actual kimi-k3 completed with matched identity, 32 host excerpts and ONE VERDICT: needs_more_evidence. Historical failed context remains historical; not a complete fresh-chain receipt.

Before editing, stopped only this mission's just-started isolated indexer PID 504762 after validating executable arguments and cwd. Completion records SIGTERM at 02:46:31 UTC. Its partial database/config/receipts are preserved under ../mercury-full-chain/failed-result/; not a successful index. No PM2/bot process or live index touched.
