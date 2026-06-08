# OGZPrime Mobile — Phase 0: Auth Foundation & Live Token-Leak Remediation

| Field | Value |
|---|---|
| Doc type | PROPOSAL (advisory — no code changes authorized by this doc) |
| Status | DRAFT — awaiting Trey approval |
| Author | Claude (cross-reference / analysis seat) |
| Date | 2026-06-06 |
| Location | `ogz-ledger/proposals/` (non-canonical, NOT Mercury-indexed) |
| Blocks | OGZPrime Mobile (all phases) |
| Severity | CRITICAL — live production exposure |

---

## 0. Why this doc exists

Trey asked to flesh out **OGZPrime Mobile**, a monitor-first PWA with guarded operator
controls. While mapping the backend the mobile client would talk to, I found a **live,
publicly-exploitable credential leak** on the production deployment. The mobile project
cannot safely proceed until it is closed, and the fix for it *is* the auth foundation the
mobile app needs anyway. So Phase 0 of OGZPrime Mobile is: **fix the leak by building real
auth.** This doc specifies that work. It authorizes no code on its own — it is the artifact
to review before any implementation mission is approved.

---

## 1. The finding (CRITICAL, live)

### 1.1 What was observed

An anonymous, unauthenticated HTTP GET to:

```
https://ogzprime.org/unified-dashboard-v2.html
```

returned the live WebSocket authentication secret in a meta tag:

```html
<meta name="ws-token" content="[REDACTED]">
```

No login, no session cookie, no email gate. The value above is the live
`WEBSOCKET_AUTH_TOKEN` — the single shared secret that gates the entire dashboard
WebSocket, including the channel the trading bot connects through.

> The "Unlock Live Demo — enter your email" prompt on the marketing landing page is
> cosmetic. The real dashboard route is unauthenticated and serves the secret to any
> caller.

### 1.2 Root cause (file:line)

In `ogzprime-ssl-server.js`:

- **Lines 95–110** — `injectDashboardToken()` writes `process.env.WEBSOCKET_AUTH_TOKEN`
  directly into the served HTML at request time.
- **Lines 134–151** — the routes `/`, `/index.html`, `/unified-dashboard.html`,
  `/unified-dashboard-v2.html` are wired to serve that token-injected HTML **with no
  authentication middleware in front of them**. Any unauthenticated GET receives the token.
- **Lines 1664–1722** — the WS server authenticates every client by comparing the
  client-supplied token against the same `WEBSOCKET_AUTH_TOKEN`. One global secret gates
  all clients (dashboard and bot alike).
- **Line 1702** — the comparison falls back to the literal default
  `'CHANGE_ME_IN_PRODUCTION'` if the env var is unset.

The architectural flaw: **a single shared secret is printed into publicly-served HTML and
also used as the only WS credential.** Token *value* is not the bug; the *model* is.

### 1.3 Blast radius — what the leaked token enables today

Using the leaked token, an attacker can connect to the dashboard WS, send
`{ "type": "auth", "token": "<leaked>" }`, authenticate, and then:

1. **Read everything (confirmed-capable):** identify as `dashboard` and receive the live
   broadcast stream — `state_update` (balance, open position, P&L, recovery mode),
   `bot_thinking` (TRAI reasoning + strategy stack), `broker_status`, funding/fear-greed/
   liquidation/market-internals/smart-money/CVD frames. This is a full read breach of live
   trading state and account equity.
2. **Poison the relay (plausible):** identify as `clientType: 'bot'` (handshake at lines
   1740–1748 sets type purely on a self-declared `source` field) and inject crafted frames.
   The server relays dashboard↔bot messages; a hostile "bot" client could feed fabricated
   reasoning/data to the real dashboard.

### 1.4 The one mercy

There are **no operator-command handlers** in the codebase yet — no `pause`, `resume`,
`close`, `kill`, or order-placement message types are handled over the WS. So the leaked
token can **watch** but cannot **act**. This is the only reason the finding is a severe
information-disclosure breach rather than a remote-control-of-funds catastrophe.

This is also the central argument of this doc: **the day mobile operator controls ship on
top of this model, the same exposure becomes a remote kill switch for anyone on the
internet.** Auth must be rebuilt before, not after.

---

## 2. Immediate mitigation (band-aid — Trey-operated)

Independent of this spec, to stop the active bleed:

1. Rotate `WEBSOCKET_AUTH_TOKEN` in `.env` (new 32-byte random hex).
2. Restart the dashboard server (`./start-ogzprime.sh restart`) and the bot so both
   re-handshake with the new token.

This invalidates the leaked `38610…` token immediately.

**Why this is not the fix:** the rotated token is re-served to the next anonymous visitor
of the dashboard route by the exact same code path. You cannot out-rotate an architecture
that publishes the secret. Section 3 is the actual fix.

---

## 3. Phase 0 design — the auth foundation

Goal: replace "one shared secret, served publicly" with "authenticated users holding
short-lived, per-identity credentials." This closes the leak and becomes the identity layer
mobile rides on.

### 3.1 Principles

- **No long-lived secret ever reaches the browser/PWA.** The dashboard HTML stops carrying
  any WS token.
- **Identity is per-user (and per-device).** A lost/compromised phone can be revoked
  without rotating everyone.
- **The WS credential is short-lived and minted per session**, not a static global string.
- **The backend remains the source of truth.** The client proves identity; the server
  decides what it may see or do.

### 3.2 Components

1. **Auth gateway in front of dashboard + WS routes.**
   - A login wall (email + password, or magic-link — see Open Questions) issues an
     HttpOnly, Secure, SameSite session cookie.
   - Dashboard HTML routes (lines 134–151) require a valid session before serving. The
     `ws-token` meta-injection is **removed** (Section 3.3 replaces it).

2. **Short-lived WS ticket endpoint.**
   - `POST /api/ws-ticket` (session-authenticated) mints a single-use, short-TTL
     (e.g. 60 s) signed ticket bound to the user/device and a nonce.
   - The browser/PWA requests a ticket at connect time and presents it as the WS `auth`
     message. The WS validates signature, TTL, single-use, and identity — replacing the
     static-token compare at lines 1701–1722.

3. **Per-device registration & revocation.**
   - Devices (a browser, a phone PWA) are registered to a user with a server-side record
     and a rev\-/expire-able device token.
   - A revocation list (or short token TTL + refresh) lets a stolen phone be cut off
     instantly.

4. **Trusted bot identity, separated from human users.**
   - The bot (`run-empire-v2.js`) authenticates with its own service credential, distinct
     from human session auth. `clientType: 'bot'` must be derived from that credential —
     **not** from a self-declared `source` field (closes the relay-poisoning vector in
     1.3.2).

5. **Rate limiting & abuse controls on auth + WS handshake** (the repo already depends on
   `express-rate-limit`; extend it to the login, ticket, and WS-upgrade paths).

### 3.3 Migration path (low-risk, staged)

1. Stand up gateway + login + ticket endpoint **alongside** the current token flow, behind
   a feature flag, on staging.
2. Cut dashboard routes over to session-gated serving; remove meta-token injection.
3. Cut the bot over to service-credential auth.
4. Remove the static `WEBSOCKET_AUTH_TOKEN` compare path entirely once both sides are
   migrated and validated end-to-end.

---

## 4. Command-contract foundation (groundwork for guarded controls)

Not built in Phase 0, but Phase 0's identity layer must be designed so these slot in
cleanly. Per Trey's mobile spec, the phone never mutates trade state — it sends *intent*;
the backend validates and acts. The contract:

```
operator intent (mobile)
  → authenticated WS/REST command  { type:'operator_action', action, traceId, deviceId }
    → backend command handler (in bot, source of truth)
      → risk/state gate validation (reuse existing risk layer)
        → execute or reject
          → append to command ledger (jsonl, append-only)
          → emit operator_action event (audit + dashboard echo)
```

Required invariants for any destructive action (`pause`, `resume`, `emergency_close`,
`emergency_close_all`, `mute_trai`, `ack_risk`, `request_snapshot`):

- Client-side: hold-to-confirm + biometric/passcode (where available).
- Transport: authenticated session + per-action `traceId`.
- Server-side: backend command handler + risk/state gate + append to command ledger +
  `operator_action` event. **No client-trusted execution.**
- **No unrestricted manual buy/sell in v1.** Deferred to a future Admin/Advanced mode
  behind re-authentication.

---

## 5. How this unblocks OGZPrime Mobile

| Mobile spec requirement | Provided by |
|---|---|
| Monitor views (status, equity/PnL, positions, trades, TRAI reasoning, guardrails, broker/feed health, alerts) | Already broadcast over existing WS (`state_update`, `bot_thinking`, `broker_status`, etc.) — consumed by a new mobile client once auth is fixed |
| "Backend is source of truth; phone sends intent only" | Section 4 command contract |
| Guarded operator controls (pause/resume/close/mute/ack/snapshot) | Section 4 (built in a later phase on Phase 0 identity) |
| Hold-to-confirm + biometric + ledger + traceId + risk gate for destructive actions | Section 4 invariants |
| Safe public exposure | Section 3 auth foundation (the prerequisite) |

---

## 6. Proposed phase roadmap

- **Phase 0 — Auth foundation + leak remediation (this doc).** Gateway, login, per-device
  identity, short-lived WS tickets, bot service credential, remove shared-secret model.
- **Phase 1 — Monitor-only PWA.** Mobile-responsive read-only client on the existing
  broadcast feed; installable; zero new mutation surface.
- **Phase 2 — Push notifications** (fills, errors, kill/guardrail events) via Web Push/VAPID.
- **Phase 3 — Guarded operator controls.** Backend command handler + risk gate + ledger +
  `operator_action`, then mobile hold-to-confirm + biometric UI.
- **Phase 4 (later) — Admin/Advanced manual trading** under re-auth. Out of v1 scope.

---

## 7. Scope boundaries (WARDEN)

- This doc changes **no code.** It is a proposal to review.
- Phase 0 touches auth/serving paths only. It does **not** refactor the trading engine,
  broker layer, strategies, or backtester.
- The `command-center.html` page (public client-side CSV backtest analyzer) is noted as
  also publicly served but is **lower risk** and out of Phase 0 scope; flag for a later
  hardening pass, do not bundle it here.

---

## 8. Open questions for Trey

1. **Auth method:** email+password, magic-link, or OAuth (Google)? Affects gateway design
   and the 7-day-trial signup flow already implied on the marketing site.
2. **Who logs in:** just you (single operator), or real multi-tenant customers (the site
   advertises trials/pricing, implying customers)? Multi-tenant materially expands Phase 0.
3. **Hosting/runtime of the dashboard server** (bare node + nginx, PM2, container)? Drives
   how the gateway and session store are deployed.
4. **Session store:** the repo already depends on `mongodb` — use it for sessions/devices,
   or keep it lighter (signed stateless tokens + a small revocation list)?
5. **Has the token been rotated yet** per Section 2?

---

## 9. Acceptance criteria for Phase 0 (definition of done)

- [ ] Anonymous GET of any dashboard route returns **no** WS token and **no** trading data;
      it redirects to login.
- [ ] Dashboard WS rejects any connection not presenting a valid, unexpired, single-use,
      identity-bound ticket.
- [ ] Bot authenticates with a service credential; `clientType` is server-derived, not
      self-declared.
- [ ] A specific device can be revoked without disrupting other devices/users.
- [ ] The static `WEBSOCKET_AUTH_TOKEN` compare path is removed.
- [ ] Auth, ticket, and WS-upgrade endpoints are rate-limited.
- [ ] End-to-end smoke test passes (`./start-ogzprime.sh restart` + dashboard loads +
      bot reconnects) before any commit.

---

*Pipeline note: implementation, when approved, runs the standard chain — Warden → Architect
→ Fixer → Debugger → Validator → Forensics → Committer → Scribe — with explicit Trey
approval before any code is applied.*
