#!/usr/bin/env node

const WebSocket = require('ws');

console.log('\n🧪 Testing WEBSOCKET_DASHBOARD\n');

// Try to connect
const ws = new WebSocket('ws://localhost:3010/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');

  // Try sending auth
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'test-connection'
  }));

  setTimeout(() => {
    console.log('✅ Connection stable');
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', (err) => {
  console.log('❌ WebSocket connection failed:', err.message);
  process.exit(1);
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

setTimeout(() => {
  console.log('❌ Connection timeout');
  process.exit(1);
}, 5000);