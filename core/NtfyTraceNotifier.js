'use strict';

const http = require('http');
const https = require('https');

function resolveNtfyEndpoint(topic) {
  const rawTopic = typeof topic === 'string' ? topic.trim() : '';
  if (!rawTopic) return null;
  if (/^https?:\/\//i.test(rawTopic)) return rawTopic;
  return `https://ntfy.sh/${encodeURIComponent(rawTopic)}`;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unknown';
  const sign = numeric < 0 ? '-' : '';
  return `${sign}$${Math.abs(numeric).toFixed(2)}`;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unknown';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function traceSymbol(payload) {
  return payload?.symbol || payload?.fields?.symbol || 'UNKNOWN';
}

function tracePositionEffect(payload) {
  return payload?.positionEffect || payload?.fields?.positionEffect || 'unknown_effect';
}

function isClosedFill(payload) {
  const fields = payload?.fields || {};
  if (fields.closed === true) return true;
  const remaining = firstFiniteNumber(fields.remainingOrderQuantity, fields.remainingQuantity, fields.remainingSize);
  if (remaining !== null) return remaining <= 0;
  return tracePositionEffect(payload).startsWith('close_');
}

function normalPriorityPositionNotification(payload) {
  const fields = payload?.fields || {};
  if (payload?.event !== 'STATE_MUTATION' || fields.success !== true) return null;

  const symbol = traceSymbol(payload);
  const effect = tracePositionEffect(payload);

  if (fields.operation === 'openPosition' && effect.startsWith('open_')) {
    const size = firstFiniteNumber(fields.sizeUsd, fields.filledSizeUsd, fields.orderQuantity, fields.positionSize);
    const price = firstFiniteNumber(fields.price, fields.fillPrice, fields.entryPrice);
    return {
      priority: 'default',
      title: 'OGZ position opened',
      message: `${symbol} ${effect} size=${formatNumber(size)} price=${formatMoney(price)}`,
    };
  }

  if (fields.operation === 'applyFill' && effect.startsWith('close_') && isClosedFill(payload)) {
    const pnl = firstFiniteNumber(fields.pnlDollars, fields.pnl, fields.netRealizedResult, fields.netPnl);
    const reason = fields.exitReason || fields.reason || 'unknown';
    return {
      priority: 'default',
      title: 'OGZ position closed',
      message: `${symbol} ${effect} pnl=${formatMoney(pnl)} reason=${reason}`,
    };
  }

  return null;
}

function highPriorityNotification(payload) {
  const event = String(payload?.event || '');
  const fields = payload?.fields || {};
  if (event === 'ORDER_BLOCKED' || event === 'ORDER_EXCEPTION' || event.includes('ERROR')) {
    const reason = fields.reason || fields.error || 'unknown';
    return {
      priority: 'high',
      title: `OGZ ${event}`,
      message: `${traceSymbol(payload)} ${tracePositionEffect(payload)} reason=${reason}`,
    };
  }
  return null;
}

function maxPriorityNotification(payload) {
  const event = String(payload?.event || '');
  const fields = payload?.fields || {};
  if (
    event.includes('ALARM')
    || event.includes('HALT')
    || event.includes('KILL')
    || event.includes('DESYNC')
    || event.includes('RECONCILIATION')
    || fields.manualReconciliationRequired === true
  ) {
    const reason = fields.reason || fields.error || 'unknown';
    return {
      priority: 'max',
      title: `OGZ ${event}`,
      message: `${traceSymbol(payload)} ${tracePositionEffect(payload)} reason=${reason}`,
    };
  }
  return null;
}

function notificationForTrace(payload) {
  return maxPriorityNotification(payload)
    || normalPriorityPositionNotification(payload)
    || highPriorityNotification(payload);
}

function publishWithNodeHttp(endpoint, notification) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch (_err) {
      reject(new Error('invalid ntfy endpoint'));
      return;
    }

    const body = notification.message;
    const bodyBuffer = Buffer.from(body, 'utf8');
    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': bodyBuffer.length,
        Title: notification.title,
        Priority: notification.priority,
      },
    }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`ntfy status ${res.statusCode}`));
          return;
        }
        resolve();
      });
    });

    req.setTimeout(5000, () => {
      req.destroy(new Error('ntfy request timeout'));
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

class NtfyTraceNotifier {
  constructor({ endpoint, logger = console, requestImpl = publishWithNodeHttp }) {
    this.endpoint = endpoint;
    this.logger = logger;
    this.requestImpl = requestImpl;
  }

  handleTraceEvent(payload) {
    const notification = notificationForTrace(payload);
    if (!notification) return false;

    Promise.resolve()
      .then(() => this.requestImpl(this.endpoint, notification))
      .catch((err) => {
        try {
          this.logger.error(`[NTFY] trace push failed: ${err.message}`);
        } catch (_logErr) {
          // Observability must not throw back into trading.
        }
      });

    return true;
  }
}

function createNtfyTraceNotifier({ env = process.env, logger = console, requestImpl } = {}) {
  const endpoint = resolveNtfyEndpoint(env.NTFY_TOPIC);
  if (!endpoint) return null;
  return new NtfyTraceNotifier({
    endpoint,
    logger,
    requestImpl: requestImpl || publishWithNodeHttp,
  });
}

module.exports = {
  NtfyTraceNotifier,
  createNtfyTraceNotifier,
  notificationForTrace,
  resolveNtfyEndpoint,
};
