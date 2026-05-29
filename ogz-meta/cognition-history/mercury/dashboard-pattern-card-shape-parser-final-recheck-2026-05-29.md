Break the current Pattern Card parser patch after non-throwing confidence parsing. Do not validate it.

Scope:
- `public/js/panels/pattern-card.js:29-35`
- `public/js/panels/pattern-card.js:541-565`
- `public/js/panels/pattern-card.js:961-990`
- backend source for frame shape: `run-empire-v2.js:2637-2649`

Patch summary:
- `recordDetection()` rejects missing event, missing pattern, or missing symbol.
- Pattern names must be real non-empty strings.
- String pattern payloads are accepted.
- Object pattern payloads are accepted only when `pattern.name` is a non-empty string.
- Confidence is parsed through `toFiniteNumber()`, which catches coercion errors and returns 0 for malformed or non-finite values.
- Parsed confidence is clamped to 0..1.
- The public `PatternCard.recordPattern()` injection method was removed.
- No symbol is inferred from selected UI state.

Attack goals:
1. Find a payload that still renders `[object Object]` or another object coercion.
2. Find a missing-symbol payload that gets accepted and assigned to a UI-selected ticker.
3. Find a malformed pattern payload that crashes `recordDetection()`.
4. Find a valid backend-shaped payload with explicit `symbol` that is rejected.
5. Find a confidence value that escapes the 0..1 clamp or produces `NaN` in rendered state.
6. Find a public active `public/` API path that still fabricates pattern state without a real `pattern_analysis` socket frame.
7. Find an active `public/` consumer that breaks because `PatternCard.recordPattern()` was removed.

Do not count archived intake under `ogz-meta/ledger/` as an active production consumer unless a current `public/` HTML or JS file imports it.

If a breach exists, cite exact file:line and concrete payload or caller.
If no breach exists, list the payloads/callers attempted and why each failed against this code.
