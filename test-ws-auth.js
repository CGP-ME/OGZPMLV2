#!/usr/bin/env node

const WebSocket = require('ws');
require('dotenv').config();

console.log('\n🔍 Testing WebSocket Authentication Flow\n');

const token = process.env.WEBSOCKET_AUTH_TOKEN;
console.log(`Token from .env: ${token ? '✅ Found' : '❌ NOT FOUND'}`);
console.log(`Token value: ${token?.substring(0, 10)}...`);

const ws = new WebSocket('ws://localhost:3010/ws');

ws.on('open', () => {
  console.log('\n✅ Connected to WebSocket');

  // Send auth exactly like the bot does
  const authMsg = {
    type: 'auth',
    token: token || 'CHANGE_ME_IN_PRODUCTION'
  };

  console.log('📤 Sending auth:', JSON.stringify(authMsg, null, 2));
  ws.send(JSON.stringify(authMsg));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('\n📨 Received:', JSON.stringify(msg, null, 2));

  if (msg.type === 'auth_success') {
    console.log('\n🎉 AUTH SUCCESS! Now sending identify...');

    // Send identify like the bot
    ws.send(JSON.stringify({
      type: 'identify',
      source: 'trading_bot',
      bot: 'ogzprime-v14-refactored',
      version: 'V14-REFACTORED-MERGED',
      capabilities: ['trading', 'realtime', 'risk-management']
    }));

    // Send a test price update after 1 second
    setTimeout(() => {
      console.log('\n📤 Sending test price update...');
      ws.send(JSON.stringify({
        type: 'price_update',
        symbol: 'BTC/USD',
        price: 87654.32,
        timestamp: Date.now()
      }));
    }, 1000);

    // Close after 3 seconds
    setTimeout(() => {
      console.log('\n👋 Closing connection...');
      ws.close();
      process.exit(0);
    }, 3000);
  }

  if (msg.type === 'error') {
    console.log('\n❌ ERROR:', msg.message);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.log('\n❌ WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n⚠️ Connection closed');
});

setTimeout(() => {
  console.log('\n⏰ Timeout - no response');
  process.exit(1);
}, 10000);