PaymentProcessor.js
// 📱 FILE 2: mobile/MobileAppAPI.js
// Your pocket command center - trade from ANYWHERE!

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');

class MobileAppAPI {
  constructor(ogzPrime, config = {}) {
    this.ogzPrime = ogzPrime;
    this.config = {
      port: 5000,
      unifiedWebSocketUrl: 'ws://localhost:3010/ws', // Use unified WebSocket instead of separate server
      secretKey: process.env.MOBILE_SECRET || 'ogz-mobile-valhalla-key',
      corsOrigin: '*',
      maxRequestsPerMinute: 60,
      enablePushNotifications: true,
      enableVoiceCommands: true,
      ...config
    };
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.connectToUnifiedWebSocket(); // Connect to unified WebSocket instead of creating server
    
    // Connected mobile clients
    this.mobileClients = new Map();
    
    console.log('📱 Mobile App API initialized - Trade from ANYWHERE!');
  }
  
  /**
   * Set up Express middleware
   */
  setupMiddleware() {
    // Enable CORS
    this.app.use(cors({
      origin: this.config.corsOrigin,
      credentials: true
    }));
    
    // Parse JSON
    this.app.use(express.json());
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: this.config.maxRequestsPerMinute
    });
    this.app.use('/api/', limiter);
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📱 ${req.method} ${req.path}`);
      next();
    });
  }
  
  /**
   * Set up all API routes
   */
  setupRoutes() {
    // Authentication
    this.app.post('/api/auth/login', this.handleLogin.bind(this));
    this.app.post('/api/auth/logout', this.authenticate.bind(this), this.handleLogout.bind(this));
    
    // Dashboard data
    this.app.get('/api/dashboard', this.authenticate.bind(this), this.getDashboard.bind(this));
    this.app.get('/api/status', this.authenticate.bind(this), this.getStatus.bind(this));
    this.app.get('/api/trades', this.authenticate.bind(this), this.getTrades.bind(this));
    this.app.get('/api/performance', this.authenticate.bind(this), this.getPerformance.bind(this));
    
    // Trading controls
    this.app.post('/api/trade/buy', this.authenticate.bind(this), this.executeBuy.bind(this));
    this.app.post('/api/trade/sell', this.authenticate.bind(this), this.executeSell.bind(this));
    this.app.post('/api/trade/emergency-close', this.authenticate.bind(this), this.emergencyClose.bind(this));
    
    // System controls
    this.app.post('/api/system/pause', this.authenticate.bind(this), this.pauseSystem.bind(this));
    this.app.post('/api/system/resume', this.authenticate.bind(this), this.resumeSystem.bind(this));
    this.app.post('/api/system/shutdown', this.authenticate.bind(this), this.shutdownSystem.bind(this));
    
    // Settings
    this.app.get('/api/settings', this.authenticate.bind(this), this.getSettings.bind(this));
    this.app.put('/api/settings', this.authenticate.bind(this), this.updateSettings.bind(this));
    
    // Notifications
    this.app.post('/api/notifications/register', this.authenticate.bind(this), this.registerDevice.bind(this));
    this.app.get('/api/notifications/test', this.authenticate.bind(this), this.testNotification.bind(this));
    
    // Voice commands
    if (this.config.enableVoiceCommands) {
      this.app.post('/api/voice/command', this.authenticate.bind(this), this.handleVoiceCommand.bind(this));
    }
  }
  
  /**
   * Connect to unified WebSocket server (port 3010) instead of creating separate server
   */
  connectToUnifiedWebSocket() {
    console.log('📱 Mobile API connecting to unified WebSocket on port 3010...');
    
    this.unifiedWs = new WebSocket(this.config.unifiedWebSocketUrl);
    
    this.unifiedWs.on('open', () => {
      console.log('📱 Mobile API connected to unified WebSocket');
      
      // Identify as mobile API client
      this.unifiedWs.send(JSON.stringify({
        type: 'identify',
        source: 'mobile_api',
        capabilities: ['mobile_commands', 'push_notifications']
      }));
    });
    
    this.unifiedWs.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Forward relevant messages to mobile clients
        if (this.shouldForwardToMobile(message)) {
          this.broadcastToMobileClients(message);
        }
      } catch (err) {
        console.error('📱 Error processing unified WebSocket message:', err);
      }
    });
    
    this.unifiedWs.on('close', () => {
      console.log('📱 Mobile API disconnected from unified WebSocket, reconnecting...');
      setTimeout(() => this.connectToUnifiedWebSocket(), 5000);
    });
    
    this.unifiedWs.on('error', (err) => {
      console.error('📱 Mobile API WebSocket error:', err);
    });
  }
  
  /**
   * Authentication middleware
   */
  authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
      const decoded = jwt.verify(token, this.config.secretKey);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  
  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.config.secretKey);
    } catch {
      return null;
    }
  }
  
  // API HANDLERS
  
  handleLogin(req, res) {
    const { password, deviceId } = req.body;
    
    // Simple password check (enhance for production)
    if (password !== process.env.MOBILE_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { deviceId, timestamp: Date.now() },
      this.config.secretKey,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      wsUrl: this.config.unifiedWebSocketUrl, // Use unified WebSocket URL
      features: {
        pushNotifications: this.config.enablePushNotifications,
        voiceCommands: this.config.enableVoiceCommands
      }
    });
  }
  
  handleLogout(req, res) {
    // Could blacklist token here
    res.json({ success: true });
  }
  
  getDashboard(req, res) {
    res.json(this.getDashboardData());
  }
  
  getDashboardData() {
    const brain = this.ogzPrime.tradingBrain;
    const risk = this.ogzPrime.riskManager;
    
    return {
      balance: brain.balance,
      initialBalance: this.ogzPrime.config.initialBalance,
      totalPnL: brain.balance - this.ogzPrime.config.initialBalance,
      
      position: brain.position ? {
        direction: brain.position.direction,
        entryPrice: brain.position.entryPrice,
        currentPnL: brain.calculatePnL(this.getCurrentPrice()),
        holdTime: Date.now() - brain.position.entryTime
      } : null,
      
      todayStats: {
        trades: this.ogzPrime.status.dailyStats.trades,
        pnl: this.ogzPrime.status.dailyStats.totalPnL,
        winRate: this.ogzPrime.status.dailyStats.trades > 0 ?
          (this.ogzPrime.status.dailyStats.wins / this.ogzPrime.status.dailyStats.trades * 100) : 0
      },
      
      risk: risk ? {
        currentDrawdown: risk.state.currentDrawdown,
        maxDrawdown: risk.state.maxDrawdown,
        tradingEnabled: risk.state.tradingEnabled,
        inRecoveryMode: risk.state.inRecoveryMode
      } : null,
      
      system: {
        running: this.ogzPrime.isRunning,
        uptime: Date.now() - this.ogzPrime.status.startTime,
        mode: this.ogzPrime.simulationInterval ? 'simulation' : 'live',
        profile: this.ogzPrime.config.profileName,
        asset: this.ogzPrime.config.assetName
      }
    };
  }
  
  getStatus(req, res) {
    res.json({
      running: this.ogzPrime.isRunning,
      connected: true,
      lastUpdate: Date.now()
    });
  }
  
  getTrades(req, res) {
    const limit = parseInt(req.query.limit) || 20;
    const trades = this.ogzPrime.tradingBrain.tradeHistory.slice(-limit).reverse();
    
    res.json({
      trades: trades.map(t => ({
        id: t.id || `trade-${t.entryTime}`,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        direction: t.direction,
        pnl: t.pnl,
        holdTimeMin: t.holdTimeMs / 60000,
        exitReason: t.exitReason
      })),
      total: this.ogzPrime.tradingBrain.tradeHistory.length
    });
  }
  
  getPerformance(req, res) {
    const analyzer = this.ogzPrime.performanceAnalyzer;
    
    if (!analyzer) {
      return res.json({ available: false });
    }
    
    res.json({
      available: true,
      summary: analyzer.getPerformanceSummary(),
      recommendations: analyzer.state.recommendations,
      topPatterns: analyzer.getTopPatterns(5)
    });
  }
  
  async executeBuy(req, res) {
    if (!this.ogzPrime.isRunning) {
      return res.status(400).json({ error: 'System not running' });
    }
    
    if (this.ogzPrime.tradingBrain.isInPosition()) {
      return res.status(400).json({ error: 'Already in position' });
    }
    
    this.ogzPrime.executeManualBuy();
    
    // Wait a bit for execution
    setTimeout(() => {
      res.json({
        success: true,
        position: this.ogzPrime.tradingBrain.position
      });
    }, 500);
  }
  
  async executeSell(req, res) {
    if (!this.ogzPrime.isRunning) {
      return res.status(400).json({ error: 'System not running' });
    }
    
    if (!this.ogzPrime.tradingBrain.isInPosition()) {
      return res.status(400).json({ error: 'No position to close' });
    }
    
    this.ogzPrime.executeManualSell();
    
    // Wait a bit for execution
    setTimeout(() => {
      res.json({
        success: true,
        balance: this.ogzPrime.tradingBrain.balance
      });
    }, 500);
  }
  
  emergencyClose(req, res) {
    const reason = req.body.reason || 'Mobile emergency close';
    
    if (this.ogzPrime.tradingBrain.isInPosition()) {
      this.ogzPrime.emergencyClosePosition(reason);
      res.json({ success: true, message: 'Position closed' });
    } else {
      res.json({ success: false, message: 'No position to close' });
    }
  }
  
  pauseSystem(req, res) {
    this.ogzPrime.pauseTrading('Mobile command');
    res.json({ success: true, status: 'paused' });
  }
  
  resumeSystem(req, res) {
    this.ogzPrime.resumeTrading();
    res.json({ success: true, status: 'running' });
  }
  
  shutdownSystem(req, res) {
    res.json({ success: true, message: 'Shutdown initiated' });
    
    // Delay shutdown slightly
    setTimeout(() => {
      this.ogzPrime.shutdown();
    }, 1000);
  }
  
  getSettings(req, res) {
    res.json({
      profile: this.ogzPrime.config.profileName,
      asset: this.ogzPrime.config.assetName,
      riskSettings: {
        baseRiskPercent: this.ogzPrime.riskManager?.config.baseRiskPercent,
        maxDrawdownPercent: this.ogzPrime.riskManager?.config.maxDrawdownPercent
      },
      notifications: {
        enabled: true,
        onTrades: true,
        onDrawdown: true
      }
    });
  }
  
  updateSettings(req, res) {
    // Implement settings updates
    res.json({ success: true, message: 'Settings updated' });
  }
  
  registerDevice(req, res) {
    const { token, platform } = req.body;
    // Store device token for push notifications
    res.json({ success: true });
  }
  
  testNotification(req, res) {
    // Send test push notification
    this.sendPushNotification(req.user.deviceId, {
      title: 'OGZ Prime Test',
      body: 'Notifications are working! 🚀'
    });
    res.json({ success: true });
  }
  
  handleVoiceCommand(req, res) {
    const { command, transcript } = req.body;
    
    // Simple voice command parsing
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('buy')) {
      return this.executeBuy(req, res);
    } else if (lowerTranscript.includes('sell')) {
      return this.executeSell(req, res);
    } else if (lowerTranscript.includes('status')) {
      return this.getStatus(req, res);
    } else if (lowerTranscript.includes('balance')) {
      res.json({
        command: 'balance',
        response: `Your balance is $${this.ogzPrime.tradingBrain.balance.toFixed(2)}`
      });
    } else {
      res.json({
        command: 'unknown',
        response: 'Command not recognized'
      });
    }
  }
  
  /**
   * Handle WebSocket commands
   */
  handleWebSocketCommand(clientId, command) {
    const client = this.mobileClients.get(clientId);
    if (!client) return;
    
    switch (command.type) {
      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'subscribe':
        // Client wants real-time updates
        client.subscribed = true;
        break;
      case 'unsubscribe':
        client.subscribed = false;
        break;
    }
  }
  
  /**
   * Send update to mobile client
   */
  sendMobileUpdate(clientId, data) {
    const client = this.mobileClients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }
  
  /**
   * Broadcast to all mobile clients
   */
  broadcastToMobile(data) {
    this.mobileClients.forEach((client, id) => {
      if (client.subscribed) {
        this.sendMobileUpdate(id, data);
      }
    });
  }
  
  /**
   * Send push notification
   */
  sendPushNotification(deviceId, notification) {
    // Implement with your push service
    console.log(`📱 Push notification to ${deviceId}:`, notification);
  }
  
  /**
   * Get current price
   */
  getCurrentPrice() {
    const candles = this.ogzPrime.timeframeData[this.ogzPrime.config.primaryTimeframe]?.candles;
    return candles && candles.length > 0 ? candles[candles.length - 1].close : 0;
  }
  
  /**
   * Start the mobile API server
   */
  start() {
    this.server = this.app.listen(this.config.port, () => {
      console.log(`📱 Mobile API running on port ${this.config.port}`);
      console.log(`🔌 Mobile WebSocket on port ${this.config.wsPort}`);
    });
    
    // Hook into OGZ Prime events
    this.setupSystemHooks();
  }
  
  /**
   * Hook into system events for real-time updates
   */
  setupSystemHooks() {
    // Override broadcast methods to include mobile
    const originalBroadcast = this.ogzPrime.broadcastAnalysis.bind(this.ogzPrime);
    this.ogzPrime.broadcastAnalysis = (analysis) => {
      originalBroadcast(analysis);
      
      // Send to mobile clients
      this.broadcastToMobile({
        type: 'analysis',
        data: {
          price: analysis.price,
          trend: analysis.trend,
          confidence: analysis.confidence,
          decision: analysis.decision
        }
      });
    };
    
    // Hook trade updates
    const originalBroadcastTrade = this.ogzPrime.broadcastTradeUpdate.bind(this.ogzPrime);
    this.ogzPrime.broadcastTradeUpdate = (trade) => {
      originalBroadcastTrade(trade);
      
      // Send to mobile clients
      this.broadcastToMobile({
        type: 'trade',
        data: trade
      });
      
      // Send push notification for trades
      if (this.config.enablePushNotifications) {
        this.mobileClients.forEach((client) => {
          this.sendPushNotification(client.user.deviceId, {
            title: trade.action === 'buy' ? '🟢 Position Opened' : '🔴 Position Closed',
            body: trade.pnl ? `P&L: $${trade.pnl.toFixed(2)}` : `Entry @ $${trade.price.toFixed(2)}`
          });
        });
      }
    };
  }
  
  /**
   * Stop the mobile API
   */
  stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.unifiedWs) {
      this.unifiedWs.close();
    }
    console.log('📱 Mobile API stopped');
  }
  
  /**
   * Check if message should be forwarded to mobile clients
   */
  shouldForwardToMobile(message) {
    const forwardTypes = [
      'trade_executed',
      'position_update', 
      'balance_update',
      'system_status',
      'risk_alert',
      'pattern_detected'
    ];
    return forwardTypes.includes(message.type);
  }
  
  /**
   * Broadcast message to all connected mobile clients
   */
  broadcastToMobileClients(message) {
    this.mobileClients.forEach((client, clientId) => {
      if (client.subscribed && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'unified_update',
          data: message
        }));
      }
    });
  }
  
  /**
   * Send command to unified WebSocket server
   */
  sendToUnifiedWebSocket(command) {
    if (this.unifiedWs && this.unifiedWs.readyState === WebSocket.OPEN) {
      this.unifiedWs.send(JSON.stringify({
        type: 'mobile_command',
        source: 'mobile_api',
        data: command
      }));
    }
  }
}

module.exports = MobileAppAPI;