// MobileMonitor.js - Easy remote monitoring for OGZ Prime
// Creates lightweight API for mobile access and push notifications

/**
 * Mobile Monitoring System for OGZ Prime
 * Provides REST API for mobile app access and push notifications
 */
class MobileMonitor {
  /**
   * Create a new Mobile Monitor with REST API and push notification capabilities
   * @param {Object} ogzPrime - Reference to OGZ Prime instance for data access
   * @param {Object} config - Configuration options for mobile monitoring
   */
  constructor(ogzPrime, config = {}) {
    // Validate required OGZ Prime instance
    if (!ogzPrime) {
      throw new Error('OGZ Prime instance required for MobileMonitor');
    }
    
    // Store reference to main trading bot instance
    this.ogzPrime = ogzPrime;
    
    // Default configuration with mobile-specific settings
    this.config = {
      // Server settings for REST API
      port: 4000,                    // Port for mobile API server
      enableSecurity: true,          // Enable API key protection
      apiKey: process.env.API_KEY || 'ogz_mobile_key', // API authentication key
      
      // Push notification settings
      enablePushNotifications: false, // Enable mobile push notifications
      pushProvider: 'firebase',      // Push service provider ('firebase' or 'custom')
      fcmCredentialsPath: '',        // Path to Firebase credentials file
      
      // Alert thresholds for mobile notifications
      notifyOnTrades: true,          // Send notifications for completed trades
      notifyOnDrawdown: true,        // Send notifications for drawdown alerts
      drawdownAlertThreshold: 5,     // Alert at 5% drawdown
      profitAlertThreshold: 100,     // Alert at $100 profit threshold
      
      // Activity tracking settings
      trackInactivity: true,         // Monitor system for trading inactivity
      inactivityWarningMinutes: 120, // Alert if no trades for 2 hours
      
      // Daily summary notification settings
      sendDailySummary: true,        // Send end-of-day trading summary
      dailySummaryTime: '22:00',     // 10 PM in 24h format for daily summary
      
      // Voice alerts for critical notifications
      enableVoiceAlerts: false,      // Enable text-to-speech alerts
      voiceAlertLevel: 'critical',   // Voice alert threshold ('all', 'important', 'critical')
      
      // Merged with user config overrides
      ...config
    };
    
    // Data cached for mobile app API responses
    this.dataCache = {
      status: {
        lastUpdated: 0,              // Timestamp of last status update
        data: null                   // Cached status data
      },
      trades: {
        lastUpdated: 0,              // Timestamp of last trades update
        data: []                     // Cached recent trades array
      },
      alerts: {
        lastUpdated: 0,              // Timestamp of last alerts update
        data: []                     // Cached alerts array
      },
      performance: {
        lastUpdated: 0,              // Timestamp of last performance update
        data: null                   // Cached performance analytics
      }
    };
    
    // Alert history storage for mobile notifications
    this.alerts = [];
    
    // Set of connected mobile devices for push notifications
    this.devices = new Set();
    
    // Initialize system components
    this.server = null;              // Express.js server instance
    this.pushService = null;         // Firebase messaging service
    this.activityTimer = null;       // Inactivity monitoring timer
  }
  
  /**
   * Start the mobile monitor with API server and notification services
   * Initializes REST API, push notifications, activity tracking, and data refresh
   * @returns {boolean} Success status of monitor startup
   */
  start() {
    try {
      // Setup REST API server for mobile app communication
      this.setupApiServer();
      
      // Setup push notification system if enabled in config
      if (this.config.enablePushNotifications) {
        this.setupPushNotifications();
      }
      
      // Setup activity monitoring for inactivity alerts
      if (this.config.trackInactivity) {
        this.setupActivityTracking();
      }
      
      // Setup daily summary timer for end-of-day reports
      if (this.config.sendDailySummary) {
        this.setupDailySummary();
      }
      
      // Initial data cache population
      this.updateDataCache();
      
      // Start periodic data refresh timer (30-second intervals)
      this.refreshTimer = setInterval(() => {
        this.updateDataCache();
      }, 30000);
      
      console.log(`📱 Mobile monitor started on port ${this.config.port}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to start mobile monitor: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Set up Express.js REST API server with authentication and endpoints
   * Creates API routes for status, trades, alerts, performance, and commands
   */
  setupApiServer() {
    // Use Express.js for RESTful API implementation
    const express = require('express');
    const cors = require('cors');
    const app = express();
    
    // Middleware setup for JSON parsing and CORS
    app.use(cors());
    app.use(express.json());
    
    // API key authentication middleware for secure access
    const authenticateApiKey = (req, res, next) => {
      // Skip authentication if security is disabled
      if (!this.config.enableSecurity) {
        return next();
      }
      
      // Extract API key from request headers
      const apiKey = req.headers['x-api-key'];
      
      // Validate API key against configured value
      if (!apiKey || apiKey !== this.config.apiKey) {
        return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
      }
      
      next(); // Proceed to route handler
    };
    
    // API Routes with authentication middleware
    
    // GET /api/status - Current trading bot status
    app.get('/api/status', authenticateApiKey, (req, res) => {
      res.json(this.getStatusData());
    });
    
    // GET /api/trades - Recent trading history with optional limit
    app.get('/api/trades', authenticateApiKey, (req, res) => {
      // Get optional limit parameter (default 10 trades)
      const limit = parseInt(req.query.limit) || 10;
      res.json(this.getRecentTrades(limit));
    });
    
    // GET /api/alerts - Recent system alerts with optional limit
    app.get('/api/alerts', authenticateApiKey, (req, res) => {
      // Get optional limit parameter (default 10 alerts)
      const limit = parseInt(req.query.limit) || 10;
      res.json(this.getRecentAlerts(limit));
    });
    
    // GET /api/performance - Performance analytics data
    app.get('/api/performance', authenticateApiKey, (req, res) => {
      res.json(this.getPerformanceData());
    });
    
    // POST /api/register-device - Register mobile device for push notifications
    app.post('/api/register-device', authenticateApiKey, (req, res) => {
      const { deviceId, platform, notificationToken } = req.body;
      
      // Validate required device ID
      if (!deviceId) {
        return res.status(400).json({ error: 'Device ID required' });
      }
      
      // Register device with notification system
      this.registerDevice(deviceId, platform, notificationToken);
      res.json({ success: true, message: 'Device registered' });
    });
    
    // POST /api/command - Execute trading bot commands remotely
    app.post('/api/command', authenticateApiKey, (req, res) => {
      const { command, params } = req.body;
      
      // Validate required command parameter
      if (!command) {
        return res.status(400).json({ error: 'Command required' });
      }
      
      // Execute command and return result
      const result = this.executeCommand(command, params);
      res.json(result);
    });
    
    // Start Express server on configured port
    this.server = app.listen(this.config.port, () => {
      console.log(`📡 Mobile API server running on port ${this.config.port}`);
    });
  }
  
  /**
   * Set up push notification service using Firebase Cloud Messaging
   * Initializes Firebase Admin SDK for sending push notifications to mobile devices
   */
  setupPushNotifications() {
    if (this.config.pushProvider === 'firebase') {
      try {
        const admin = require('firebase-admin');
        
        // Initialize Firebase with credentials file or environment variables
        if (this.config.fcmCredentialsPath) {
          const serviceAccount = require(this.config.fcmCredentialsPath);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } else {
          // Use environment variables if credentials file not specified
          admin.initializeApp();
        }
        
        // Store messaging service reference for sending notifications
        this.pushService = admin.messaging();
        console.log('🔔 Firebase push notifications initialized');
      } catch (error) {
        console.error(`❌ Failed to initialize Firebase: ${error.message}`);
        this.config.enablePushNotifications = false;
      }
    } else {
      // Custom push service implementation placeholder
      console.log('🔔 Custom push service not implemented');
      this.config.enablePushNotifications = false;
    }
  }
  
  /**
   * Set up activity tracking timer for inactivity monitoring
   * Checks for trading inactivity every 10 minutes and sends alerts if needed
   */
  setupActivityTracking() {
    // Check for inactivity every 10 minutes
    this.activityTimer = setInterval(() => {
      this.checkActivityStatus();
    }, 10 * 60 * 1000);
  }
  
  /**
   * Set up daily summary notification timer
   * Checks hourly if it's time to send the daily trading summary
   */
  setupDailySummary() {
    // Check every hour if it's time for the daily summary
    setInterval(() => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // If current time matches the summary time (with 5-minute window)
      if (timeStr >= this.config.dailySummaryTime && 
          timeStr <= this.incrementTimeByMinutes(this.config.dailySummaryTime, 5)) {
        this.sendDailySummary();
      }
    }, 60 * 60 * 1000); // Check every hour
  }
  
  /**
   * Increment time string by specified minutes for summary window calculation
   * @param {string} timeStr - Time string in HH:MM format
   * @param {number} minutes - Minutes to add to the time
   * @returns {string} New time string in HH:MM format
   */
  incrementTimeByMinutes(timeStr, minutes) {
    // Parse hours and minutes from time string
    const [hours, mins] = timeStr.split(':').map(Number);
    let totalMinutes = hours * 60 + mins + minutes;
    
    // Calculate new hours and minutes with 24-hour wraparound
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;
    
    // Format and return new time string
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }
  
  /**
   * Update cached data for mobile app API responses
   * Refreshes status, trades, and performance data with current timestamps
   */
  updateDataCache() {
    // Update status cache with current system status
    this.dataCache.status = {
      lastUpdated: Date.now(),
      data: this.getStatusData()
    };
    
    // Update trades cache with recent trading history
    this.dataCache.trades = {
      lastUpdated: Date.now(),
      data: this.getRecentTrades(10)
    };
    
    // Update performance cache if performance analyzer is available
    if (this.ogzPrime.performanceAnalyzer) {
      this.dataCache.performance = {
        lastUpdated: Date.now(),
        data: this.getPerformanceData()
      };
    }
  }
  
  /**
   * Get current system status data for mobile app display
   * Combines trading, risk, and system information into comprehensive status
   * @returns {Object} Complete system status data
   */
  getStatusData() {
    const tradingBrain = this.ogzPrime.tradingBrain;
    const riskManager = this.ogzPrime.riskManager;
    
    return {
      timestamp: Date.now(),                     // Current timestamp
      running: this.ogzPrime.isRunning,         // System operational status
      
      // Account information
      balance: tradingBrain.balance,             // Current account balance
      initialBalance: this.ogzPrime.config.initialBalance, // Starting balance
      pnlToday: riskManager ? riskManager.state.dailyStats.pnl : 0, // Today's P&L
      
      // Position information
      inPosition: tradingBrain.isInPosition(),   // Whether currently holding position
      position: tradingBrain.position,          // Current position details
      currentPrice: this.ogzPrime.timeframeData[this.ogzPrime.config.primaryTimeframe]?.candles?.slice(-1)[0]?.close || 0, // Latest price
      
      // Risk management information
      drawdown: riskManager ? riskManager.state.currentDrawdown : 0, // Current drawdown percentage
      inRecoveryMode: riskManager ? riskManager.state.inRecoveryMode : false, // Recovery mode status
      tradingEnabled: riskManager ? riskManager.state.tradingEnabled : true, // Trading enabled flag
      
      // System information
      uptime: Date.now() - this.ogzPrime.status.startTime, // System uptime in milliseconds
      assetName: this.ogzPrime.config.assetName,   // Trading asset name
      profileName: this.ogzPrime.config.profileName, // Active trading profile
      mode: this.ogzPrime.simulationInterval ? 'simulation' : 'live' // Trading mode
    };
  }
  
  /**
   * Get recent trades data formatted for mobile app consumption
   * @param {number} limit - Maximum number of trades to return
   * @returns {Array} Array of recent trade objects with essential information
   */
  getRecentTrades(limit = 10) {
    // Return empty array if no trade history available
    if (!this.ogzPrime.tradingBrain.tradeHistory) {
      return [];
    }
    
    // Extract and format recent trades with mobile-relevant fields
    const trades = this.ogzPrime.tradingBrain.tradeHistory
      .slice(-limit) // Get last N trades
      .map(trade => ({
        entryTime: trade.entryTime,              // Trade entry timestamp
        exitTime: trade.exitTime,               // Trade exit timestamp
        entryPrice: trade.entryPrice,           // Entry price level
        exitPrice: trade.exitPrice,             // Exit price level
        direction: trade.direction,             // Trade direction (buy/sell)
        pnl: trade.pnl,                        // Profit/loss amount
        reason: trade.exitReason,              // Exit reason description
        quality: trade.quality?.qualityScore || null // Trade quality score if available
      }));
    
    return trades.reverse(); // Return most recent first for mobile display
  }
  
  /**
   * Get recent system alerts formatted for mobile app display
   * @param {number} limit - Maximum number of alerts to return
   * @returns {Array} Array of recent alert objects
   */
  getRecentAlerts(limit = 10) {
    return this.alerts.slice(-limit).reverse(); // Most recent first
  }
  
  /**
   * Get performance analytics data for mobile app charts and insights
   * @returns {Object} Performance data with summary, recommendations, and patterns
   */
  getPerformanceData() {
    // Return unavailable message if performance analyzer not enabled
    if (!this.ogzPrime.performanceAnalyzer) {
      return {
        available: false,
        message: 'Performance analyzer not enabled'
      };
    }
    
    // Return comprehensive performance data
    return {
      available: true,
      summary: this.ogzPrime.performanceAnalyzer.getPerformanceSummary(), // Overall performance metrics
      recommendations: this.ogzPrime.performanceAnalyzer.state.recommendations.slice(0, 3), // Top 3 recommendations
      topPatterns: this.ogzPrime.performanceAnalyzer.getTopPatterns(3) // Top 3 performing patterns
    };
  }
  
  /**
   * Register a mobile device for push notifications
   * @param {string} deviceId - Unique device identifier
   * @param {string} platform - Device platform (ios/android)
   * @param {string} notificationToken - Push notification token from device
   * @returns {boolean} Success status of device registration
   */
  registerDevice(deviceId, platform, notificationToken) {
    // Validate required device ID
    if (!deviceId) return false;
    
    // Add device to registered devices set
    this.devices.add({
      id: deviceId,                        // Unique device identifier
      platform: platform || 'unknown',    // Device platform
      token: notificationToken,            // Push notification token
      registered: new Date()               // Registration timestamp
    });
    
    console.log(`📱 Device registered: ${deviceId} (${platform})`);
    return true;
  }
  
  /**
   * Execute a command from mobile app for remote control
   * @param {string} command - Command to execute (status, buy, sell, kill, pause, resume)
   * @param {Object} params - Command parameters (currently unused)
   * @returns {Object} Command execution result with success status and message
   */
  executeCommand(command, params = {}) {
    console.log(`📱 Received command: ${command}`);
    
    // Handle different remote commands
    switch (command) {
      case 'status':
        // Return current system status
        return {
          success: true,
          data: this.getStatusData()
        };
      
      case 'buy':
        // Execute manual buy order
        if (!this.ogzPrime.isRunning) {
          return {
            success: false,
            message: 'System not running'
          };
        }
        
        const buyResult = this.ogzPrime.executeManualBuy();
        return {
          success: !!buyResult,
          message: buyResult ? 'Buy order executed' : 'Failed to execute buy order'
        };
      
      case 'sell':
        // Execute manual sell order
        if (!this.ogzPrime.isRunning) {
          return {
            success: false,
            message: 'System not running'
          };
        }
        
        const sellResult = this.ogzPrime.executeManualSell();
        return {
          success: !!sellResult,
          message: sellResult ? 'Sell order executed' : 'Failed to execute sell order'
        };
      
      case 'kill':
        // Initiate system shutdown with delay
        setTimeout(() => {
          this.ogzPrime.shutdown();
        }, 1000);
        
        return {
          success: true,
          message: 'Shutdown initiated'
        };
      
      case 'pause':
        // Pause trading system
        if (!this.ogzPrime.isRunning) {
          return {
            success: false,
            message: 'System already paused'
          };
        }
        
        this.ogzPrime.isRunning = false;
        return {
          success: true,
          message: 'System paused'
        };
      
      case 'resume':
        // Resume trading system
        if (this.ogzPrime.isRunning) {
          return {
            success: false,
            message: 'System already running'
          };
        }
        
        this.ogzPrime.isRunning = true;
        return {
          success: true,
          message: 'System resumed'
        };
        
      default:
        // Unknown command error
        return {
          success: false,
          message: `Unknown command: ${command}`
        };
    }
  }
  
  /**
   * Handle a new trade completion for mobile notifications
   * Creates alerts and notifications based on trade results and significance
   * @param {Object} trade - Completed trade data with P&L and entry/exit info
   */
  handleNewTrade(trade) {
    // Skip if no trade data provided
    if (!trade) return;
    
    // Extract trade data for notification
    const tradeData = {
      pnl: trade.pnl,                      // Profit/loss amount
      profitable: trade.pnl > 0,          // Whether trade was profitable
      direction: trade.direction,          // Trade direction
      entryPrice: trade.entryPrice,       // Entry price
      exitPrice: trade.exitPrice          // Exit price
    };
    
    // Create notification if trade notifications are enabled
    if (this.config.notifyOnTrades) {
      // Always alert on significant profit/loss (>$100)
      const isSignificant = Math.abs(trade.pnl) > 100;
      
      // Determine notification priority based on trade result
      let priority = 'normal';
      if (isSignificant) {
        priority = trade.pnl > 0 ? 'high' : 'medium'; // High for profit, medium for loss
      }
      
      // Create and send alert
      this.createAlert(
        trade.pnl > 0 ? 'Profitable Trade' : 'Losing Trade',
        `${trade.direction.toUpperCase()} closed with ${trade.pnl > 0 ? 'profit' : 'loss'} of $${Math.abs(trade.pnl).toFixed(2)}`,
        priority,
        'trade',
        tradeData
      );
    }
  }
  
  /**
   * Check system activity status and alert on prolonged inactivity
   * Monitors time since last trade and sends alerts if inactive too long
   */
  checkActivityStatus() {
    // Skip check if system not running
    if (!this.ogzPrime.isRunning) return;
    
    // Get trade history for activity analysis
    const trades = this.ogzPrime.tradingBrain.tradeHistory;
    if (!trades || trades.length === 0) return;
    
    // Calculate time since last trade
    const lastTrade = trades[trades.length - 1];
    const timeSinceLastTrade = Date.now() - new Date(lastTrade.exitTime).getTime();
    const inactiveMinutes = timeSinceLastTrade / (60 * 1000);
    
    // Alert if inactive for longer than threshold
    if (inactiveMinutes > this.config.inactivityWarningMinutes) {
      this.createAlert(
        'System Inactivity',
        `No trades for ${Math.floor(inactiveMinutes)} minutes`,
        'medium',
        'system',
        { inactiveMinutes }
      );
    }
  }
  
  /**
   * Send daily trading summary notification with key metrics
   * Compiles daily statistics and sends comprehensive summary alert
   */
  sendDailySummary() {
    // Get daily stats from risk manager
    const riskManager = this.ogzPrime.riskManager;
    if (!riskManager) return;
    
    // Extract daily statistics and current balance
    const stats = riskManager.state.dailyStats;
    const balance = this.ogzPrime.tradingBrain.balance;
    
    // Calculate win rate percentage
    const winRate = stats.trades > 0 ? (stats.wins / stats.trades * 100).toFixed(1) : '0.0';
    
    // Create formatted summary message
    const summaryMessage = 
      `📊 Daily Summary\n` +
      `Trades: ${stats.trades} | Win Rate: ${winRate}%\n` +
      `PnL: $${stats.pnl.toFixed(2)}\n` +
      `Balance: $${balance.toFixed(2)}`;
    
    // Create high-priority summary alert
    this.createAlert(
      'Daily Summary',
      summaryMessage,
      'high',
      'summary',
      { stats, balance }
    );
  }
  
  /**
   * Create and send an alert with push notifications and voice alerts
   * @param {string} title - Alert title for notification
   * @param {string} message - Alert message content
   * @param {string} priority - Alert priority (low, normal, high)
   * @param {string} type - Alert type (trade, system, risk, summary)
   * @param {Object} data - Additional alert data for mobile app
   */
  createAlert(title, message, priority = 'normal', type = 'system', data = {}) {
    // Create alert object with unique ID and timestamp
    const alert = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), // Unique alert ID
      timestamp: new Date(),               // Alert creation time
      title,                              // Alert title
      message,                           // Alert message
      priority,                          // Priority level
      type,                             // Alert type category
      data,                             // Additional data payload
      read: false                       // Read status for mobile app
    };
    
    // Add alert to history and maintain limit of 100 alerts
    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts.shift(); // Remove oldest alert
    }
    
    // Log alert to console with priority indicator
    console.log(`🔔 [${priority.toUpperCase()}] ${title}: ${message}`);
    
    // Send push notification if enabled and service available
    if (this.config.enablePushNotifications && this.pushService) {
      this.sendPushNotification(alert);
    }
    
    // Trigger voice alert if enabled and meets criteria
    if (this.config.enableVoiceAlerts) {
      this.triggerVoiceAlert(alert);
    }
    
    return alert;
  }
  
  /**
   * Send push notification to registered mobile devices
   * @param {Object} alert - Alert data to send as push notification
   */
  sendPushNotification(alert) {
    // Skip if push service not available
    if (!this.pushService || !this.config.enablePushNotifications) return;
    
    // Get notification tokens from registered devices
    const deviceTokens = Array.from(this.devices)
      .filter(device => device.token)      // Only devices with valid tokens
      .map(device => device.token);
    
    // Skip if no devices registered for notifications
    if (deviceTokens.length === 0) return;
    
    // Create notification payload
    const notification = {
      title: alert.title,                  // Notification title
      body: alert.message                  // Notification body text
    };
    
    // Add data payload for mobile app handling
    const data = {
      alertId: alert.id,                   // Alert unique identifier
      alertType: alert.type,               // Alert type for app routing
      alertPriority: alert.priority,       // Priority for app display
      timestamp: alert.timestamp.toISOString() // ISO timestamp
    };
    
    // Send notification to all registered devices
    this.pushService.sendMulticast({
      tokens: deviceTokens,                // Array of device tokens
      notification,                        // Notification content
      data                                // Additional data payload
    })
    .then(response => {
      console.log(`📱 Push notification sent to ${response.successCount} devices`);
    })
    .catch(error => {
      console.error('❌ Push notification error:', error);
    });
  }
  
  /**
   * Trigger voice alert for critical notifications
   * @param {Object} alert - Alert data to potentially voice announce
   */
  triggerVoiceAlert(alert) {
    // Skip if voice alerts disabled
    if (!this.config.enableVoiceAlerts) return;
    
    // Check if alert meets voice alert threshold criteria
    if (this.config.voiceAlertLevel === 'critical' && alert.priority !== 'high') return;
    if (this.config.voiceAlertLevel === 'important' && alert.priority === 'low') return;
    
    // Emit voice alert event to frontend via WebSocket
    this.ogzPrime.webSocketManager.broadcast(this.ogzPrime.config.guiWebSocketPort, {
      type: 'voice_alert',
      text: `${alert.title}. ${alert.message}`, // Text for text-to-speech
      priority: alert.priority                   // Priority for voice processing
    });
  }
  
  /**
   * Stop the mobile monitor and clean up resources
   * Closes server, clears timers, and performs graceful shutdown
   */
  stop() {
    // Stop Express.js server
    if (this.server) {
      this.server.close();
    }
    
    // Clear data refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    // Clear activity monitoring timer
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
    }
    
    console.log('📱 Mobile monitor stopped');
  }
}

module.exports = MobileMonitor;