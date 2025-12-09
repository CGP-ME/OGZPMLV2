#!/usr/bin/env node

/**
 * KILL SWITCH CLI
 * Command-line tool to control the emergency trading stop
 *
 * Usage:
 *   node tools/kill-switch.js on [reason]   - Activate kill switch
 *   node tools/kill-switch.js off           - Deactivate kill switch
 *   node tools/kill-switch.js status        - Check current status
 */

const killSwitch = require('../core/KillSwitch');

const command = process.argv[2];
const reason = process.argv.slice(3).join(' ') || 'Manual CLI activation';

console.log('');
console.log('🔴 OGZPrime Kill Switch Control 🔴');
console.log('━'.repeat(40));

switch (command) {
    case 'on':
    case 'enable':
    case 'activate':
        killSwitch.enableKillSwitch(reason);
        console.log('');
        console.log('⚠️  ALL TRADING HAS BEEN STOPPED');
        console.log('');
        console.log('To re-enable trading, run:');
        console.log('  node tools/kill-switch.js off');
        break;

    case 'off':
    case 'disable':
    case 'deactivate':
        killSwitch.disableKillSwitch();
        console.log('');
        console.log('✅ Trading can now resume');
        console.log('');
        console.log('⚠️  Remember: The bot will start trading immediately');
        console.log('   if market conditions trigger signals!');
        break;

    case 'status':
    case 'check':
        const status = killSwitch.getStatus();
        console.log('');
        if (status.active) {
            console.log('🔴 KILL SWITCH IS ACTIVE');
            console.log(`   Reason: ${status.reason}`);
            console.log(`   Active for: ${status.duration}`);
            console.log(`   Since: ${status.activated}`);
            console.log('');
            console.log('   ⛔ NO TRADES WILL BE EXECUTED');
        } else {
            console.log('🟢 Kill switch is OFF');
            console.log('   ✓ Trading is enabled');
            console.log('   ⚠️  Bot can execute trades');
        }
        break;

    default:
        console.log('Usage:');
        console.log('  node tools/kill-switch.js on [reason]  - Stop all trading');
        console.log('  node tools/kill-switch.js off          - Resume trading');
        console.log('  node tools/kill-switch.js status       - Check status');
        console.log('');
        console.log('Examples:');
        console.log('  node tools/kill-switch.js on "Testing new feature"');
        console.log('  node tools/kill-switch.js on "Market crash detected"');
        console.log('  node tools/kill-switch.js off');
        process.exit(1);
}

console.log('━'.repeat(40));
console.log('');