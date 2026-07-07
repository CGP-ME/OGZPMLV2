# OGZPrime Design System

> Modular trading infrastructure. Plug in your strategies, backtest with real fees, deploy to live markets.

This is the brand + UI design system for **OGZPrime** — a modular, multi-broker
algorithmic crypto-trading platform. It packages the product's visual DNA
(colors, type, motion, components) so any new screen, slide, or marketing page
reads unmistakably as OGZPrime.

---

## What OGZPrime is

OGZPrime is a **trading-bot platform / infrastructure**. The pitch:
*"Your strategies. Our infrastructure."* It handles the hard parts — exchange
connections, indicator math, risk management, exit logic, position tracking —
so a trader brings only their edge. Core capabilities seen across the product:

- **Indicator Engine** — RSI, MACD, EMA, Bollinger Bands, ATR, ADX, VWAP,
  Stochastic RSI, SuperTrend, Two-Pole Oscillator, 15+ in real time.
- **Strategy Orchestrator** — plug in strategies; each competes on confidence,
  winner takes the trade. "No blended signals, no soup."
- **Exit Contract System** — per-strategy, per-trade SL / TP / trailing / tiered exits.
- **Risk Management** — drawdown limits, daily loss caps, confidence-scaled sizing.
- **Live Dashboard** — real-time TradingView charts, trade markers, WebSocket-fed.
- **Backtest Engine** — historical runs with real fees + per-strategy attribution.
- **Verified Operations** — operational proof (order handling, restart integrity,
  continuous operation) published automatically.

Pricing: **Core $49/mo**, **Pro $149/mo**, both with a 7-day free trial.

### Surfaces in the product
| Surface | Role | Voice |
|---|---|---|
| Marketing site (`index.html`, `pricing.html`, `features.html`) | acquisition | Space Mono + DM Sans, red on near-black |
| Unified Dashboard v2 (`unified-dashboard-v2.html`) | the live trading cockpit | Orbitron + JetBrains Mono, glass panels, neon glows |
| Command Center (`command-center.html`) | backtest analysis tool | Outfit + JetBrains Mono, gold-forward variant |
| Proof / Track Record (`proof/`) | trust & verification | dashboard styling |

---

## Sources (for the reader)

This system was reverse-engineered from the OGZPrime product repository.
You do **not** need access to build with this system, but if you have it, these
are worth exploring to raise fidelity further:

- **GitHub:** `CGP-ME/OGZPMLV2` — branch **`claude/new_beginnings`**
  (the "Empire V2" scalable stack). Front-end lives under `public/`.
  - `public/unified-dashboard-v2.html` — modular dashboard shell + the canonical theme `:root` block
  - `public/css/panels/*.css` — per-panel styling (header-strip, chain-of-thought, open-positions, cyberpunk-polish, …)
  - `public/index.html`, `public/pricing.html` — marketing site + palette
  - `public/command-center.html` — backtest analysis tool (gold variant)
- Related repos (same brand, trading bot lineage): `OGZaddy/Alpha`,
  `CGP-ME/OGZFV`, `CGP-ME/OGZFV-PRODUCTION`, `OGZaddy/OGZPMLV3`.

Explore `CGP-ME/OGZPMLV2` further to build higher-fidelity designs against
real product code (the `public/js/panels/*.js` modules render the live UI).

---

## CONTENT FUNDAMENTALS

**Voice:** confident, blunt, operator-to-operator. The brand talks like a
trader who has shipped, not a SaaS marketer. Self-description from the repo:
*"Built with maximum aggression and zero compromise."*

- **Person:** addresses the reader as **you**, positions OGZPrime as **we / our
  infrastructure**. *"You bring the edge — we handle everything else."*
- **Casing:** Sentence case for body. **UPPERCASE** for labels, tier names,
  status, and CTAs (`START FREE TRIAL`, `CORE`, `RECOMMENDED`, `BOT / DATA / TRAI`).
  The logo wordmark is uppercase **OGZPRIME**.
- **Sentence rhythm:** short, declarative, often fragment-punchy.
  *"Winner takes the trade. No blended signals, no soup."*
  *"Verified daily under real market conditions. No silent resets."*
- **Numbers as proof:** stats lead — `15+` indicators, `45K+` candles validated,
  `24/7` live operation, `7-day` trial. Precision signals credibility.
- **Trust language:** "verified", "recorded", "published automatically",
  "proof", "no silent resets", "instance isolation verified". The brand earns
  belief by showing receipts, not adjectives.
- **Trading vernacular is native:** SL/TP, drawdown, confidence, edge, candle,
  orchestrator, exit contract, attribution, regime. Don't soften the jargon —
  the audience is traders.
- **Internal codename energy:** the team uses militant/mythic codenames
  internally (Empire, Valhalla, Platoon, "Claudito"). This is *internal* flavor —
  keep customer-facing copy on the clean "infrastructure / verified" message.
- **Emoji:** essentially absent from polished customer surfaces. (A lone 📊
  appears in an internal tool's dropzone.) **Do not** use emoji in brand output.
  Use unicode glyphs and CSS shapes instead (see ICONOGRAPHY).

**Examples to emulate**
- Hero: *"Modular trading infrastructure. Plug in your strategies, backtest with real fees, deploy to live markets."*
- Section header: *"Your Strategies. Our Infrastructure."*
- Proof: *"Behavior is recorded and published automatically as part of normal operation."*
- CTA: *"Built Different. Verified Daily."*

---

## VISUAL FOUNDATIONS

**Overall vibe:** a dark, high-contrast trading terminal. Near-black canvas,
a single decisive red, and neon data accents that only light up to carry
*meaning* (green = profit, red = loss, gold = high-conviction, cyan = core).
Monospace everywhere signals precision and "this is real machinery."

- **Color:** Backgrounds are near-black (`#000` on the dashboard, `#0a0a0a`
  on marketing). **Brand red** is the one hero color — used for the
  logo, primary CTAs, headings, and active borders. Two reds coexist: the
  **logo / outlaw red `#b31512`** (the deep crimson of the cowboy-hat bandana)
  and the slightly brighter **UI red `#dc2626`** used across the web + dashboard
  chrome. Accents are functional, not decorative: profit `#00ff88`, loss
  `#ff3366`, gold `#ffd700` (ML / golden setup), cyan `#00ccff` (core engine),
  verified-green `#22c55e` (proof). Color is **scarce** — most of the screen is
  black/gray, so a glowing number reads instantly.\n- **Gold is the attention layer.** The base schema is, and always was, **black +\n  red**. Gold (`#ffd700`) is brought in deliberately as a *psychological\n  attention-grabber* \u2014 a glow / flash that says "look here NOW" on high-conviction\n  setups, golden-mode locks, and milestones \u2014 and it reinforces the cyberpunk\n  feel. Use it sparingly and in motion (see `ogz-gold-flash` / `ogz-gold-ring` /\n  `ogz-golden-glow` keyframes), never as a static fill.
- **Logo & brand mark:** the identity is an **outlaw / western** one carried
  over from the founder's **OGZaddy** YouTube streaming brand into the
  **OGZPrime** product. The mark is a **black-and-red cowboy hat** emblem above a
  **distressed, grunge-stencil wordmark** (the heritage crew badge reads
  `OG_ZADDY` on a banner). It's gritty and hand-roughed — the opposite of a
  clean SaaS logo. Use the **white-wordmark lockup on dark** (`ogz-logo-white.png`),
  the **dark lockup on light** (`ogz-logo-dark.png`), or the **crew badge**
  (`ogzaddy-badge.png`). Pair the hat emblem with an `OGZPRIME` wordmark when the
  product name needs to be explicit. There are also **animated logo stingers**
  (fire, metal, 6-sec reveal) for hero backdrops and intros.
- **Type:** Two pairings. Dashboard = **Orbitron** (display: hero equity
  price, big numerics) + **JetBrains Mono** (all UI text). Marketing =
  **Space Mono** (headings, red) + **DM Sans** (body, gray). The logo itself
  carries the distressed-stencil voice; the digital wordmark `OGZPRIME` is
  Orbitron, uppercase, weight 900, wide `4px`+ tracking. Headings are tight
  (`-1px` to `-2px`); labels are uppercase with `2px` tracking.
- **Backgrounds:** Flat near-black, NOT gradient-washed. Depth comes from
  layering (`#000` → `#0a0a0a` → `#0f0f0f` → `#111`) and from two very faint
  ambient radial glows (gold at 20%, cyan at 80%, each ~5% opacity) fixed behind
  the dashboard. Marketing hero uses a full-bleed video dimmed to `brightness(0.25)`.
  No busy patterns, no light mode.
- **Cards:** `#111` fill, `1px #222` border, radius `12px` (marketing) /
  `16px` (pricing). Default state is quiet; **hover lights the border red** and
  blooms an outer glow (`0 0 40px rgba(220,38,38,0.4)`). Featured/recommended
  cards switch the accent to verified-green.
- **Panels (dashboard):** glass — `rgba(14,14,16,0.72)` fill, hairline white
  border `rgba(255,255,255,0.1)`, radius `8px`, `backdrop-filter: blur(8px)`,
  and a soft underglow shadow. Panel titles are tiny uppercase gray labels
  (`10–11px`, `0.08em` tracking).
- **Shadows & glow:** two systems. (1) Depth — `0 8px 28px rgba(0,0,0,0.55)`
  plus a 1px inset red hairline. (2) Neon glow — colored `box-shadow`/`text-shadow`
  on live values (red logo glow, green/red price glow, gold high-conviction
  pulse). Glow = "this is alive / important."
- **Borders:** 1px hairlines do the structural work. `2px` for outline buttons
  and featured cards. The product's dashboard header code also uses a small
  rotated-45° **diamond** (`◆) accent beside a stand-in wordmark — treat that as
  chrome, not the brand mark; the real mark is the cowboy-hat emblem above.
- **Corner radii:** `4px` badges/pills → `6px` chips → `8px` panels/buttons/inputs
  → `12px` cards → `16px` pricing cards → `20px` status bars → full circles for
  status dots and step markers.
- **Transparency & blur:** used for the header/footer bars and glass panels
  (`rgba(0,0,0,0.8)` + `blur(8px)`), and for tinted state fills
  (`rgba(220,38,38,0.1)` red wash on hover, `rgba(0,230,118,0.08)` green wash).
- **Animation:** fast and purposeful. `120ms` price-tick color flash, `200ms`
  button/transform, `300ms` border/shadow. Signature **hover lift**
  `translateY(-2px)`. Status dots **pulse** (1.2s). High-conviction setups get a
  gold glow pulse; trade entries flash. A very subtle 8s ambient scan-line
  sweeps the dashboard. Easing `cubic-bezier(0.25,0.46,0.45,0.94)`. All motion is
  gated by `prefers-reduced-motion`.
- **Hover states:** border → red, plus the `-2px` lift and/or an outer glow.
  Links go from red `#dc2626` to lighter `#f87171`/underline. Buttons brighten
  `#dc2626 → #ef4444`.
- **Press states:** primary buttons keep the brighter red; selected items scale
  up `1.02` with a stronger underglow + gold ring.
- **Imagery vibe:** dark, cool, technical — charts, candles, terminal UI — with
  an **outlaw / western grunge** overlay from the logo world (distressed
  textures, splatter, stencil edges). Where video/photography appears it's dimmed
  hard (e.g. `brightness(0.25)`) so the red mark pops; the animated logo stingers
  (fire / metal) are the canonical hero motion. No warm lifestyle, no stock-photo
  gloss.
- **Layout rules:** dashboard is a fixed 3-column shell (left rail `320px` |
  fluid center | right rail `320px`) with a fixed `60px` header and footer
  health strip; rails are resizable and collapse-stack below `1200px`. Marketing
  is a centered single column, `max-width: 1000px`, generous `80px` vertical
  section padding.

---

## ICONOGRAPHY

The brand's central mark is the **OGZaddy cowboy-hat emblem** (black crown, red
bandana) with a **distressed grunge-stencil wordmark** — carried into OGZPrime
for recognition. Real logo assets live in `assets/logos/`
(`ogz-logo-white.png`, `ogz-logo-dark.png`, `ogzaddy-badge.png`) and animated
stingers in `assets/video/`. Use them — do not redraw the hat.

Beyond the logo, the in-product visual language is deliberately minimal and is
built from:

- **CSS shapes** — circular **status dots** (green/red/gray with glow + pulse)
  for BOT / DATA / TRAI health; pill-shaped status bars; the small rotated-45°
  **diamond** (`◆`) used as chrome in the dashboard header.
- **Unicode glyphs** as functional marks: `✓` (U+2713) for verified/feature
  checks, `★` (U+2605) for highlighted Pro features, `←`/`→` arrows for nav,
  `—`/`✕` for "not included". These are colored with semantic tokens
  (check = verified-green, star = warn-amber).
- **Numerals as iconography** — big Orbitron numbers (equity, confidence %,
  P&L) are the real "icons" of the dashboard.
- **No emoji** on customer surfaces (one internal-tool exception). Don't introduce them.

**Guidance for new work**
- Prefer CSS shapes + unicode for the established marks above — they're authentic
  to the brand and need no assets.
- If a screen genuinely needs a richer icon set (settings gear, chart, wallet,
  etc.), the product ships none, so **substitute Lucide** (`https://unpkg.com/lucide`)
  — thin 2px strokes, square feel, which matches the terminal aesthetic — and
  **flag the substitution** to the user, since it is not an official asset.
- Keep icons monochrome (inherit `currentColor`); let the semantic color tokens
  do the talking. Never multi-color an icon.

> **Logo assets (official):** `assets/logos/ogz-logo-white.png` (wordmark in
> white — for dark surfaces), `assets/logos/ogz-logo-dark.png` (for light
> surfaces), `assets/logos/ogzaddy-badge.png` (the OG_ZADDY crew badge), plus
> animated stingers in `assets/video/` (`ogz-logo-fire.mp4`, `ogz-logo-metal.mp4`,
> `ogz-stinger-6sec.mp4`). The cowboy-hat bandana red is **`#b31512`**. These are
> the founder's real OGZaddy brand assets, reused as OGZPrime carries the
> recognition forward — always prefer them over any redrawn mark.

---

## Foundations at a glance

| Token group | File | Highlights |
|---|---|---|
| Colors | `tokens/colors.css` | `--ogz-red-blood #b31512` (logo), `--ogz-red #dc2626`, profit/loss/gold/cyan, glass surfaces |
| Type | `tokens/typography.css` | Orbitron / JetBrains Mono / Space Mono / DM Sans + scale |
| Spacing | `tokens/spacing.css` | 4→80px scale, radii, dashboard rail layout |
| Effects | `tokens/effects.css` | glass shadows, neon glows, heat gradient, motion |
| Fonts | `tokens/fonts.css` | Google Fonts import (all four families) |

*Fonts note: all four families are Google Fonts, loaded from CDN — no local
binaries and no substitutions were required.*

---

## Index / manifest

**Root**
- `styles.css` — the single entry point consumers link (import-only).
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills front-matter wrapper.

**Tokens** (`tokens/`) — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`.

**Brand assets** (`assets/`) — `logos/` (`ogz-logo-white.png`, `ogz-logo-dark.png`,
`ogzaddy-badge.png`) and `video/` (animated logo stingers: fire, metal, 6-sec).

**Foundation cards** (`guidelines/`) — specimen cards shown in the Design System tab:
color (brand / semantic / surfaces), type (display / mono / marketing), spacing
(scale / radii), effects (shadows), brand (logo / iconography).

**Components** (`components/`) — React primitives, bundled to `window.OGZPrimeDesignSystem_802711`:
| Component | Dir | What |
|---|---|---|
| `Button` | core | primary / outline / ghost / verified; hover lift |
| `Card` | core | dark surface, hover-lit red/green border + glow |
| `Badge` | core | semantic pill (solid + soft); LONG/SHORT tags |
| `Panel` | dashboard | glass module shell with tiny uppercase title |
| `StatusLight` | dashboard | BOT/DATA/TRAI health dot (active/error/idle) |
| `Metric` | dashboard | big Orbitron readout, trend-colored, optional glow |
| `Input` | forms | dark field, red focus ring, mono option |
| `Tabs` | navigation | underline tab bar (red/gold/cyan accents) |

**UI kits** (`ui_kits/`)
- `trading-dashboard/` — the flagship **Unified Dashboard v2** cockpit
  (header + watchlist + news ticker + chart + chain-of-thought + positions +
  edge analytics + TRAI + equity curve + health footer). Interactive: pick a
  ticker, switch timeframes, toggle indicators, and flip between the **4 profile
  views** (Operator / Trader / Showcase / Streamer) via the bottom switcher.
- `marketing-site/` — the **Landing Page** (hero, stat bar, feature grid,
  verified-proof strip, pricing, CTA).

**Templates** (`templates/`) — copy-and-go starting points (consumers see these
in the picker). Each is a `.dc.html` that composes the DS components via
`x-import` and carries the real logo:
- `trading-dashboard/TradingDashboard.dc.html` — the cockpit shell (header,
  watchlist, chart, chain-of-thought, positions, edge, equity, report).
- `marketing-landing/MarketingLanding.dc.html` — the full landing page.

**Source reference** (`public/`) — imported originals from `CGP-ME/OGZPMLV2`
(`@claude/new_beginnings`): the v2 dashboard shell, marketing index/pricing,
and the panel CSS the component styling was lifted from. Kept for fidelity;
not part of the shipped token closure.
