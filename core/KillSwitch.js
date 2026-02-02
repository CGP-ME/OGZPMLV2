/**
 * @fileoverview KillSwitch - Emergency Trading Stop System
 *
 * Emergency stop mechanism that blocks ALL order execution instantly.
 * File-based flag ensures persistence across restarts and process crashes.
 *
 * @description
 * ARCHITECTURE ROLE:
 * KillSwitch is the ultimate safety mechanism. When activated, it blocks
 * every trade execution regardless of signals, patterns, or confidence.
 * It's the "big red button" for emergency situations.
 *
 * ACTIVATION TRIGGERS:
 * - Manual: Admin creates killswitch.flag file
 * - Automatic: RiskManager hits max drawdown
 * - Automatic: Circuit breaker reaches critical threshold
 * - Automatic: Exchange connection lost during open position
 *
 * FILE-BASED DESIGN:
 * Uses filesystem flag (killswitch.flag) rather than memory because:
 * - Persists across process crashes/restarts
 * - Can be activated externally (ssh, cron, monitoring)
 * - Multiple processes can check the same flag
 * - No database dependency during emergencies
 *
 * DEACTIVATION:
 * Requires manual intervention - delete the flag file.
 * This is intentional to force human review before resuming.
 *
 * @module core/KillSwitch
 * @requires fs
 *
 * @example
 * const KillSwitch = require('./core/KillSwitch');
 * const killSwitch = new KillSwitch();
 *
 * // Check before any trade
 * if (killSwitch.isKillSwitchOn()) {
 *   console.log('Kill switch active - trade blocked');
 *   return;
 * }
 *
 * // Activate in emergency
 * killSwitch.enableKillSwitch('Max drawdown reached');
 *
 * // Check status
 * console.log(`Kill switch: ${killSwitch.isKillSwitchOn() ? 'ON' : 'OFF'}`);
 */

const fs = require('fs');
const path = require('path');

const FLAG_PATH = path.join(__dirname, '../killswitch.flag');
const LOG_PATH = path.join(__dirname, '../logs');

class KillSwitch {
    constructor() {
        this.lastCheckTime = null;
        this.isActive = null; // Cache status

        // Ensure log directory exists
        if (!fs.existsSync(LOG_PATH)) {
            fs.mkdirSync(LOG_PATH, { recursive: true });
        }
    }

    /**
     * Check if kill switch is active
     * @returns {boolean} true if trading should be blocked
     */
    isKillSwitchOn() {
        // Cache check for 1 second to avoid filesystem hammering
        const now = Date.now();
        if (this.lastCheckTime && (now - this.lastCheckTime) < 1000) {
            return this.isActive;
        }

        this.lastCheckTime = now;
        this.isActive = fs.existsSync(FLAG_PATH);

        return this.isActive;
    }

    /**
     * Activate the kill switch - STOPS ALL TRADING
     * @param {string} reason - Why the kill switch was activated
     */
    enableKillSwitch(reason = 'Manual activation') {
        fs.writeFileSync(FLAG_PATH, JSON.stringify({
            activated: new Date().toISOString(),
            reason: reason,
            pid: process.pid
        }), 'utf8');

        // Log the activation
        const logEntry = `[${new Date().toISOString()}] KILL SWITCH ACTIVATED: ${reason}\n`;
        fs.appendFileSync(path.join(LOG_PATH, 'killswitch.log'), logEntry);

        console.log('🔴 KILL SWITCH ACTIVATED - ALL TRADING STOPPED');
        console.log(`   Reason: ${reason}`);

        this.isActive = true;
    }

    /**
     * Deactivate the kill switch - ALLOWS TRADING
     */
    disableKillSwitch() {
        if (fs.existsSync(FLAG_PATH)) {
            // Read the flag to log deactivation
            let flagData = {};
            try {
                flagData = JSON.parse(fs.readFileSync(FLAG_PATH, 'utf8'));
            } catch (e) {
                flagData = { activated: 'unknown' };
            }

            fs.unlinkSync(FLAG_PATH);

            // Log the deactivation
            const logEntry = `[${new Date().toISOString()}] KILL SWITCH DEACTIVATED (was active since ${flagData.activated})\n`;
            fs.appendFileSync(path.join(LOG_PATH, 'killswitch.log'), logEntry);

            console.log('🟢 KILL SWITCH DEACTIVATED - Trading enabled');
        } else {
            console.log('ℹ️  Kill switch was not active');
        }

        this.isActive = false;
    }

    /**
     * Get kill switch status with details
     */
    getStatus() {
        if (!fs.existsSync(FLAG_PATH)) {
            return {
                active: false,
                message: 'Kill switch is OFF - Trading enabled'
            };
        }

        try {
            const flagData = JSON.parse(fs.readFileSync(FLAG_PATH, 'utf8'));
            const duration = Date.now() - new Date(flagData.activated).getTime();
            const minutes = Math.floor(duration / 60000);

            return {
                active: true,
                activated: flagData.activated,
                reason: flagData.reason,
                duration: `${minutes} minutes`,
                message: `Kill switch is ON - Trading BLOCKED for ${minutes} minutes`
            };
        } catch (e) {
            return {
                active: true,
                message: 'Kill switch is ON - Trading BLOCKED'
            };
        }
    }

    /**
     * Check kill switch and throw if active
     * Use this in critical paths
     */
    throwIfActive() {
        if (this.isKillSwitchOn()) {
            const status = this.getStatus();
            const error = new Error(`KILL SWITCH ACTIVE: ${status.reason || 'Trading blocked'}`);
            error.code = 'KILL_SWITCH_ACTIVE';
            throw error;
        }
    }
}

// Singleton instance
const killSwitch = new KillSwitch();

// Export both the class and singleton instance
module.exports = killSwitch;
module.exports.KillSwitch = KillSwitch;