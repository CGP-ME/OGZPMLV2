#!/bin/bash
# CPU VPS Setup Script for OGZ Prime
# Run this on the new CPU-only VPS after cloning the repo

set -e

echo "🚀 OGZ Prime CPU VPS Setup"
echo "=========================="

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v)"

# 2. Check PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
fi
echo "✅ PM2 installed"

# 3. Install dependencies
echo "📦 Installing npm dependencies..."
npm install --production

# 4. Check required env vars
echo ""
echo "🔑 Checking required environment variables..."

if [ -z "$INCEPTION_API_KEY" ]; then
    echo "❌ INCEPTION_API_KEY not set"
    echo "   Add to .env: INCEPTION_API_KEY=sk_xxx"
    exit 1
fi
echo "✅ INCEPTION_API_KEY set"

if [ -z "$TAVILY_API_KEY" ]; then
    echo "⚠️  TAVILY_API_KEY not set (web search disabled)"
    echo "   Optional: Get free key at https://tavily.com"
fi

# 5. Set LLM provider
if [ -z "$LLM_PROVIDER" ]; then
    echo "ℹ️  Setting LLM_PROVIDER=mercury"
    echo "LLM_PROVIDER=mercury" >> .env
fi

# 6. Start services
echo ""
echo "🚀 Starting PM2 processes..."

# WebSocket/Dashboard server
pm2 delete ogz-websocket 2>/dev/null || true
INCEPTION_API_KEY=$INCEPTION_API_KEY pm2 start ogzprime-ssl-server.js --name ogz-websocket

# Trading bot (paper mode by default)
pm2 delete ogz-bot 2>/dev/null || true
INCEPTION_API_KEY=$INCEPTION_API_KEY pm2 start run-empire-v2.js --name ogz-bot

pm2 save

echo ""
echo "✅ OGZ Prime is running!"
echo "   Dashboard: http://localhost:3010"
echo "   Bot logs:  pm2 logs ogz-bot"
echo ""
echo "📊 Status:"
pm2 list
