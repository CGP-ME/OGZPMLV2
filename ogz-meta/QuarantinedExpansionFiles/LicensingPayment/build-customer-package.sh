#!/bin/bash

# ====================================
# CUSTOMER BOT PACKAGE BUILDER
# Creates containerized bot for delivery
# ====================================

CUSTOMER_EMAIL=$1
LICENSE_KEY=$(openssl rand -hex 16)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_DIR="customer-packages/${CUSTOMER_EMAIL}_${TIMESTAMP}"

echo "📦 BUILDING CUSTOMER PACKAGE"
echo "============================"
echo "Customer: $CUSTOMER_EMAIL"
echo "License: $LICENSE_KEY"

# Create package directory
mkdir -p $PACKAGE_DIR/{bot,dashboard,config}

# Copy bot files (excluding sensitive data)
cp run-trading-bot-v14FINAL.js $PACKAGE_DIR/bot/
cp -r core $PACKAGE_DIR/bot/
cp -r indicators $PACKAGE_DIR/bot/
cp -r profiles $PACKAGE_DIR/bot/

# Copy dashboard
cp public/dual-bot-dashboard.html $PACKAGE_DIR/dashboard/index.html

# Create Docker setup
cat > $PACKAGE_DIR/Dockerfile << 'DOCKER'
FROM node:18-alpine
WORKDIR /app

# Install dependencies
RUN apk add --no-cache git python3 make g++

# Copy bot files
COPY bot/ ./
COPY dashboard/ ./public/

# Install node modules
RUN npm init -y && npm install ws axios moment chart.js

# Expose ports
EXPOSE 3008 8001

# Start script
CMD ["node", "run-trading-bot-v14FINAL.js"]
DOCKER

# Create docker-compose
cat > $PACKAGE_DIR/docker-compose.yml << COMPOSE
version: '3.8'
services:
  ogzprime-bot:
    build: .
    container_name: ogzprime-${LICENSE_KEY:0:8}
    environment:
      - LICENSE_KEY=${LICENSE_KEY}
      - CUSTOMER_EMAIL=${CUSTOMER_EMAIL}
      - TRADING_MODE=live
    ports:
      - "3008:3008"
      - "8001:8001"
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - ogzprime-network

networks:
  ogzprime-network:
    driver: bridge
COMPOSE

# Create start script
cat > $PACKAGE_DIR/start.sh << 'START'
#!/bin/bash
echo "🚀 Starting OGZPrime Trading Bot..."
echo "Dashboard: http://localhost:3008"
docker-compose up -d
docker-compose logs -f
START
chmod +x $PACKAGE_DIR/start.sh

# Create README
cat > $PACKAGE_DIR/README.md << README
# OGZPrime Trading Bot - Premium Edition

## Quick Start
1. Run: ./start.sh
2. Open: http://localhost:3008
3. Your bot is now trading!

## Configuration
- Risk Settings: config/risk.json
- API Keys: config/keys.json
- Trading Pairs: config/pairs.json

## Support
- Discord: https://discord.gg/ogzprime
- Email: support@ogzprime.com

## License
Licensed to: $CUSTOMER_EMAIL
Key: $LICENSE_KEY

## OPTIMIZECEPTION™ Configuration
Your bot includes the latest OPTIMIZECEPTION discoveries:
- Risk/Reward: 1:96
- Stop Loss: 0.5%
- Take Profit: 48%
- Win Rate Target: 70%
README

# Package into tarball
cd customer-packages
tar -czf "${CUSTOMER_EMAIL}_${TIMESTAMP}.tar.gz" "${CUSTOMER_EMAIL}_${TIMESTAMP}"

echo ""
echo "✅ PACKAGE READY: customer-packages/${CUSTOMER_EMAIL}_${TIMESTAMP}.tar.gz"
echo "📊 Size: $(du -h ${CUSTOMER_EMAIL}_${TIMESTAMP}.tar.gz | cut -f1)"
echo "🔑 License: $LICENSE_KEY"
echo ""
echo "📧 Send to customer via Stripe download link"