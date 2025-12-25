#!/bin/bash
# OGZ Prime V2 - Deployment Package Creator
# Creates a ready-to-run package for users

echo "🚀 Creating OGZ Prime V2 Deployment Package..."

# Package name with timestamp
PACKAGE_NAME="ogzprime-v2-$(date +%Y%m%d-%H%M%S)"
PACKAGE_DIR="/tmp/$PACKAGE_NAME"

# Create package directory
mkdir -p $PACKAGE_DIR

echo "📦 Copying core files..."

# Copy essential files (exclude sensitive/large files)
rsync -av --progress \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='trai_brain/models' \
  --exclude='*.gguf' \
  --exclude='*.brain' \
  --exclude='credentials.json' \
  --exclude='profiles/trading/last_profile.json' \
  /opt/ogzprime/OGZPMLV2/ $PACKAGE_DIR/

echo "📝 Creating default configuration..."

# Create .env.template with user-configurable settings
cat > $PACKAGE_DIR/.env.template << 'EOF'
# ===================================
# OGZ PRIME V2 - USER CONFIGURATION
# ===================================

# BROKER SELECTION (kraken, binance, coinbase)
BROKER_ID=kraken

# API CREDENTIALS (Get from your exchange)
KRAKEN_API_KEY=YOUR_API_KEY_HERE
KRAKEN_API_SECRET=YOUR_API_SECRET_HERE

# TRADING MODE
LIVE_TRADING=false  # Set to true for REAL MONEY
CONFIRM_LIVE_TRADING=false  # Must also be true for live trading

# RISK PARAMETERS (Adjust to your comfort)
INITIAL_BALANCE=10000  # Starting balance
MAX_POSITION_SIZE=0.1  # Max 10% per trade
MAX_DRAWDOWN=0.15  # Stop at 15% loss
STOP_LOSS_PERCENT=0.02  # 2% stop loss
TAKE_PROFIT_PERCENT=0.03  # 3% take profit

# TRADING STYLE
TRADING_MODE=CONSERVATIVE  # CONSERVATIVE, SEMI_AGGRESSIVE, AGGRESSIVE
MIN_TRADE_CONFIDENCE=0.65  # Minimum 65% confidence to trade
TRADING_INTERVAL=15000  # Check every 15 seconds

# DASHBOARD
AUTH_TOKEN=ogz_$(openssl rand -hex 16)
DATA_WEBSOCKET_PORT=3010

# DATABASE
DB_PATH=./data/trades.db
EOF

echo "📜 Creating setup script..."

# Create setup script
cat > $PACKAGE_DIR/setup.sh << 'EOF'
#!/bin/bash
echo "🎯 OGZ Prime V2 - Setup Script"
echo "================================"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy .env template if not exists
if [ ! -f .env ]; then
    cp .env.template .env
    echo "✅ Created .env file - PLEASE CONFIGURE YOUR API KEYS!"
fi

# Create required directories
mkdir -p data
mkdir -p logs
mkdir -p profiles/trading

echo ""
echo "✅ Setup complete!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit .env and add your exchange API keys"
echo "2. Set your risk parameters in .env"
echo "3. Run: ./start.sh to launch the bot"
echo ""
EOF

echo "🚀 Creating start script..."

# Create start script
cat > $PACKAGE_DIR/start.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting OGZ Prime V2..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found! Run ./setup.sh first"
    exit 1
fi

# Check if API keys are configured
if grep -q "YOUR_API_KEY_HERE" .env; then
    echo "❌ API keys not configured! Edit .env first"
    exit 1
fi

# Start the bot
pm2 start ecosystem.config.js

# Show status
pm2 status

echo ""
echo "✅ Bot started!"
echo "📊 Dashboard: https://localhost:3010"
echo "📝 Logs: pm2 logs ogz-prime-v2"
echo "🛑 Stop: pm2 stop all"
echo ""
EOF

echo "🛑 Creating stop script..."

# Create stop script
cat > $PACKAGE_DIR/stop.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping OGZ Prime V2..."
pm2 stop all
pm2 kill
echo "✅ Bot stopped"
EOF

# Create ecosystem.config.js for PM2
cat > $PACKAGE_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'ogz-prime-v2',
      script: './run-empire-v2.js',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    },
    {
      name: 'ogz-websocket',
      script: './ogzprime-ssl-server.js',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/ws-error.log',
      out_file: './logs/ws-out.log',
      autorestart: true
    }
  ]
};
EOF

# Create README
cat > $PACKAGE_DIR/README.md << 'EOF'
# OGZ Prime V2 - Trading Bot

## Quick Start

1. **Setup**
   ```bash
   ./setup.sh
   ```

2. **Configure**
   Edit `.env` file:
   - Add your exchange API keys
   - Set risk parameters
   - Choose trading mode

3. **Start Trading**
   ```bash
   ./start.sh
   ```

4. **Monitor**
   - Dashboard: https://localhost:3010
   - Logs: `pm2 logs ogz-prime-v2`
   - Status: `pm2 status`

## Risk Settings

Edit `.env` to adjust:
- `MAX_POSITION_SIZE`: Maximum % per trade (default 10%)
- `STOP_LOSS_PERCENT`: Stop loss % (default 2%)
- `MIN_TRADE_CONFIDENCE`: Minimum confidence to trade (default 65%)
- `TRADING_MODE`: CONSERVATIVE, SEMI_AGGRESSIVE, or AGGRESSIVE

## Adding New Brokers

1. Create adapter in `brokers/YourBrokerAdapter.js`
2. Register in `brokers/BrokerFactory.js`
3. Set `BROKER_ID=yourbroker` in `.env`

## Safety

- Always start with `LIVE_TRADING=false` (paper mode)
- Test thoroughly before enabling live trading
- Monitor closely during first live trades

## Support

- Issues: https://github.com/CGP-ME/OGZPMLV2/issues
- Docs: https://ogzprime.com/docs
EOF

# Make scripts executable
chmod +x $PACKAGE_DIR/*.sh

# Create tarball
echo "📦 Creating archive..."
cd /tmp
tar -czf $PACKAGE_NAME.tar.gz $PACKAGE_NAME/

echo ""
echo "✅ Package created successfully!"
echo "📦 Location: /tmp/$PACKAGE_NAME.tar.gz"
echo "📏 Size: $(du -h /tmp/$PACKAGE_NAME.tar.gz | cut -f1)"
echo ""
echo "To deploy to users:"
echo "1. Upload $PACKAGE_NAME.tar.gz"
echo "2. User runs: tar -xzf $PACKAGE_NAME.tar.gz"
echo "3. User runs: cd $PACKAGE_NAME && ./setup.sh"
echo ""