Break this dashboard Chain of Thought layout patch. Do not validate it.

Scope:
- `public/js/panels/chain-of-thought.js:9-25`
- `public/js/panels/chain-of-thought.js:97-114`
- `public/js/panels/chain-of-thought.js:145-170`
- `public/js/panels/chain-of-thought.js:671-684`

Patch summary:
- The module no longer injects `height: 140px` on `#chainOfThought`.
- The root now uses `flex: 1 1 auto` and `min-height: 240px`.
- Existing `.cot-content` keeps `flex: 1`, `overflow-y: auto`, and `min-height: 0`.
- Existing render logic still appends lines to `.cot-content` and auto-scrolls that content area.
- No data routing, narrator parsing, or socket behavior is changed.

Attack goals:
1. Find a layout state where entries still push outside the Chain of Thought panel instead of scrolling inside `.cot-content`.
2. Find a parent layout state where `flex: 1 1 auto` plus `min-height: 240px` makes the rail/page overflow worse than the hardcoded height.
3. Find a state where the header is pushed out of view or the content area collapses to zero height.
4. Find a state where auto-scroll targets the wrong element after this sizing change.
5. Find a state where this change breaks existing bottom-ribbon placement if the module is mounted outside the left rail.

If a breach exists, cite exact file:line and the concrete layout sequence.
If no breach exists, list the layout states attempted and why each failed against this code.
