// 📁 FILE: core/CustomAlertsPanel.js

/**
 * CustomAlertsPanel - Real-time alert system for trading bot notifications
 * Manages prioritized alerts with sound, visual indicators, and UI broadcasting
 */
class CustomAlertsPanel {
  /**
   * Initialize alerts panel with priority system and storage
   * Sets up alert types, icons, colors, and sound associations
   */
  constructor() {
    // Array to store all active alerts (newest first)
    this.alerts = [];
    
    // Maximum number of alerts to keep in memory
    this.maxAlerts = 50;
    
    // Alert priority definitions with visual and audio properties
    this.priorities = {
      info: { icon: 'ℹ️', color: '#17a2b8', sound: null },           // Informational messages
      warning: { icon: '⚠️', color: '#ffc107', sound: 'warning.mp3' }, // Risk warnings
      critical: { icon: '🚨', color: '#dc3545', sound: 'alert.mp3' },  // Critical failures
      victory: { icon: '🎉', color: '#28a745', sound: 'victory.mp3' }, // Successful trades
      roast: { icon: '🔥', color: '#ff6b6b', sound: 'roast.mp3' }      // Performance roasts
    };
  }
  
  /**
   * Create new alert with specified priority and options
   * Manages alert storage, UI broadcasting, and audio notifications
   * @param {string} message - Alert message content
   * @param {string} type - Alert priority level (info, warning, critical, victory, roast)
   * @param {Object} options - Additional alert configuration
   * @returns {Object} Created alert object with unique ID
   */
  createAlert(message, type = 'info', options = {}) {
    // Create alert object with unique identifier and metadata
    const alert = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2), // Unique ID generation
      message,                                    // Alert message text
      type,                                      // Priority level for styling
      timestamp: new Date(),                     // Creation timestamp
      read: false,                              // User read status
      persistent: options.persistent || false,  // Whether alert stays visible
      actions: options.actions || [],          // Available user actions
      metadata: options.metadata || {}         // Additional data storage
    };
    
    // Add to front of alerts array (newest first)
    this.alerts.unshift(alert);
    
    // Limit total alerts to prevent memory bloat
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }
    
    // Send alert to UI immediately
    this.broadcastAlert(alert);
    
    // Play audio notification if sound configured and not silenced
    if (this.priorities[type].sound && !options.silent) {
      this.playSound(this.priorities[type].sound);
    }
    
    return alert;
  }
  
  /**
   * Broadcast alert to UI via WebSocket connection
   * Sends alert with visual styling information to connected clients
   * @param {Object} alert - Alert object to broadcast
   */
  broadcastAlert(alert) {
    // Check if WebSocket manager is available for broadcasting
    if (window.OGZP?.webSocketManager) {
      // Send alert with styling information to GUI port
      window.OGZP.webSocketManager.broadcast(3002, {
        type: 'alert',
        alert: {
          ...alert,                                    // Include all alert data
          icon: this.priorities[alert.type].icon,     // Add priority icon
          color: this.priorities[alert.type].color    // Add priority color
        }
      });
    }
  }
  
  /**
   * Generate HTML for complete alerts panel
   * Creates structured HTML with header, unread count, and alert list
   * @returns {string} Complete HTML for alerts panel
   */
  renderPanel() {
    return `
      <div class="alerts-panel">
        <div class="alerts-header">
          <h3>System Alerts</h3>
          <span class="unread-count">${this.getUnreadCount()}</span>
        </div>
        <div class="alerts-list">
          ${this.alerts.map(alert => this.renderAlert(alert)).join('')}
        </div>
      </div>
    `;
  }
  
  /**
   * Generate HTML for individual alert item
   * Creates alert element with icon, content, timestamp, and actions
   * @param {Object} alert - Alert object to render
   * @returns {string} HTML for single alert item
   */
  renderAlert(alert) {
    // Get priority styling information for this alert type
    const priority = this.priorities[alert.type];
    
    return `
      <div class="alert-item ${alert.read ? 'read' : 'unread'}" data-id="${alert.id}">
        <span class="alert-icon">${priority.icon}</span>
        <div class="alert-content">
          <div class="alert-message">${alert.message}</div>
          <div class="alert-time">${this.formatTime(alert.timestamp)}</div>
        </div>
        ${alert.actions.length > 0 ? this.renderActions(alert.actions) : ''}
      </div>
    `;
  }
}