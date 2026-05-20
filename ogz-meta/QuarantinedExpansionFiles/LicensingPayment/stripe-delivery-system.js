/**
 * OGZ PRIME AUTOMATED DELIVERY SYSTEM
 * Handles Stripe payments → License generation → Email delivery
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3009;

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

// Database (in production use PostgreSQL/MongoDB)
const licenses = new Map();
const downloads = new Map();

// Email transporter (use SendGrid/Mailgun in production)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Generate unique license key
 */
function generateLicenseKey() {
    const prefix = 'OGZ';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${random.substring(0, 4)}-${random.substring(4, 8)}-${random.substring(8, 12)}-${random.substring(12, 16)}`;
}

/**
 * Generate secure download URL
 */
function generateDownloadUrl(email, licenseKey) {
    const token = crypto
        .createHash('sha256')
        .update(`${email}-${licenseKey}-${Date.now()}`)
        .digest('hex');
    
    // Store download token with expiry
    downloads.set(token, {
        email,
        licenseKey,
        created: Date.now(),
        expires: Date.now() + (48 * 60 * 60 * 1000), // 48 hours
        downloadCount: 0,
        maxDownloads: 5
    });
    
    return `https://ogzprime.com/download/${token}`;
}

/**
 * Send delivery email
 */
async function sendDeliveryEmail(customer) {
    const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #00ff00;
            padding-bottom: 30px;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 48px;
            font-weight: bold;
            background: linear-gradient(135deg, #00ff00 0%, #00cc00 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .title {
            font-size: 24px;
            color: #00ff00;
            margin-bottom: 20px;
        }
        .license-box {
            background: #0a0a0a;
            border: 2px solid #00ff00;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .license-key {
            font-family: 'Courier New', monospace;
            font-size: 18px;
            color: #00ff00;
            letter-spacing: 2px;
            margin: 10px 0;
            word-break: break-all;
        }
        .download-btn {
            display: inline-block;
            background: linear-gradient(135deg, #00ff00 0%, #00cc00 100%);
            color: #000;
            text-decoration: none;
            padding: 15px 40px;
            border-radius: 30px;
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0;
            transition: all 0.3s;
        }
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0, 255, 0, 0.3);
        }
        .instructions {
            background: #1a1a1a;
            border-left: 4px solid #00ff00;
            padding: 20px;
            margin: 20px 0;
        }
        .step {
            margin: 10px 0;
            padding-left: 20px;
        }
        .warning {
            background: #2a1a1a;
            border: 1px solid #ff6600;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            color: #ff9933;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #333;
            color: #999;
        }
        .support-link {
            color: #00ff00;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">OGZ PRIME</div>
            <div class="title">🎉 Welcome to the Elite!</div>
        </div>
        
        <p>Hey ${customer.name || 'Trader'},</p>
        
        <p>Your OGZ Prime Trading Bot is ready! Here's everything you need to get started:</p>
        
        <div class="license-box">
            <strong>YOUR LICENSE KEY</strong>
            <div class="license-key">${customer.licenseKey}</div>
            <small style="color: #999;">Keep this safe - you'll need it to activate</small>
        </div>
        
        <div style="text-align: center;">
            <a href="${customer.downloadUrl}" class="download-btn">
                📥 DOWNLOAD OGZ PRIME BOT
            </a>
            <br>
            <small style="color: #999;">Link expires in 48 hours • Max 5 downloads</small>
        </div>
        
        <div class="instructions">
            <strong style="color: #00ff00;">🚀 Quick Start Guide:</strong>
            <div class="step">1️⃣ Download and extract the package</div>
            <div class="step">2️⃣ Run: <code>npm install</code></div>
            <div class="step">3️⃣ Add your Kraken API keys to config/settings.json</div>
            <div class="step">4️⃣ Enter your license key when prompted</div>
            <div class="step">5️⃣ Start with: <code>./start-bot.sh</code> or <code>start-bot.bat</code></div>
        </div>
        
        <div class="warning">
            ⚠️ <strong>Important:</strong> Start with paper trading mode to test the system before going live!
        </div>
        
        <p><strong>What's Included:</strong></p>
        <ul>
            <li>✅ OGZ Prime Trading Engine (protected binary)</li>
            <li>✅ Web Control Panel</li>
            <li>✅ Risk Management Profiles</li>
            <li>✅ 30-day Email Support</li>
            <li>✅ Free Updates for 1 Year</li>
        </ul>
        
        <p><strong>Need Help?</strong></p>
        <ul>
            <li>📧 Email: <a href="mailto:support@ogzprime.com" class="support-link">support@ogzprime.com</a></li>
            <li>📚 Docs: <a href="https://docs.ogzprime.com" class="support-link">docs.ogzprime.com</a></li>
            <li>💬 Discord: <a href="https://discord.gg/ogzprime" class="support-link">discord.gg/ogzprime</a></li>
        </ul>
        
        <div class="footer">
            <p>Thank you for choosing OGZ Prime!</p>
            <p style="font-size: 12px; color: #666;">
                This is an automated email. Your license has been registered to: ${customer.email}<br>
                Order ID: ${customer.orderId}
            </p>
        </div>
    </div>
</body>
</html>
`;

    const mailOptions = {
        from: '"OGZ Prime" <noreply@ogzprime.com>',
        to: customer.email,
        subject: '🚀 Your OGZ Prime Trading Bot is Ready!',
        html: emailTemplate,
        text: `
Welcome to OGZ Prime!

Your license key: ${customer.licenseKey}
Download link: ${customer.downloadUrl}

Quick Start:
1. Download and extract the package
2. Run: npm install
3. Add your API keys to config/settings.json
4. Enter your license key when prompted
5. Start with: ./start-bot.sh or start-bot.bat

Support: support@ogzprime.com

Thank you!
OGZ Prime Team
`
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Delivery email sent to ${customer.email}`);
}

/**
 * Stripe webhook endpoint
 */
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            await handleSuccessfulPayment(paymentIntent);
            break;

        case 'checkout.session.completed':
            const session = event.data.object;
            await handleCheckoutSession(session);
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

/**
 * Handle successful payment
 */
async function handleSuccessfulPayment(paymentIntent) {
    console.log('💰 Payment successful:', paymentIntent.id);

    // Extract customer info
    const customer = {
        email: paymentIntent.receipt_email || paymentIntent.charges.data[0].billing_details.email,
        name: paymentIntent.charges.data[0].billing_details.name,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        orderId: paymentIntent.id
    };

    // Generate license
    customer.licenseKey = generateLicenseKey();
    customer.downloadUrl = generateDownloadUrl(customer.email, customer.licenseKey);

    // Store license
    licenses.set(customer.licenseKey, {
        email: customer.email,
        name: customer.name,
        orderId: customer.orderId,
        created: Date.now(),
        activated: false,
        machineId: null
    });

    // Send delivery email
    try {
        await sendDeliveryEmail(customer);
        console.log(`✅ Order processed for ${customer.email}`);
    } catch (error) {
        console.error('Failed to send email:', error);
        // Store for retry
        fs.appendFileSync('failed-deliveries.log', 
            `${new Date().toISOString()} - ${customer.email} - ${customer.licenseKey}\n`
        );
    }
}

/**
 * Handle checkout session
 */
async function handleCheckoutSession(session) {
    console.log('🛒 Checkout completed:', session.id);

    // Retrieve full session details
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items', 'customer']
    });

    const customer = {
        email: fullSession.customer_email || fullSession.customer_details.email,
        name: fullSession.customer_details.name,
        amount: fullSession.amount_total / 100,
        currency: fullSession.currency,
        orderId: fullSession.id
    };

    // Generate and send license
    customer.licenseKey = generateLicenseKey();
    customer.downloadUrl = generateDownloadUrl(customer.email, customer.licenseKey);

    licenses.set(customer.licenseKey, {
        email: customer.email,
        name: customer.name,
        orderId: customer.orderId,
        created: Date.now(),
        activated: false
    });

    await sendDeliveryEmail(customer);
}

/**
 * Download endpoint
 */
app.get('/download/:token', (req, res) => {
    const { token } = req.params;
    const download = downloads.get(token);

    if (!download) {
        return res.status(404).send('Download link not found');
    }

    if (Date.now() > download.expires) {
        downloads.delete(token);
        return res.status(410).send('Download link expired');
    }

    if (download.downloadCount >= download.maxDownloads) {
        return res.status(429).send('Download limit exceeded');
    }

    // Update download count
    download.downloadCount++;
    downloads.set(token, download);

    // Serve the file
    const filePath = path.join(__dirname, 'packages', 'ogz-prime-v1.0-customer.tar.gz');
    
    if (!fs.existsSync(filePath)) {
        return res.status(500).send('Package file not found');
    }

    res.download(filePath, 'ogz-prime-bot.tar.gz', (err) => {
        if (err) {
            console.error('Download error:', err);
        } else {
            console.log(`📥 Download completed for ${download.email}`);
        }
    });
});

/**
 * License verification endpoint (called by bot)
 */
app.post('/api/verify-license', (req, res) => {
    const { licenseKey, machineId } = req.body;

    const license = licenses.get(licenseKey);

    if (!license) {
        return res.status(404).json({ valid: false, error: 'Invalid license key' });
    }

    // First activation
    if (!license.activated) {
        license.activated = true;
        license.activatedAt = Date.now();
        license.machineId = machineId;
        licenses.set(licenseKey, license);
        
        return res.json({
            valid: true,
            message: 'License activated successfully',
            features: {
                maxPairs: 3,
                allowLive: true,
                supportExpires: Date.now() + (30 * 24 * 60 * 60 * 1000)
            }
        });
    }

    // Verify machine ID
    if (license.machineId !== machineId) {
        return res.status(403).json({
            valid: false,
            error: 'License is already activated on another machine'
        });
    }

    // Valid license
    res.json({
        valid: true,
        features: {
            maxPairs: 3,
            allowLive: true,
            supportExpires: Date.now() + (30 * 24 * 60 * 60 * 1000)
        }
    });
});

/**
 * Admin endpoint to manually create license
 */
app.post('/api/admin/create-license', (req, res) => {
    const { email, name, adminKey } = req.body;

    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const customer = {
        email,
        name,
        orderId: `MANUAL-${Date.now()}`,
        licenseKey: generateLicenseKey(),
        downloadUrl: generateDownloadUrl(email, generateLicenseKey())
    };

    licenses.set(customer.licenseKey, {
        email: customer.email,
        name: customer.name,
        orderId: customer.orderId,
        created: Date.now(),
        activated: false,
        manual: true
    });

    sendDeliveryEmail(customer).catch(console.error);

    res.json({
        success: true,
        licenseKey: customer.licenseKey,
        email: customer.email
    });
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        licenses: licenses.size,
        downloads: downloads.size,
        timestamp: new Date()
    });
});

/**
 * Start server
 */
app.listen(PORT, () => {
    console.log(`🚀 OGZ Prime Delivery System running on port ${PORT}`);
    console.log(`📧 Email configured: ${process.env.EMAIL_USER ? 'Yes' : 'No'}`);
    console.log(`💳 Stripe configured: ${process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No'}`);
    console.log(`🔗 Webhook endpoint: POST /webhook/stripe`);
    console.log(`📥 Download endpoint: GET /download/:token`);
    console.log(`🔐 License verification: POST /api/verify-license`);
});

module.exports = app;