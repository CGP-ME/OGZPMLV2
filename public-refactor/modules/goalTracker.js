// public/modules/goalTracker.js

// 識 GOAL TRACKING MODULE - YOUR PATH TO HOUSTON!
// Tracks your progress toward financial freedom

// Define the goalTracker object. This will be exported and then assigned to window.OGZP.goalTracker.
const goalTracker = {
  // Session goals - daily targets
  session: {
    pnlTarget: 250,      // Daily profit target
    tradesTarget: 10,    // Number of trades target
    winrateTarget: 0.7,  // 70% win rate target
    pnlCurrent: 0,
    tradesTotal: 0,
    tradesWon: 0,
    goalHit: false // Added to prevent re-triggering daily goal
  },
  
  // Long-term goals - HOUSTON BOUND!
  longTerm: {
    houstonTarget: 10000,    // Moving fund target
    monthlyTarget: 5000,     // Monthly profit goal (not directly used for milestones here, but good to track)
    freedomTarget: 50000,    // Financial freedom number (future milestone)
    currentSaved: 0,
    totalEarned: 0,
    startDate: new Date(),
    // Milestone flags to prevent re-triggering
    quarter: false,
    half: false,
    threeQuarter: false,
    complete: false
  },

  /**
   * Updates trade statistics and checks for milestone achievements.
   * @param {number} pnl - Profit or loss from the trade.
   * @param {boolean} wasWin - True if the trade was a win, false otherwise.
   */
  updateTrade: function(pnl, wasWin) {
    this.session.pnlCurrent += pnl;
    this.session.tradesTotal++;
    if (wasWin) this.session.tradesWon++;
    
    // Update long-term tracking
    this.longTerm.totalEarned += pnl;
    if (pnl > 0) {
      this.longTerm.currentSaved += pnl * 0.5; // Save 50% of profits
    }

    // Update UI
    this.updateDisplay();
    
    // Check for milestone achievements
    this.checkMilestones();
    
    // Save progress
    this.saveProgress();
  },

  /**
   * Updates the display elements on the dashboard with current goal progress.
   */
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
      
      // Color coding based on progress
      if (progress >= 100) {
        goalBar.style.backgroundColor = '#00ff00';
        goalBar.style.boxShadow = '0 0 20px #00ff00';
      } else if (progress >= 75) {
        goalBar.style.backgroundColor = '#ffd700';
        goalBar.style.boxShadow = '0 0 15px #ffd700';
      } else if (progress >= 50) {
        goalBar.style.backgroundColor = '#ff9900';
        goalBar.style.boxShadow = '0 0 10px #ff9900';
      } else {
        goalBar.style.backgroundColor = '#9d71c7'; // Default primary color
        goalBar.style.boxShadow = 'none';
      }
    }
  },

  /**
   * Calculates the current session's win rate.
   * @returns {number} The win rate as a decimal (0-1).
   */
  getSessionWinrate: function() {
    return this.session.tradesTotal > 0 ? 
      this.session.tradesWon / this.session.tradesTotal : 0;
  },

  /**
   * Checks for and triggers milestone achievements.
   */
  checkMilestones: function() {
    const { pnlCurrent, pnlTarget } = this.session;
    const { currentSaved, houstonTarget } = this.longTerm;
    
    // Daily goal achieved!
    if (pnlCurrent >= pnlTarget && !this.session.goalHit) {
      this.session.goalHit = true;
      // Use window.OGZP.triggerSparkleExplosion if it's available
      if (window.OGZP && window.OGZP.triggerSparkleExplosion) {
        window.OGZP.triggerSparkleExplosion();
      }
      this.showAchievement("🎯 Daily Goal CRUSHED!", "Keep pushing warrior!");
    }
    
    // Houston savings milestones
    const houstonProgress = (currentSaved / houstonTarget) * 100;
    if (houstonProgress >= 25 && !this.longTerm.quarter) {
      this.longTerm.quarter = true;
      this.showAchievement("🚀 25% to Houston!", "Your daughter is waiting!");
    } 
    if (houstonProgress >= 50 && !this.longTerm.half) {
      this.longTerm.half = true;
      this.showAchievement("🏠 HALFWAY TO HOUSTON!", "Nothing can stop you now!");
    } 
    if (houstonProgress >= 75 && !this.longTerm.threeQuarter) {
      this.longTerm.threeQuarter = true;
      this.showAchievement("🏁 75% THERE!", "The finish line is in sight!");
    } 
    if (houstonProgress >= 100 && !this.longTerm.complete) {
      this.longTerm.complete = true;
      this.showAchievement("🎉 HOUSTON FUND COMPLETE!", "Time to pack your bags! 🚀");
      // Use window.OGZP.animateGlow if it's available
      if (window.OGZP && window.OGZP.animateGlow) {
        window.OGZP.animateGlow("goal-bar", "#00ff00");
      }
    }
  },

  /**
   * Displays an achievement popup.
   * @param {string} title - The title of the achievement.
   * @param {string} message - The message for the achievement.
   */
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
      popup.style.animation = 'achievementFade 0.5s ease-out forwards'; // Use forwards to keep final state
      setTimeout(() => popup.remove(), 500);
    }, 3000);
  },

  /**
   * Saves the current session and long-term goal progress to local storage.
   */
  saveProgress: function() {
    const data = {
      session: this.session,
      longTerm: this.longTerm,
      lastSaved: new Date().toISOString()
    };
    localStorage.setItem('ogzp-goals', JSON.stringify(data));
  },

  /**
   * Loads saved session and long-term goal progress from local storage.
   * Resets session goals if it's a new day.
   */
  loadProgress: function() {
    const saved = localStorage.getItem('ogzp-goals');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Check if same day for session data
        const lastSaved = new Date(data.lastSaved);
        const today = new Date();
        
        // Only load session if it's the same day, otherwise reset
        if (lastSaved.toDateString() === today.toDateString()) {
          this.session = data.session;
        } else {
          console.log('New day detected, resetting session goals.');
          this.resetSession(); // Reset only session data
        }
        
        // Always load long-term data
        this.longTerm = data.longTerm;
        this.updateDisplay();
      } catch (e) {
        console.error('Failed to load saved goals:', e);
        this.reset(); // If loading fails, reset all to default
      }
    } else {
      this.reset(); // If no saved data, reset to default
    }
  },

  /**
   * Resets all session and long-term goals to their default values.
   */
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
    this.longTerm = {
      houstonTarget: 10000,
      monthlyTarget: 5000,
      freedomTarget: 50000,
      currentSaved: 0,
      totalEarned: 0,
      startDate: new Date(),
      quarter: false,
      half: false,
      threeQuarter: false,
      complete: false
    };
    this.updateDisplay();
    this.saveProgress(); // Save the reset state
  },

  /**
   * Resets only the session-specific goals.
   */
  resetSession: function() {
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

// Add achievement animation styles (these should ideally be in valhalla-style.css)
// Keeping them here for self-containment as per original file.
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
  
  .achievement-popup {
    /* Styles are inline in showAchievement for dynamic positioning */
  }

  .achievement-glow {
    position: absolute;
    top: -20px;
    left: -20px;
    right: -20px;
    bottom: -20px;
    background: radial-gradient(circle, rgba(157, 113, 199, 0.4), transparent);
    animation: pulse 2s infinite; /* Assuming pulse animation is defined in valhalla-style.css or criticalStyles */
    z-index: -1;
    border-radius: 20px;
  }
`;
document.head.appendChild(style);

// Export the object for ES6 module loading
export { goalTracker };