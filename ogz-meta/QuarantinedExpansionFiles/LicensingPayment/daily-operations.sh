#!/bin/bash

# OGZ PRIME DAILY OPERATIONS SCRIPT
# Quick commands for daily trading operations

echo "═══════════════════════════════════════════════════════"
echo "           OGZ PRIME DAILY OPERATIONS"
echo "═══════════════════════════════════════════════════════"
echo ""

case "$1" in
  start)
    echo "🚀 Starting all services..."
    pm2 start ssl-advance
    pm2 start v13-stable
    pm2 start valhalla-bot
    pm2 start mover-ai
    echo "✅ All services started"
    ;;
    
  stop)
    echo "⏹️ Stopping all services..."
    pm2 stop all
    echo "✅ All services stopped"
    ;;
    
  status)
    echo "📊 System Status:"
    pm2 status
    echo ""
    echo "🔌 WebSocket Connections:"
    ss -tlnp | grep -E "3010|8080|443" | head -5
    echo ""
    echo "📈 Latest Prices:"
    tail -5 /root/.pm2/logs/ssl-advance-out.log | grep "BTC-USD"
    ;;
    
  logs)
    echo "📜 Viewing logs (Ctrl+C to exit)..."
    pm2 logs --lines 50
    ;;
    
  trades)
    echo "💰 Recent Trades:"
    grep -E "LONG OPENED|SHORT OPENED|POSITION CLOSED" /root/.pm2/logs/v13-stable-out.log | tail -10
    grep -E "LONG OPENED|SHORT OPENED|POSITION CLOSED" /root/.pm2/logs/valhalla-bot-out.log | tail -10
    ;;
    
  backup)
    DATE=$(date +%Y%m%d_%H%M%S)
    echo "💾 Creating backup..."
    tar -czf /root/ogz-backup-$DATE.tar.gz /root/OGZFV-valhalla --exclude=node_modules
    echo "✅ Backup saved to /root/ogz-backup-$DATE.tar.gz"
    ;;
    
  restart)
    echo "🔄 Restarting all services..."
    pm2 restart all
    echo "✅ All services restarted"
    ;;
    
  check)
    echo "🔍 Running system check..."
    node /root/final-system-check.js
    ;;
    
  prices)
    echo "📈 Live Price Monitor:"
    tail -f /root/.pm2/logs/ssl-advance-out.log | grep -E "BTC-USD|ETH-USD|SOL-USD"
    ;;
    
  performance)
    echo "📊 Performance Summary:"
    echo "V13 Stable Bot:"
    grep "Win Rate:" /root/.pm2/logs/v13-stable-out.log | tail -1
    echo ""
    echo "Valhalla Bot:"
    grep "Win Rate:" /root/.pm2/logs/valhalla-bot-out.log | tail -1
    ;;
    
  *)
    echo "Usage: $0 {start|stop|status|logs|trades|backup|restart|check|prices|performance}"
    echo ""
    echo "Commands:"
    echo "  start       - Start all trading services"
    echo "  stop        - Stop all trading services"
    echo "  status      - Show system status"
    echo "  logs        - View live logs"
    echo "  trades      - Show recent trades"
    echo "  backup      - Create system backup"
    echo "  restart     - Restart all services"
    echo "  check       - Run system health check"
    echo "  prices      - Monitor live prices"
    echo "  performance - Show bot performance"
    ;;
esac