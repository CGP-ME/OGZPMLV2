Break the Chain of Thought layout patch after all fixed-height rules were removed. Do not validate it.

Scope:
- `public/js/panels/chain-of-thought.js:9-25`
- `public/js/panels/chain-of-thought.js:97-114`
- `public/css/panels/chain-of-thought.css:21-38`
- `public/css/panels/chain-of-thought.css:410-415`
- `public/unified-dashboard-v2.html:354-363`
- `public/unified-dashboard-v2.html:483-504`
- `public/js/panels/chain-of-thought.js:145-170`
- `public/js/panels/chain-of-thought.js:671-684`

Patch summary:
- The module no longer injects `height: 140px` on `#chainOfThought`.
- The static stylesheet no longer declares `height: 140px` on `#chainOfThought`.
- The static mobile stylesheet no longer declares `height: 120px` on `#chainOfThought`.
- JS and static CSS now use `flex: 1 1 auto` plus minimum heights.
- Existing `.cot-content` keeps `flex: 1`, `overflow-y: auto`, and `min-height: 0`.
- Render logic still appends lines to `.cot-content` and auto-scrolls that content area.
- No data routing, narrator parsing, or socket behavior is changed.

Attack goals:
1. Find any remaining active CSS source that forces `#chainOfThought` to a fixed `height`.
2. Find a desktop, tablet, or mobile layout state where entries still push outside the panel instead of scrolling inside `.cot-content`.
3. Find a parent layout state where the minimum-height rules make the rail/page overflow worse than the old hardcoded height.
4. Find a state where the header is pushed out of view or the content area collapses to zero height.
5. Find a state where auto-scroll targets the wrong element after this sizing change.
6. Find a state where this breaks existing bottom-ribbon placement if the module is mounted outside the left rail.

If a breach exists, cite exact file:line and the concrete layout sequence.
If no breach exists, list the layout states attempted and why each failed against this code.
