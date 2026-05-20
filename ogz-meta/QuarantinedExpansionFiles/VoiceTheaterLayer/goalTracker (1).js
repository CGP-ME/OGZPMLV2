// 🎯 GOAL TRACKING MODULE - YOUR PATH TO HOUSTON!
// Tracks your progress toward financial freedom

window.goalTracker = {
  // Session goals - daily targets
  session: {
    pnlTarget: 250,      // Daily profit target
    tradesTarget: 10,    // Number of trades target
    winrateTarget: 0.7,  // 70% win rate target
    pnlCurrent: 0,
    tradesTotal: 0,
    tradesWon: 0
  },
  
  // Long-term goals - HOUSTON BOUND!
  longTerm: {
    houstonTarget: 10000,    // Moving fund target
    monthlyTarget: 5000,     // Monthly profit goal
    freedomTarget: 50000,    // Financial freedom number
    currentSaved: 0,
    totalEarned: 0,
    startDate: new Date()
  },

  // Update trade and check milestones
  updateTrade: function(pnl, wasWin) {
    this.session.pnlCurrent += pnl;
    this.session.tradesTotal++;
    if (wasWin) this.session.tradesWon++;
    
    // Update long-term tracking
    this.longTerm.totalEarned += pnl;
    if (pnl > 0) this.longTerm.currentSaved += pnl * 0.5; // Save 50% of profits

    // Update UI
    this.updateDisplay();
    
    // Check for milestone achievements
    this.checkMilestones();
    
    // Save progress
    this.saveProgress();
  },

  updateDisplay: function() {
    // Update session display
    const pnlEl = document.getElementById('pnl-current');
    const tradesEl = document.getElementById('trades-current');
    const winrateEl = document.getElementById('winrate-current');
    const goalBar = document.getElementById('goal-bar');
    
    if (pnlEl) pnlEl.textContent = `$${this.session.pnlCurrent.toFixed(2)}`;
    if (tradesEl) tradesEl.textContent = this.session.tradesTotal;
    if (winrateEl) {
      const winrate = this.getSessionWinrate();
      winrateEl.textContent = `${(winrate * 100).toFixed(1)}%`;
    }
    
    // Update progress bar
    if (goalBar) {
      const progress = (this.session.pnlCurrent / this.session.pnlTarget) * 100;
      goalBar.style.width = Math.min(progress, 100) + '%';
      
      // Color coding
      if (progress >= 100) {
        goalBar.style.backgroundColor = '#00ff00';
        goalBar.style.boxShadow = '0 0 20px #00ff00';
      } else if (progress >= 75) {
        goalBar.style.backgroundColor = '#ffd700';
      } else if (progress >= 50) {
        goalBar.style.backgroundColor = '#ff9900';
      }
    }
  },

  getSessionWinrate: function() {
    return this.session.tradesTotal > 0 ? 
      this.session.tradesWon / this.session.tradesTotal : 0;
  },

  checkMilestones: function() {
    const { pnlCurrent, pnlTarget } = this.session;
    const { currentSaved, houstonTarget } = this.longTerm;
    
    // Daily goal achieved!
    if (pnlCurrent >= pnlTarget && !this.session.goalHit) {
      this.session.goalHit = true;
      if (window.triggerSparkleExplosion) {
        window.triggerSparkleExplosion();
      }
      this.showAchievement("🎯 Daily Goal CRUSHED!", "Keep pushing warrior!");
    }
    
    // Houston savings milestones
    const houstonProgress = (currentSaved / houstonTarget) * 100;
    if (houstonProgress >= 25 && !this.longTerm.quarter) {
      this.longTerm.quarter = true;
      this.showAchievement("🚀 25% to Houston!", "Your daughter is waiting!");
    } else if (houstonProgress >= 50 && !this.longTerm.half) {
      this.longTerm.half = true;
      this.showAchievement("💪 HALFWAY TO HOUSTON!", "Nothing can stop you now!");
    } else if (houstonProgress >= 75 && !this.longTerm.threeQuarter) {
      this.longTerm.threeQuarter = true;
      this.showAchievement("🔥 75% THERE!", "The finish line is in sight!");
    } else if (houstonProgress >= 100 && !this.longTerm.complete) {
      this.longTerm.complete = true;
      this.showAchievement("🎉 HOUSTON FUND COMPLETE!", "Time to pack your bags! 🏠");
      if (window.animateGlow) {
        window.animateGlow("goal-bar", "#00ff00");
      }
    }
  },

  showAchievement: function(title, message) {
    // Create achievement popup
    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
      <h2>${title}</h2>
      <p>${message}</p>
      <div class="achievement-glow"></div>
    `;
    
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #9d71c7, #7d51a7);
      color: white;
      padding: 30px 50px;
      border-radius: 15px;
      box-shadow: 0 0 50px rgba(157, 113, 199, 0.8);
      z-index: 10000;
      text-align: center;
      animation: achievementPop 0.5s ease-out;
    `;
    
    document.body.appendChild(popup);
    
    // Auto remove after animation
    setTimeout(() => {
      popup.style.animation = 'achievementFade 0.5s ease-out';
      setTimeout(() => popup.remove(), 500);
    }, 3000);
  },

  saveProgress: function() {
    const data = {
      session: this.session,
      longTerm: this.longTerm,
      lastSaved: new Date().toISOString()
    };
    localStorage.setItem('ogzp-goals', JSON.stringify(data));
  },

  loadProgress: function() {
    const saved = localStorage.getItem('ogzp-goals');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Check if same day for session data
        const lastSaved = new Date(data.lastSaved);
        const today = new Date();
        
        if (lastSaved.toDateString() === today.toDateString()) {
          this.session = data.session;
        }
        
        // Always load long-term data
        this.longTerm = data.longTerm;
        this.updateDisplay();
      } catch (e) {
        console.error('Failed to load saved goals:', e);
      }
    }
  },

  reset: function() {
    this.session = {
      pnlTarget: 250,
      tradesTarget: 10,
      winrateTarget: 0.7,
      pnlCurrent: 0,
      tradesTotal: 0,
      tradesWon: 0,
      goalHit: false
    };
    this.updateDisplay();
  }
};

// Auto-load on startup
window.goalTracker.loadProgress();

// Add achievement animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes achievementPop {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    50% { transform: translate(-50%, -50%) scale(1.2); }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  }
  
  @keyframes achievementFade {
    to { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
  }
  
  .achievement-glow {
    position: absolute;
    top: -20px;
    left: -20px;
    right: -20px;
    bottom: -20px;
    background: radial-gradient(circle, rgba(157, 113, 199, 0.4), transparent);
    animation: pulse 2s infinite;
    z-index: -1;
    border-radius: 20px;
  }
`;
document.head.appendChild(style);