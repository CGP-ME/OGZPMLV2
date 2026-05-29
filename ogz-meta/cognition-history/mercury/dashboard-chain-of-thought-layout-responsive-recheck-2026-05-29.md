Break the Chain of Thought responsive layout after matching injected and static media rules. Do not validate it.

Scope:
- `public/js/panels/chain-of-thought.js:97-128`
- `public/css/panels/chain-of-thought.css:21-38`
- `public/css/panels/chain-of-thought.css:410-443`
- `public/unified-dashboard-v2.html:354-363`
- `public/unified-dashboard-v2.html:475-504`

Patch summary:
- Desktop/default minimum height is 240px in JS-injected CSS and static CSS.
- Tablet/mobile max-width 768px minimum height is 160px in JS-injected CSS, static CSS, and HTML.
- Phone max-width 480px minimum height is 140px in JS-injected CSS, static CSS, and HTML.
- No active CSS source should set a fixed `height` on `#chainOfThought`.
- `.cot-content` remains the scroll container.

Attack goal:
Find a desktop, tablet, or phone viewport where a later style source overrides the responsive minimum height, where any fixed height remains active, where entries push outside the panel instead of scrolling inside `.cot-content`, or where another panel is hidden because of this change.

If a breach exists, cite exact file:line and concrete viewport/layout sequence.
If no breach exists, list the active rules for desktop, tablet, and phone and why the scroll behavior holds.
