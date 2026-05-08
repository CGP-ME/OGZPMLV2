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
        // Mercury fix #8 + re-attack #1: validate URL at construction AND
        // require https:// scheme. Otherwise a malformed URL only fails at
        // request time inside emit()'s try/catch, returning {sent:false} —
        // caller fires fire-and-forget so the misconfig is invisible to the
        // operator. Re-attack also surfaced: new URL() accepts http://, ftp://,
        // etc., but _post() hardcodes port:443 + https.request — wrong-scheme
        // URLs would silently fail every request. Validate once, fail loud,
        // disable the adapter so dry-run logs surface the problem.
        if (this.enabled && this.webhookUrl) {
            try {
                const url = new URL(this.webhookUrl);
                if (url.protocol !== 'https:') {
                    console.error(`[WebhookOrder] SIGNALSTACK_WEBHOOK_URL must use https:// (got ${url.protocol}) — disabling`);
                    this.enabled = false;
                }
            } catch (e) {
                console.error(`[WebhookOrder] INVALID SIGNALSTACK_WEBHOOK_URL (${this.webhookUrl}): ${e.message} — disabling`);
                this.enabled = false;
            }
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
        // Mercury fix (parallel): asymmetric throttle. Caller passes
        // signal.bypassThrottle=true on exits (SELL / COVER) so close-side
        // signals MUST go through to keep TTP in sync with bot state. Without
        // this, a scalper exit <30s after entry was silently dropped — bot
        // FLAT but TTP OPEN, real-money divergence. Entries still throttle.
        // (TTP's vendor-side rate limit is a separate concern handled at
        // their layer; we no longer add to the problem on ours.)
        // Mercury re-attack #5 (serial-caller assumption): no mutex around
        // lastOrderTime. OrderExecutor.executeTrade() awaits emit() inline,
        // so two emits cannot race in current architecture. If emits are
        // ever moved to parallel paths (e.g., per-symbol adapters), this
        // throttle becomes racy and needs a Promise-lock.
        if (!signal.bypassThrottle) {
            const timeSinceLastOrder = now - this.lastOrderTime;
            if (timeSinceLastOrder < 30000) {
                console.warn(`[WebhookOrder] Throttled — ${Math.round((30000 - timeSinceLastOrder) / 1000)}s until next allowed`);
                return { sent: false, reason: 'throttled', waitMs: 30000 - timeSinceLastOrder };
            }
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
            // Mercury fix #1: split sent/failed branches on HTTP status.
            // Previously emit() returned {sent:true} on ANY HTTP response
            // including 4xx/5xx — a vendor "401 unauthorized" or "429 rate
            // limited" was logged as SENT, audit trail lied to operator.
            const ok = response.status >= 200 && response.status < 300;
            if (ok) {
                // Mercury re-attack #3: only advance throttle clock on 2xx.
                // Previously this advanced on every attempt — a vendor 429
                // would burn our 30s window even though the vendor's clock
                // didn't actually start (request was rejected). Now: 2xx
                // success advances; non-2xx leaves the window untouched so
                // the next legitimate emit can fire immediately.
                this.lastOrderTime = now;
                this._log({ ...payload, response, timestamp: now });
                console.log(`[WebhookOrder] SENT: ${signal.action} ${signal.quantity} ${signal.symbol} → ${response.status}`);
                return { sent: true, response };
            } else {
                // Mercury #4 (intentional): 3xx redirects also land here as
                // REJECTED. Node's https.request does NOT auto-follow, so a
                // 3xx surfaces to us. SignalStack hooks should never redirect
                // (deprecated endpoint at most), so a 3xx is operator-visible
                // signal worth alerting on. Don't auto-follow.
                this._log({ ...payload, response, error: `non-2xx: ${response.status}`, timestamp: now });
                console.error(`[WebhookOrder] REJECTED: ${signal.action} ${signal.quantity} ${signal.symbol} → ${response.status} ${response.body}`);
                return { sent: false, reason: `http_${response.status}`, response };
            }
        } catch (error) {
            // Network error / timeout / DNS — we don't know if vendor received
            // the request. Conservatively advance lastOrderTime to avoid
            // duplicate-send risk if vendor did receive and we retry.
            this.lastOrderTime = now;
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
