Break this dashboard Pattern Card parser patch. Do not validate it.

Scope:
- `public/js/panels/pattern-card.js:541-553`
- backend source for frame shape: `run-empire-v2.js:2637-2649`

Patch summary:
- `recordDetection()` still rejects missing `event`, missing `event.pattern`, or missing `event.symbol`.
- If `event.pattern` is a string, the string is used as the pattern name.
- If `event.pattern` is an object, `event.pattern.name` is used as the pattern name.
- If no pattern name exists, the frame is ignored.
- Confidence comes from `event.pattern.confidence` for object payloads, otherwise from `event.confidence`.
- Timestamp accepts `event.ts`, then `event.timestamp`, then current time.
- The patch intentionally does not infer a symbol from selected UI state.

Attack goals:
1. Find a payload that still renders `[object Object]` or another object coercion.
2. Find a missing-symbol payload that gets accepted and assigned to a UI-selected ticker.
3. Find a malformed pattern payload that crashes `recordDetection()`.
4. Find a valid backend-shaped payload from `run-empire-v2.js` that is rejected even when it includes `symbol`.
5. Find a confidence value that escapes the 0..1 clamp or produces `NaN` in rendered state.
6. Find a path where this parser creates fake pattern state without a real `pattern_analysis` payload.

If a breach exists, cite exact file:line and concrete payload.
If no breach exists, list the payloads attempted and why each failed against this code.
