// DashboardIntegrator.js - Connects all existing OGZ systems to the dashboard
// Works with your existing VictoryAnimations, LicenseManager, tutorial, etc.

class DashboardIntegrator {
  constructor() {
    this.connectedSystems = {};
    this.initializationComplete = false;
    
    // Wait for DOM and other systems to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  async initialize() {
    console.log('🔗 OGZ Dashboard Integrator starting...');
    
    // Connect to existing systems
    await this.connectToExistingSystems();
    
    // Setup dashboard enhancements
    this.setupDashboardEnhancements();
    
    // Start integration loops
    this.startIntegrationLoops();
    
    this.initializationComplete = true;
    console.log('✅ Dashboard integration complete!');
  }

  async connectToExistingSystems() {
    // Connect to VictoryAnimations (your existing celebration system)
    if (window.VictoryAnimations) {
      this.connectedSystems.victories = new window.VictoryAnimations();
      console.log('✅ Connected to VictoryAnimations system');
      
      // Override trade completion to trigger your celebrations
      this.setupVictoryIntegration();
    }

    // Connect to License System (your existing monetization/LicenseManager.js)
    if (window.LicenseManager) {
      this.connectedSystems.license = window.LicenseManager;
      console.log('✅ Connected to License system');
      this.setupLicenseIntegration();
    }

    // Connect to existing tutorial system
    if (window.Shepherd) {
      console.log('✅ Shepherd tutorial system available');
      this.setupTutorialIntegration();
    }

    // Connect to performance systems
    if (window.performanceMonitor) {
      this.connectedSystems.performance = window.performanceMonitor;
      console.log('✅ Connected to Performance Monitor');
    }

    // Connect to OGZ Prime main system
    if (window.ogzPrime) {
      this.connectedSystems.ogzPrime = window.ogzPrime;
      console.log('✅ Connected to OGZ Prime main system');
      this.setupOGZIntegration();
    }
  }

  setupVictoryIntegration() {
    // Listen for trade completions and trigger your existing celebration system
    const originalProcessTrade = window.ogzPrime?.processTrade;
    if (originalProcessTrade) {
      window.ogzPrime.processTrade = (trade) => {
        const result = originalProcessTrade.call(window.ogzPrime, trade);
        
        // Trigger your existing victory animations
        if (trade.profit > 0 && this.connectedSystems.victories) {
          this.connectedSystems.victories.triggerWinAnimation(
            trade.profit, 
            window.ogzPrime.balance || 10000
          );
        }
        
        return result;
      };
    }

    // Also listen for manual celebration triggers
    this.setupCelebrationButtons();
  }

  setupCelebrationButtons() {
    // Add celebration test buttons (for demo purposes)
    const celebrationPanel = document.createElement('div');
    celebrationPanel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      border: 1px solid #00ff00;
      padding: 10px;
      border-radius: 5px;
      z-index: 9999;
      font-family: monospace;
      font-size: 12px;
    `;
    
    celebrationPanel.innerHTML = `
      <div style="color: #00ff00; margin-bottom: 5px;">🎉 Celebrations</div>
      <button onclick="window.dashboardIntegrator.testCelebration('small')" 
              style="display: block; width: 100%; margin: 2px 0; background: #333; color: #0f0; border: 1px solid #0f0; padding: 5px;">
        Test Small Win
      </button>
      <button onclick="window.dashboardIntegrator.testCelebration('big')" 
              style="display: block; width: 100%; margin: 2px 0; background: #333; color: #0f0; border: 1px solid #0f0; padding: 5px;">
        Test Big Win
      </button>
      <button onclick="window.dashboardIntegrator.testCelebration('houston')" 
              style="display: block; width: 100%; margin: 2px 0; background: #333; color: #f0f; border: 1px solid #f0f; padding: 5px;">
        Test Houston!
      </button>
    `;
    
    document.body.appendChild(celebrationPanel);
  }

  testCelebration(type) {
    if (!this.connectedSystems.victories) return;
    
    switch(type) {
      case 'small':
        this.connectedSystems.victories.triggerWinAnimation(25, 10000);
        break;
      case 'big':
        this.connectedSystems.victories.triggerWinAnimation(250, 10000);
        break;
      case 'houston':
        this.connectedSystems.victories.houstonCelebration();
        break;
    }
  }

  setupLicenseIntegration() {
    // If license system exists, show license status in dashboard
    if (this.connectedSystems.license) {
      this.addLicenseStatusWidget();
    }
  }

  addLicenseStatusWidget() {
    const licenseWidget = document.createElement('div');
    licenseWidget.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0,0,0,0.9);
      border: 2px solid #00ff00;
      padding: 15px;
      border-radius: 10px;
      font-family: monospace;
      z-index: 9998;
      min-width: 200px;
    `;
    
    licenseWidget.innerHTML = `
      <div style="color: #00ff00; margin-bottom: 10px;">
        🔐 License Status
      </div>
      <div style="color: #666; font-size: 12px;" id="license-status">
        Checking...
      </div>
    `;
    
    document.body.appendChild(licenseWidget);
    
    // Update license status
    this.updateLicenseStatus();
    setInterval(() => this.updateLicenseStatus(), 30000); // Update every 30s
  }

  updateLicenseStatus() {
    const statusEl = document.getElementById('license-status');
    if (!statusEl || !this.connectedSystems.license) return;
    
    try {
      const info = this.connectedSystems.license.getLicenseInfo();
      const activeModules = info.activeModules || [];
      
      statusEl.innerHTML = `
        <div>Active Modules: ${activeModules.length}</div>
        <div style="font-size: 10px; margin-top: 5px;">
          ${activeModules.slice(0, 3).join(', ')}
          ${activeModules.length > 3 ? '...' : ''}
        </div>
      `;
    } catch (error) {
      statusEl.textContent = 'License system error';
    }
  }

  setupTutorialIntegration() {
    // Check if user needs tutorial
    if (!localStorage.getItem('ogz_dashboard_tutorial_complete')) {
      setTimeout(() => this.startDashboardTutorial(), 2000);
    }
  }

  startDashboardTutorial() {
    // Enhanced tutorial for your dashboard specifically
    if (!window.Shepherd) return;
    
    const tour = new window.Shepherd.Tour({
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        classes: 'ogz-tutorial-step',
        scrollTo: { behavior: 'smooth', block: 'center' }
      }
    });

    tour.addStep({
      id: 'welcome-dashboard',
      text: `
        <h3>🚀 Welcome to OGZ Prime Dashboard!</h3>
        <p>This is your mission control for getting to Houston. Let's get you familiar with everything.</p>
      `,
      buttons: [{ text: 'Start Tour', action: tour.next }]
    });

    tour.addStep({
      id: 'performance-monitor',
      text: `
        <h3>📊 Performance Monitor</h3>
        <p>This shows real-time FPS and memory usage. Press Ctrl+P to toggle it.</p>
      `,
      attachTo: { element: '#performance-monitor', on: 'left' },
      buttons: [
        { text: 'Back', action: tour.back },
        { text: 'Next', action: tour.next }
      ]
    });

    tour.addStep({
      id: 'celebrations',
      text: `
        <h3>🎉 Victory Celebrations</h3>
        <p>When you make profitable trades, epic celebrations will fire! Try the test buttons to see them in action.</p>
      `,
      buttons: [
        { text: 'Back', action: tour.back },
        { text: 'Finish', action: () => {
          tour.complete();
          localStorage.setItem('ogz_dashboard_tutorial_complete', 'true');
        }}
      ]
    });

    tour.start();
  }

  setupOGZIntegration() {
    // Enhanced integration with main OGZ Prime system
    if (!this.connectedSystems.ogzPrime) return;
    
    // Listen for trade events
    if (this.connectedSystems.ogzPrime.on) {
      this.connectedSystems.ogzPrime.on('trade_completed', (trade) => {
        this.handleTradeCompleted(trade);
      });
      
      this.connectedSystems.ogzPrime.on('balance_updated', (balance) => {
        this.handleBalanceUpdated(balance);
      });
    }
  }

  handleTradeCompleted(trade) {
    // Trigger appropriate celebrations based on trade result
    if (trade.profit > 0 && this.connectedSystems.victories) {
      this.connectedSystems.victories.triggerWinAnimation(trade.profit, trade.newBalance);
    }
    
    // Update dashboard displays
    this.updateDashboardMetrics(trade);
  }

  handleBalanceUpdated(balance) {
    // Update balance displays throughout dashboard
    const balanceElements = document.querySelectorAll('[data-balance]');
    balanceElements.forEach(el => {
      el.textContent = `$${balance.toFixed(2)}`;
    });
  }

  updateDashboardMetrics(trade) {
    // Update various dashboard metrics
    const metrics = {
      totalTrades: (this.connectedSystems.ogzPrime.stats?.totalTrades || 0) + 1,
      balance: trade.newBalance || this.connectedSystems.ogzPrime.balance || 10000,
      lastTrade: trade
    };
    
    // Emit custom event for other systems to listen to
    window.dispatchEvent(new CustomEvent('ogz-metrics-updated', { 
      detail: metrics 
    }));
  }

  setupDashboardEnhancements() {
    // Add keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    // Add status indicators
    this.addSystemStatusIndicators();
    
    // Setup auto-refresh for stale data
    this.setupAutoRefresh();
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+C = Test celebration
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        this.testCelebration('big');
        e.preventDefault();
      }
      
      // Ctrl+Shift+H = Houston celebration
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        this.testCelebration('houston');
        e.preventDefault();
      }
      
      // Ctrl+Shift+T = Start tutorial
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        this.startDashboardTutorial();
        e.preventDefault();
      }
    });
  }

  addSystemStatusIndicators() {
    // Add indicators for all connected systems
    const statusPanel = document.createElement('div');
    statusPanel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      border: 1px solid #00ff00;
      padding: 10px;
      border-radius: 5px;
      z-index: 9999;
      font-family: monospace;
      font-size: 12px;
    `;
    
    document.body.appendChild(statusPanel);
    
    // Update status every 5 seconds
    setInterval(() => {
      statusPanel.innerHTML = `
        <div style="color: #00ff00; margin-bottom: 5px;">🔧 System Status</div>
        ${Object.entries(this.connectedSystems).map(([name, system]) => 
          `<div style="color: #0f0;">✅ ${name}</div>`
        ).join('')}
        <div style="color: #666; margin-top: 5px; font-size: 10px;">
          Last update: ${new Date().toLocaleTimeString()}
        </div>
      `;
    }, 5000);
  }

  setupAutoRefresh() {
    // Refresh stale dashboard data every 30 seconds
    setInterval(() => {
      if (this.connectedSystems.ogzPrime) {
        // Request fresh data from main system
        this.connectedSystems.ogzPrime.refreshDashboardData?.();
      }
    }, 30000);
  }

  startIntegrationLoops() {
    // Start various integration loops
    this.startHealthChecks();
    this.startDataSync();
  }

  startHealthChecks() {
    // Check system health every minute
    setInterval(() => {
      const healthStatus = {
        victories: !!this.connectedSystems.victories,
        license: !!this.connectedSystems.license,
        ogzPrime: !!this.connectedSystems.ogzPrime,
        performance: !!this.connectedSystems.performance
      };
      
      const healthyCount = Object.values(healthStatus).filter(Boolean).length;
      const totalSystems = Object.keys(healthStatus).length;
      
      console.log(`🏥 System Health: ${healthyCount}/${totalSystems} systems healthy`);
      
      // Emit health status
      window.dispatchEvent(new CustomEvent('ogz-health-check', {
        detail: { healthStatus, healthyCount, totalSystems }
      }));
    }, 60000);
  }

  startDataSync() {
    // Sync data between systems every 10 seconds
    setInterval(() => {
      if (this.connectedSystems.ogzPrime && this.connectedSystems.victories) {
        // Sync balance for Houston progress
        const balance = this.connectedSystems.ogzPrime.balance || 10000;
        // Victory system will calculate Houston progress automatically
      }
    }, 10000);
  }
}

// Auto-initialize
window.dashboardIntegrator = new DashboardIntegrator();

// Add CSS for enhanced tutorial styles
const style = document.createElement('style');
style.textContent = `
  .ogz-tutorial-step {
    background: rgba(0,0,0,0.95) !important;
    border: 2px solid #00ff00 !important;
    color: #00ff00 !important;
    font-family: monospace !important;
  }
  
  .ogz-tutorial-step h3 {
    color: #00ff00 !important;
    margin-top: 0 !important;
  }
  
  .ogz-tutorial-step .shepherd-button {
    background: #00ff00 !important;
    color: #000 !important;
    border: none !important;
    font-family: monospace !important;
    font-weight: bold !important;
  }
`;
document.head.appendChild(style);
