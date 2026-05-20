QuickActions.js
// streamdeck/quickActions.js
class QuickActions {
  constructor(ogzPrime, streamDeck) {
    this.ogzPrime = ogzPrime;
    this.streamDeck = streamDeck;
    this.soundEnabled = true;
  }

  async execute(action) {
    console.log(`🎮 StreamDeck action: ${action}`);
    
    switch (action) {
      case 'buy':
        this.ogzPrime.executeManualBuy();
        this.feedback('Buy executed', '#00ff00');
        break;
        
      case 'sell':
        this.ogzPrime.executeManualSell();
        this.feedback('Sell executed', '#ff0000');
        break;
        
      case 'emergencyClose':
        if (this.ogzPrime.tradingBrain.isInPosition()) {
          this.ogzPrime.emergencyClosePosition('StreamDeck emergency');
          this.feedback('Position closed!', '#ff6600');
        } else {
          this.feedback('No position', '#666666');
        }
        break;
        
      case 'pause':
        this.ogzPrime.pauseTrading('StreamDeck');
        this.feedback('Paused', '#ffff00');
        break;
        
      case 'resume':
        this.ogzPrime.resumeTrading();
        this.feedback('Resumed', '#00ff00');
        break;
        
      case 'showStats':
        this.displayStats();
        break;
        
      case 'riskUp':
        this.adjustRisk(0.25);
        break;
        
      case 'riskDown':
        this.adjustRisk(-0.25);
        break;
        
      case 'screenshot':
        await this.takeScreenshot();
        break;
        
      case 'toggleSound':
        this.soundEnabled = !this.soundEnabled;
        this.feedback(this.soundEnabled ? 'Sound ON' : 'Sound OFF', '#666666');
        break;
        
      case 'quickSave':
        this.ogzPrime.saveProfile();
        this.feedback('Saved!', '#0099ff');
        break;
        
      case 'showPnL':
        this.displayPnL();
        break;
        
      case 'switchProfile':
        this.cycleProfile();
        break;
        
      case 'toggleAI':
        this.toggleAI();
        break;
        
      case 'shutdown':
        this.confirmShutdown();
        break;
    }
  }

  feedback(message, color) {
    // Flash the button with color
    if (this.streamDeck && this.streamDeck.device) {
      // Implementation depends on streamdeck library
    }
    
    // Play sound if enabled
    if (this.soundEnabled) {
      // Play feedback sound
    }
    
    console.log(`🎮 ${message}`);
  }

  displayStats() {
    const stats = {
      balance: this.ogzPrime.tradingBrain.balance,
      trades: this.ogzPrime.status.dailyStats.trades,
      winRate: this.ogzPrime.status.dailyStats.trades > 0 ?
        (this.ogzPrime.status.dailyStats.wins / this.ogzPrime.status.dailyStats.trades * 100).toFixed(1) : 0
    };
    
    this.feedback(`$${stats.balance.toFixed(0)} | ${stats.winRate}%`, '#00bfff');
  }

  displayPnL() {
    const pnl = this.ogzPrime.tradingBrain.balance - this.ogzPrime.config.initialBalance;
    const color = pnl >= 0 ? '#00ff00' : '#ff0000';
    this.feedback(`P&L: $${pnl.toFixed(2)}`, color);
  }

  adjustRisk(change) {
    if (this.ogzPrime.riskManager) {
      const current = this.ogzPrime.riskManager.config.baseRiskPercent;
      const newRisk = Math.max(0.5, Math.min(5, current + change));
      this.ogzPrime.riskManager.config.baseRiskPercent = newRisk;
      this.feedback(`Risk: ${newRisk}%`, newRisk > 2 ? '#ff9900' : '#00cc00');
    }
  }

  cycleProfile() {
    // Cycle through available profiles
    const profiles = ['default', 'conservative', 'aggressive'];
    const current = this.ogzPrime.config.profileName;
    const index = profiles.indexOf(current);
    const next = profiles[(index + 1) % profiles.length];
    this.ogzPrime.changeProfile(next);
    this.feedback(`Profile: ${next}`, '#ff00ff');
  }

  toggleAI() {
    // Toggle pattern recognition
    this.ogzPrime.config.enablePatternRecognition = !this.ogzPrime.config.enablePatternRecognition;
    const status = this.ogzPrime.config.enablePatternRecognition ? 'ON' : 'OFF';
    this.feedback(`AI: ${status}`, '#ff69b4');
  }

  async takeScreenshot() {
    // Implementation for screenshot
    this.feedback('Screenshot saved', '#9d71c7');
  }

  confirmShutdown() {
    // Double-tap protection
    if (this.shutdownConfirm) {
      this.ogzPrime.shutdown();
      this.feedback('SHUTDOWN!', '#ff0000');
    } else {
      this.shutdownConfirm = true;
      this.feedback('Tap again to confirm', '#ff0000');
      setTimeout(() => {
        this.shutdownConfirm = false;
      }, 3000);
    }
  }
}

module.exports = QuickActions;