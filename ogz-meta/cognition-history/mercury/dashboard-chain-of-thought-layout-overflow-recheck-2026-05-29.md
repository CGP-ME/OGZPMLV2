Break the Chain of Thought minimum-height layout. Do not validate it.

Important correction:
- `min-height: 240px` is larger than the old `height: 140px`.
- A previous answer said the opposite. Ignore that statement.

Scope:
- `public/js/panels/chain-of-thought.js:97-114`
- `public/css/panels/chain-of-thought.css:21-38`
- `public/css/panels/chain-of-thought.css:410-415`
- `public/unified-dashboard-v2.html:354-363`
- `public/unified-dashboard-v2.html:475-504`

Attack goal:
Find a concrete viewport/layout state where replacing fixed `height: 140px` or mobile `height: 120px` with `min-height: 240px` / responsive `min-height` causes worse page/rail overflow, hides another panel, clips the Chain of Thought header, or makes `.cot-content` non-scrollable.

Check desktop, tablet, and phone media rules. Account for the HTML rules that set `#chainOfThought` min-height to 160px at max-width 768px and 140px at max-width 480px.

If a breach exists, cite exact file:line and concrete viewport/layout sequence.
If no breach exists, list the tested viewport/layout states and the exact CSS rules that prevent worse overflow.
