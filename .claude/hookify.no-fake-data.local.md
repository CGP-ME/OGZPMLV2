---
name: warn-no-fake-data
enabled: true
event: file
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: (?i)(\bfake[_\-]?(data|value|price|fill|trade|outcome)|placeholder[_\-]?(data|value|price|trade)|dummy[_\-]?(data|value|price|fill|trade)|sample[_\-]?(data|value)|TODO:?\s+(real|wire)\s+(data|backend)|"replace[_\-]?me"|stub[_\-]?(data|value|response)|hardcoded\s+(price|value|fill)\s+for\s+(now|testing|demo)|mock\s+(price|value|fill).*real|coming\s+soon|fake\s+for\s+now)
---

**No fake data. Empty is better than fake.**

Trey's rule (feedback-no-fake-data):
> The product's entire value proposition is transparency over hype. "We've made the mistakes so you don't have to" doesn't work if the dashboard lies about what it's showing.

Detected possible fake/placeholder data. Verify:
- Is this a real backend value or a hardcoded display?
- If the data source isn't wired, the UI element doesn't ship
- "Placeholder" or "coming soon" data that shows wrong numbers is fake
- Selecting TSLA showing BTC prices = fake data disguised as real

Empty state UI is acceptable. Misleading data is not.

If this is genuinely test/spec/fixture code (not production path), confirm the file path is under `tests/`, `specs/`, or `fixtures/`. If it's in `core/`, `brokers/`, `modules/`, `dashboard/`, or `run-empire-v2.js` — STOP.
