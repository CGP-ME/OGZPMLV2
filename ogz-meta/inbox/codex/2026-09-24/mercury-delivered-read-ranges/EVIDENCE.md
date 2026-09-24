# Evidence

Ran `node ogz-meta/inbox/codex/2026-09-24/mercury-delivered-read-ranges/verify-ranges.cjs`. `range-receipt.json` retains hashes and exact measured ranges.

- Actual open_file on ConfigLoader lines 1–500: raw 23,620 characters; delivered 12,000 characters containing lines 1–237. Ledger correctly records 1–237, not 1–500.
- Actual git_show on HEAD ConfigLoader lines 1–500: raw 23,553 characters; delivered 11,962 characters, lines 1–236. Ledger records 1–236 and the Git ref.
- Small actual file read: all 15 requested lines remain, 715 characters.
- Synthetic 20,000-character single line: no complete delivered range, zero file-read credit. No synthetic source file was created.

All three real delivered prefixes match source hashes exactly. Two old-style oversized result histories receive zero complete-read credit; the small old-style result preserves its complete range. No prior ledger was rewritten. Syntax/diff checks pass. No Jest, provider, DB, bot, PM2, broker or index operation. Local tool delivery is not model consumption or complete review.
