# ProdLock Portable — Monetization Strategy

## The Decision

**Recommendation: Open-Core**

Why? Trust is the product. If users can't see the code, they won't trust it with their code.

---

## Open-Core Model

### Free (MIT License)

Everything in `prodlock-portable` repo:

| Feature | Free |
|---------|------|
| `prodlock init` | ✅ |
| `prodlock analyze` | ✅ |
| `prodlock approve/reject` | ✅ |
| Advisory mode | ✅ |
| Proposal generation | ✅ |
| Local RAG | ✅ |
| Audit trail | ✅ |
| CLI interface | ✅ |
| JavaScript/TypeScript | ✅ |
| Unlimited repos | ✅ |
| Offline usage | ✅ |

**This is a complete, usable product. Not crippleware.**

---

### Paid: ProdLock Pro ($49-99/month)

Separate closed-source add-on or hosted service:

| Feature | Pro |
|---------|-----|
| Cloud RAG sync | ✅ |
| Cross-repo learning | ✅ |
| Team audit dashboard | ✅ |
| Proposal analytics | ✅ |
| Priority support | ✅ |
| Python/Go/Rust support | ✅ |
| Web UI for proposals | ✅ |
| Custom agents | ✅ |
| SSO/SAML | ✅ |

---

## Why Open-Core Wins

### 1. Trust Through Transparency
- Users can audit the code
- Security teams can approve it
- No "what is this doing to my repo?" fear

### 2. Community as Marketing
- Open source gets GitHub stars
- Stars = social proof
- Contributors = advocates

### 3. Free Tier Creates Pipeline
- Free users → Pro users (5-10% convert)
- Free users → Word of mouth
- Free users → Blog posts, tutorials

### 4. Moat Is In The Add-Ons
- The protocol is open
- The cloud features are proprietary
- Can't be forked without building infra

---

## Pricing Tiers

### Free
$0/forever

- Full local functionality
- Unlimited personal use
- Community support (GitHub issues)

### Pro (Solo)
$49/month

- Everything in Free
- Cloud RAG sync (your fix history, encrypted)
- Cross-project learning
- Email support

### Pro (Team)
$99/month per seat

- Everything in Pro Solo
- Team audit dashboard
- Shared proposal library
- Role-based access
- SSO

### Enterprise
Custom pricing

- Everything in Pro Team
- On-prem deployment
- Custom integrations
- SLA
- Dedicated support

---

## Revenue Projections (Conservative)

### Year 1 Target
- 1,000 free users
- 50 Pro Solo ($49 × 50 = $2,450/mo)
- 10 Pro Team ($99 × 30 seats = $2,970/mo)

**Monthly: ~$5,400**
**Annual: ~$65,000**

### Year 2 Target
- 10,000 free users
- 500 Pro Solo ($24,500/mo)
- 50 Pro Team ($14,850/mo)

**Monthly: ~$39,350**
**Annual: ~$472,000**

---

## Alternative: Paid-Only

If you want to skip open-source:

### Pros
- Full control over code
- No support burden for free users
- Perceived higher value

### Cons
- No community marketing
- Must pay for all distribution
- Trust harder to build
- Competitors can go open and eat your lunch

**Not recommended for v1.**

---

## Implementation Path

### Phase 1 (Now)
- Ship open-source MIT version
- No payment infrastructure
- Collect emails for "Pro waitlist"

### Phase 2 (After 500+ stars)
- Build Pro features
- Stripe integration
- Cloud backend (simple: Supabase or similar)

### Phase 3 (After revenue)
- Team features
- Enterprise outreach
- Maybe raise if needed (probably not)

---

## Key Metrics to Track

| Metric | Target (6 months) |
|--------|-------------------|
| GitHub stars | 1,000 |
| npm downloads/week | 500 |
| Free users | 1,000 |
| Pro conversions | 5% |
| MRR | $5,000 |

---

## The One Rule

**Free must be genuinely useful.**

If free users feel crippled, they'll hate you. If free users feel empowered, they'll tell everyone.

ProdLock Free should make someone say:
> "Holy shit this is free?"

Then Pro becomes:
> "Okay, now I want MORE."

---

*Decision: Open-Core. Ship free. Monetize later.*
