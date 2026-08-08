/**
 * @fileoverview TelegramNotifier - Mobile Trading Alerts via Telegram
 *
 * Sends real-time trading alerts directly to your phone via Telegram Bot API.
 * Fire-and-forget async notifications with rate limiting.
 *
 * @description
 * ARCHITECTURE ROLE:
 * TelegramNotifier provides mobile push notifications for trading events.
 * Unlike Discord (rich embeds), Telegram is optimized for quick, text-based
 * alerts that work well on mobile.
 *
 * RATE LIMITING:
 * Built-in 5-second minimum interval between messages to avoid Telegram
 * API limits and notification spam.
 *
 * SETUP:
 * 1. Message @BotFather on Telegram to create a bot
 * 2. Get your bot token and add to .env as TELEGRAM_BOT_TOKEN
 * 3. Get your chat ID (message @userinfobot) and add as TELEGRAM_CHAT_ID
 *
 * ENVIRONMENT VARIABLES:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 * - TELEGRAM_CHAT_ID: Your Telegram user/group chat ID
 *
 * @module utils/telegramNotifier
 * @requires https
 * @requires dotenv
 * @author Trey (OGZPrime Technologies)
 * @version 1.0
 *
 * @example
 * const { notifyTradeClose } = require('./utils/telegramNotifier');
 *
 * // Fire-and-forget trade notification
 * notifyTradeClose({
 *   pnl: 1.50,
 *   entryPrice: 100000,
 *   exitPrice: 101000,
 *   duration: '5m'
 * }).catch(err => console.warn('Telegram failed:', err.message));
 */

require('dotenv').config();
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

class TelegramNotifier {
  constructor() {
    this.isEnabled = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
    this.lastMessageTime = 0;
    this.minInterval = 5000; // Minimum 5 seconds between messages to avoid spam

    if (this.isEnabled) {
      console.log('📱 Telegram Notifier initialized');
    } else {
      console.log('⚠️ Telegram Notifier disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    }
  }

  /**
   * Send message to Telegram
   * @param {string} message - Message text (supports Markdown)
   * @param {boolean} silent - Send without notification sound
   * @returns {Promise<boolean>} Success status
   */
  async sendMessage(message, silent = false) {
    if (!this.isEnabled) return false;

    // Rate limiting
    const now = Date.now();
    if (now - this.lastMessageTime < this.minInterval) {
      console.log('📱 Telegram: Rate limited, skipping message');
      return false;
    }
    this.lastMessageTime = now;

    return new Promise((resolve) => {
      const data = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_notification: silent
      });

      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('📱 Telegram message sent');
            resolve(true);
          } else {
            console.error(`📱 Telegram error: ${res.statusCode} - ${body}`);
            resolve(false);
          }
        });
      });

      req.on('error', (err) => {
        console.error(`📱 Telegram request error: ${err.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        console.error('📱 Telegram request timeout');
        resolve(false);
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Send trade execution alert
   * @param {Object} trade - Trade data
   */
  async notifyTrade(trade) {
    if (!this.isEnabled) return;

    const direction = typeof trade.direction === 'string' ? trade.direction.trim().toLowerCase() : '';
    const action = typeof trade.action === 'string' && trade.action.trim()
      ? trade.action.trim().toUpperCase()
      : (direction === 'long' ? 'BUY' : (direction === 'short' ? 'SELL_SHORT' : 'UNKNOWN'));
    const asset = typeof trade.asset === 'string' && trade.asset.trim() ? trade.asset.trim() : 'UNKNOWN';
    const message = `[TRADE] *${action} ${asset}*
Entry: $${trade.price?.toLocaleString()}
Size: ${(trade.size * 100).toFixed(2)}%
Confidence: ${(trade.confidence * 100).toFixed(1)}%
Time: ${new Date().toLocaleTimeString()}`;

    await this.sendMessage(message);
  }

  /**
   * Send trade closed alert with P&L
   * @param {Object} trade - Closed trade data
   */
  async notifyTradeClose(trade) {
    if (!this.isEnabled) return;

    const emoji = trade.pnl >= 0 ? '✅' : '❌';
    const pnlSign = trade.pnl >= 0 ? '+' : '';

    const message = `${emoji} *Trade Closed*
💰 P&L: ${pnlSign}$${trade.pnl?.toFixed(2)}
📊 Entry: $${trade.entryPrice?.toLocaleString()}
📈 Exit: $${trade.exitPrice?.toLocaleString()}
⏱️ Duration: ${trade.duration || 'N/A'}`;

    await this.sendMessage(message);
  }

  /**
   * Send daily summary
   * @param {Object} stats - Daily statistics
   */
  async notifyDailySummary(stats) {
    if (!this.isEnabled) return;

    const winRate = stats.totalTrades > 0
      ? ((stats.wins / stats.totalTrades) * 100).toFixed(1)
      : 0;
    const pnlEmoji = stats.totalPnL >= 0 ? '🟢' : '🔴';
    const pnlSign = stats.totalPnL >= 0 ? '+' : '';

    const message = `📊 *Daily Summary*
${pnlEmoji} Total P&L: ${pnlSign}$${stats.totalPnL?.toFixed(2)}
📈 Trades: ${stats.totalTrades}
✅ Wins: ${stats.wins} | ❌ Losses: ${stats.losses}
🎯 Win Rate: ${winRate}%
💼 Balance: $${stats.balance?.toLocaleString()}`;

    await this.sendMessage(message);
  }

  /**
   * Send system alert (errors, warnings)
   * @param {string} level - Alert level (info, warning, error)
   * @param {string} message - Alert message
   */
  async notifyAlert(level, alertMessage) {
    if (!this.isEnabled) return;

    const emojis = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨'
    };

    const message = `${emojis[level] || 'ℹ️'} *${level.toUpperCase()}*
${alertMessage}
⏰ ${new Date().toLocaleTimeString()}`;

    await this.sendMessage(message, level === 'info');
  }

  /**
   * Send milestone achievement
   * @param {string} milestone - Milestone description
   * @param {number} value - Achievement value
   */
  async notifyMilestone(milestone, value) {
    if (!this.isEnabled) return;

    const message = `🏆 *MILESTONE ACHIEVED!*
${milestone}
💎 Value: $${value?.toLocaleString()}
🎉 Keep building that Houston fund!`;

    await this.sendMessage(message);
  }

  /**
   * Check if notifier is enabled
   * @returns {boolean}
   */
  isConfigured() {
    return this.isEnabled;
  }
}

// Singleton instance
const telegramNotifier = new TelegramNotifier();

module.exports = {
  TelegramNotifier,
  telegramNotifier,
  notifyTrade: (trade) => telegramNotifier.notifyTrade(trade),
  notifyTradeClose: (trade) => telegramNotifier.notifyTradeClose(trade),
  notifyDailySummary: (stats) => telegramNotifier.notifyDailySummary(stats),
  notifyAlert: (level, message) => telegramNotifier.notifyAlert(level, message),
  notifyMilestone: (milestone, value) => telegramNotifier.notifyMilestone(milestone, value)
};
