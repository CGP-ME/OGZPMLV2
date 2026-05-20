/**
 * EmergencyRecoveryManager - Handles critical system failures with automatic recovery
 * Provides retry logic, state preservation, and graceful restart capabilities
 */
class EmergencyRecoveryManager {
    /**
     * Initialize emergency recovery manager with bot instance reference
     * @param {Object} bot - Main trading bot instance to manage
     */
    constructor(bot) {
        // Reference to main bot instance for recovery operations
        this.bot = bot;
        
        // Flag to prevent multiple simultaneous recovery attempts
        this.isRecovering = false;
        
        // Maximum number of recovery attempts before giving up
        this.maxRecoveryAttempts = 3;
        
        // Current recovery attempt counter
        this.recoveryAttempts = 0;
    }

    /**
     * Handle critical errors with automated recovery procedures
     * Saves state, notifies user, and attempts system restart with retry logic
     * @param {Error} error - The error that triggered emergency recovery
     */
    async handleError(error) {
        // Prevent recovery if already in progress or max attempts reached
        if (this.isRecovering || this.recoveryAttempts >= this.maxRecoveryAttempts) {
            console.error('Recovery limit reached or already recovering:', error);
            await this.bot.discordNotifier.notify('Emergency recovery failed: Max attempts reached');
            return;
        }
        
        // Set recovery state and increment attempt counter
        this.isRecovering = true;
        this.recoveryAttempts++;
        console.error('Emergency recovery triggered:', error);

        // Save current state before attempting recovery
        await this.bot.saveProfile();
        await this.bot.performanceAnalyzer.savePerformanceData();

        // Notify user of recovery initiation with attempt count
        await this.bot.discordNotifier.notify(`Emergency recovery initiated (Attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts})`);

        // Attempt restart with delayed execution to allow cleanup
        setTimeout(async () => {
            try {
                // Graceful shutdown followed by restart
                await this.bot.shutdown();
                await this.bot.start();
                
                // Reset recovery state on successful restart
                this.isRecovering = false;
                this.recoveryAttempts = 0;
                await this.bot.discordNotifier.notify('Bot successfully restarted after recovery');
            } catch (restartError) {
                console.error('Restart failed:', restartError);
                // Recursive retry if restart fails
                await this.handleError(restartError);
            }
        }, 5000); // 5 second delay for system cleanup
    }
}

// Integration in OGZPrimeV10.2.js
/**
 * OGZPrimeV10 - Main trading bot class with integrated emergency recovery
 * Demonstrates how EmergencyRecoveryManager is integrated into the main bot system
 */
class OGZPrimeV10 {
    /**
     * Initialize main trading bot with emergency recovery capabilities
     * @param {Object} config - Bot configuration parameters
     */
    constructor(config) {
        // Store configuration with spread operator for immutability
        this.config = { ...config };
        
        // Initialize emergency recovery manager with self-reference
        this.emergencyManager = new EmergencyRecoveryManager(this);
        // ... other initializations ...
    }

    /**
     * Start trading bot with comprehensive error handling
     * Initializes all subsystems and starts trading operations with emergency recovery
     */
    async start() {
        try {
            // Set operational status
            this.status = 'running';
            console.log(`Starting OGZ Prime V10.2 in ${this.config.mode} mode for ${this.config.assetName}`);
            
            // Initialize core subsystems
            await this.initializeWebSocket();
            await this.loadProfile();
            
            // Start trading mode based on configuration
            if (this.config.mode === 'simulate') {
                this.startSimulation();
            } else {
                this.startLiveTrading();
            }
            
            // Schedule periodic maintenance tasks (every hour)
            setInterval(() => this.performMaintenance(), 60 * 60 * 1000);
        } catch (error) {
            // Trigger emergency recovery on any startup failure
            await this.emergencyManager.handleError(error);
        }
    }
}

module.exports = EmergencyRecoveryManager;