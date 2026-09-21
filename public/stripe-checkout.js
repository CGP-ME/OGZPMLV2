/**
 * OGZPrime Stripe Checkout Endpoint
 * Drop this into your Express server or run standalone
 * 
 * SETUP:
 * 1. npm install stripe express cors
 * 2. Set STRIPE_SECRET_KEY in .env (NEVER commit the secret key)
 * 3. Add route to your existing Express app or run standalone
 */

const RuntimeAuditSink = require('../core/RuntimeAuditSink');
const isStandaloneCheckout = require.main === module;
const checkoutAuditSink = isStandaloneCheckout
  ? new RuntimeAuditSink({
    processRole: 'ogz-stripe',
    phase: 'configuration_source',
  })
  : null;

function captureCheckoutFailure(eventType, input, extra = {}) {
  if (!checkoutAuditSink) return null;
  return checkoutAuditSink.capture(eventType, input, {
    processRole: 'ogz-stripe',
    phase: checkoutAuditSink.phase,
    runtimeScope: checkoutAuditSink.phase,
    extra,
  });
}

if (checkoutAuditSink) {
  process.on('uncaughtException', (error) => {
    captureCheckoutFailure('uncaughtException', error);
    console.error('[Checkout] Uncaught exception:', checkoutAuditSink.redactForOutput(error));
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    captureCheckoutFailure('unhandledRejection', reason, {
      promise: Object.prototype.toString.call(promise),
    });
    console.error(
      '[Checkout] Unhandled rejection:',
      checkoutAuditSink.redactForOutput(reason),
      `promise=${Object.prototype.toString.call(promise)}`
    );
    process.exit(1);
  });
}

const { load: loadConfig } = require('../foundation/ConfigLoader');
const checkoutConfig = loadConfig({ silent: true, role: 'checkout' }).config.services.checkout;
if (checkoutAuditSink) checkoutAuditSink.setPhase('service_initialization');
const express = require('express');
const cors = require('cors');

const stripe = require('stripe')(checkoutConfig.stripeSecretKey);

const app = express();
app.use(cors());
app.use(express.json());

// Price IDs from Stripe dashboard
const PRICE_MAP = checkoutConfig.priceMap;

/**
 * POST /create-checkout-session
 * Body: { priceId: "price_..." } or { tier: "core" | "pro" }
 */
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, tier } = req.body;
    
    // Accept either raw priceId or tier name
    const resolvedPriceId = priceId || PRICE_MAP[tier];
    
    if (!resolvedPriceId) {
      return res.status(400).json({ error: 'Invalid tier or priceId' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: resolvedPriceId,
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: checkoutConfig.trialPeriodDays,
      },
      success_url: checkoutConfig.successUrl,
      cancel_url: checkoutConfig.cancelUrl,
      allow_promotion_codes: true,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /checkout-status?session_id=cs_...
 * For the success page to verify payment
 */
app.get('/checkout-status', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    res.json({
      status: session.payment_status,
      customer_email: session.customer_details?.email,
      subscription: session.subscription,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// If running standalone (not imported into existing app)
if (isStandaloneCheckout) {
  const PORT = checkoutConfig.port;
  app.listen(PORT, () => {
    checkoutAuditSink.setPhase('runtime');
    console.log(`Stripe checkout server running on port ${PORT}`);
  });
}

module.exports = app;
