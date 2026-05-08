// CC-C: Webhook Order Adapter — side-channel emitter for TTP via SignalStack.
// Bot keeps Alpaca for market data; this adapter POSTs entry/exit signals
// to a SignalStack webhook which routes orders to TTP (Trader Evolution / IBKR).
// Fire-and-forget contract: callers MUST .catch() the returned Promise so a
// slow/failed webhook never stalls the trading loop.

const https = require('https');

class WebhookOrderAdapter {
    constructor(config = {}) {
        this.webhookUrl = config.webhookUrl || process.env.SIGNALSTACK_WEBHOOK_URL;
        this.enabled = config.enabled ?? (process.env.WEBHOOK_ORDERS_ENABLED === 'true');
        // Dry-run default-true unless explicitly disabled. Vendor payload
        // contract unverified at ship time; operator flips to false only
        // after eyeballing dry-run logs against SignalStack docs.
        this.dryRun = config.dryRun ?? (process.env.WEBHOOK_DRY_RUN !== 'false');
        this.timeout = config.timeout || 5000;
        this.orderLog = [];
        this.orderLogCap = config.orderLogCap || 500;
        this.lastOrderTime = 0;

        if (this.enabled && !this.webhookUrl) {
            console.error('[WebhookOrder] ENABLED but no SIGNALSTACK_WEBHOOK_URL set — disabling');
            this.enabled = false;
        }
    }

    async emit(signal) {
        if (!this.enabled) return { sent: false, reason: 'disabled' };
        // Validate up front. Fire-and-forget callers swallow the return value,
        // so a console.warn is the only way bad signals surface.
        if (!signal || !signal.action || !signal.symbol
            || !Number.isFinite(signal.quantity) || signal.quantity <= 0) {
            console.warn(`[WebhookOrder] invalid signal: ${JSON.stringify(signal)}`);
            return { sent: false, reason: 'invalid signal' };
        }

        const now = Date.now();
        const timeSinceLastOrder = now - this.lastOrderTime;
        if (timeSinceLastOrder < 30000) {
            console.warn(`[WebhookOrder] Throttled — ${Math.round((30000 - timeSinceLastOrder) / 1000)}s until next allowed`);
            return { sent: false, reason: 'throttled', waitMs: 30000 - timeSinceLastOrder };
        }

        const payload = {
            action: signal.action,
            ticker: signal.symbol,
            qty: signal.quantity,
            order_type: signal.orderType || 'market',
        };
        if (signal.limitPrice) payload.limit_price = signal.limitPrice;

        if (this.dryRun) {
            console.log(`[WebhookOrder] DRY RUN: ${JSON.stringify(payload)}`);
            this._log({ ...payload, dryRun: true, timestamp: now });
            return { sent: false, reason: 'dry_run', payload };
        }

        try {
            const response = await this._post(payload);
            this.lastOrderTime = now;
            this._log({ ...payload, response, timestamp: now });
            console.log(`[WebhookOrder] SENT: ${signal.action} ${signal.quantity} ${signal.symbol} → ${response.status}`);
            return { sent: true, response };
        } catch (error) {
            console.error(`[WebhookOrder] FAILED: ${error.message}`);
            this._log({ ...payload, error: error.message, timestamp: now });
            return { sent: false, reason: error.message };
        }
    }

    _log(entry) {
        this.orderLog.push(entry);
        if (this.orderLog.length > this.orderLogCap) this.orderLog.shift();
    }

    async _post(payload) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const url = new URL(this.webhookUrl);
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
                timeout: this.timeout,
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Webhook timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    getStats() {
        return {
            enabled: this.enabled,
            dryRun: this.dryRun,
            totalOrders: this.orderLog.length,
            lastOrderTime: this.lastOrderTime,
        };
    }
}

module.exports = WebhookOrderAdapter;
