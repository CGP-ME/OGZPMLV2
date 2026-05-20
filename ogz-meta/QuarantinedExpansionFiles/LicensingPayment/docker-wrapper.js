#!/usr/bin/env node
// DOCKER WRAPPER - Connects user's API keys to protected binary

const { spawn } = require('child_process');
const WebSocket = require('ws');
const axios = require('axios');

// USER'S API KEYS (from config file)
const config = require('./config/api-keys.json');

class TradingBridge {
    constructor() {
        this.apiKey = config.KRAKEN_API_KEY;
        this.apiSecret = config.KRAKEN_API_SECRET;
        this.ws = null;

        // Protected binary process
        this.coreProcess = null;
    }

    async start() {
        console.log('🔐 Starting protected trading core...');

        // Launch the binary with license
        this.coreProcess = spawn('./ogzprime-core', {
            env: {
                LICENSE_KEY: config.LICENSE_KEY,
                NODE_ENV: 'production'
            }
        });

        // Connect to Kraken with user's keys
        this.connectExchange();

        // Feed market data to binary
        this.startDataFeed();
    }

    connectExchange() {
        console.log('📡 Connecting to Kraken with your API keys...');

        // WebSocket connection using user's credentials
        this.ws = new WebSocket('wss://ws.kraken.com');

        this.ws.on('open', () => {
            // Subscribe to BTC/USD
            this.ws.send(JSON.stringify({
                event: 'subscribe',
                pair: ['BTC/USD'],
                subscription: { name: 'ticker' }
            }));
        });

        this.ws.on('message', (data) => {
            // Send market data to binary for processing
            this.coreProcess.stdin.write(data);
        });
    }

    async executeTrade(signal) {
        // Use customer's API keys to place trades
        const headers = {
            'API-Key': this.apiKey,
            'API-Sign': this.generateSignature(signal)
        };

        const response = await axios.post('https://api.kraken.com/0/private/AddOrder', {
            pair: 'BTCUSD',
            type: signal.type,
            ordertype: 'market',
            volume: config.POSITION_SIZE
        }, { headers });

        console.log('✅ Trade executed with your API keys');
    }

    generateSignature(data) {
        // Sign with user's secret
        const crypto = require('crypto');
        return crypto.createHmac('sha512', this.apiSecret)
            .update(JSON.stringify(data))
            .digest('base64');
    }

    startDataFeed() {
        // Binary outputs trading signals
        this.coreProcess.stdout.on('data', (data) => {
            const signal = JSON.parse(data.toString());

            if (signal.action === 'BUY' || signal.action === 'SELL') {
                console.log(`📊 Signal from core: ${signal.action}`);
                this.executeTrade(signal);
            }
        });
    }
}

// Start the bridge
const bridge = new TradingBridge();
bridge.start();