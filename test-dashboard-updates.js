#!/usr/bin/env node

console.log('\n🧪 Testing WEBSOCKET_DASHBOARD updates\n');

// Mock minimal environment
process.env.PAPER_TRADING = 'true';
process.env.WEBSOCKET_AUTH_TOKEN = '39ccfbc54660e6075f07730285badebbc40d805748c8eeb7d7f2e32d15ae1c62';
process.env.MIN_TRADE_CONFIDENCE = '0.95';

const WebSocket = require('ws');

// Connect to dashboard server
const ws = new WebSocket('ws://localhost:3010/ws');

let updateCount = 0;

ws.on('open', () => {
  console.log('✅ Connected to dashboard server');

  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: process.env.WEBSOCKET_AUTH_TOKEN
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'auth_success') {
    console.log('✅ Authenticated successfully');

    // Subscribe to listen for price updates
    console.log('⏳ Waiting for price updates from bot...');
  }

  // Count price updates
  if (msg.type === 'price' || msg.type === 'state_update') {
    updateCount++;
    console.log(`📊 Received update #${updateCount}: ${msg.type}`);
    if (msg.data?.price) {
      console.log(`   Price: $${msg.data.price}`);
    }
    if (msg.state?.balance) {
      console.log(`   Balance: $${msg.state.balance}`);
    }
  }
});

ws.on('error', (err) => {
  console.log('❌ WebSocket error:', err.message);
  process.exit(1);
});

// Run bot for 10 seconds to see if updates arrive
setTimeout(() => {
  console.log(`\n📈 Results after 10 seconds:`);
  if (updateCount > 0) {
    console.log(`✅ WEBSOCKET_DASHBOARD is WORKING - received ${updateCount} updates`);
  } else {
    console.log(`❌ WEBSOCKET_DASHBOARD is NOT WORKING - no updates received`);
  }
  ws.close();
  process.exit(updateCount > 0 ? 0 : 1);
}, 10000);

console.log('\nNOTE: Start the bot in another terminal with:');
console.log('  node run-empire-v2.js');
console.log('\nThis test will listen for 10 seconds...\n');