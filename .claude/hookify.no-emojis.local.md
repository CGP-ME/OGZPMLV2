---
name: warn-no-emojis
enabled: true
event: file
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: [☀-➿]|[✀-➿]|🚀|✨|📊|🔥|💡|⚠|✅|❌|🎯|📈|📉|💰|🤖|🛡|🔍|🧠|⚡|🎨|📝|📌|🚧|🔧|🔨|💎|⭐|🟢|🔴|🟡|🔵|⚪|⚫|🎉|🏆|👀|👍|👎|🙏|💪|🔒|🔓|📦|🗂|📁|📂|📄|📋|🆕|🆗|🆙|🆓|🆒
---

**No emojis. Strip them.**

Trey's rule (feedback-no-emojis):
> Strip emojis from code, docs, commits — professional codebase.

Detected emoji in file content. Remove before this Edit/Write proceeds. This applies to:
- Source code (`core/`, `brokers/`, `modules/`, `run-empire-v2.js`)
- Documentation (`*.md`, `CHANGELOG.md`, `README.md`, `ogz-meta/**`)
- Commit messages (handled separately, but strip them anywhere they appear)
- Console.log output strings
- Dashboard UI strings
- Any string the user will see

Use plain ASCII. Words like "warning" / "error" / "success" / "blocked" carry the same signal without the cosmetic.

**Exception:** This rule file itself, or other rule files, may contain emojis only if essential for pattern-matching (which this rule does NOT — the alternation list above is the detector). Don't write emojis intending to keep them.

If a file is being edited and pre-existing emojis are visible, propose stripping them as a separate change — don't bundle silently.
