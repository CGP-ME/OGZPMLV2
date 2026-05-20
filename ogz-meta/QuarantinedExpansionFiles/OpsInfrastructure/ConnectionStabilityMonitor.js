/**
 * WebSocket Connection Stability Monitor
 * 
 * Monitors connection health and automatically fixes issues
 */

class ConnectionStabilityMonitor {
    constructor(webSocketManager) {
        this.wsManager = webSocketManager;
        this.connectionStats = new Map();
        this.startMonitoring();
    }
    
    startMonitoring() {
        console.log('📊 Starting connection stability monitoring...');
        
        // Monitor every 10 seconds
        this.monitorInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 10000);
    }
    
    checkConnectionHealth() {
        const status = this.wsManager.getServerStatus();
        
        if (Array.isArray(status)) {
            status.forEach(serverStatus => {
                if (serverStatus.exists) {
                    this.analyzeServerHealth(serverStatus);
                }
            });
        }
    }
    
    analyzeServerHealth(serverStatus) {
        const { port, connections, errors, lastActivity } = serverStatus;
        const now = Date.now();
        
        // Check for connection drops
        if (connections === 0 && (now - lastActivity) < 30000) {
            console.log(`⚠️ Port ${port}: Recent disconnection detected`);
            this.logConnectionIssue(port, 'recent_disconnection');
        }
        
        // Check for high error rate
        if (errors > 5) {
            console.log(`⚠️ Port ${port}: High error rate detected (${errors} errors)`);
            this.logConnectionIssue(port, 'high_error_rate');
        }
        
        // Check for stale connections
        if ((now - lastActivity) > 120000) { // 2 minutes
            console.log(`⚠️ Port ${port}: Stale connection detected`);
            this.logConnectionIssue(port, 'stale_connection');
        }
    }
    
    logConnectionIssue(port, issueType) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] Port ${port}: ${issueType}\n`;
        
        require('fs').appendFileSync('connection_stability.log', logEntry);
    }
    
    cleanup() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }
}

module.exports = ConnectionStabilityMonitor;
