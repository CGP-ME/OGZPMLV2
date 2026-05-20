QuickActions.js
// VictoryAnimations.js - Because every win deserves a celebration
// For your daughter, for Houston, for FREEDOM!

class VictoryAnimations {
  constructor() {
    this.audioContext = null;
    this.sounds = {
      smallWin: null,
      mediumWin: null,
      bigWin: null,
      milestone: null
    };
    this.streakCount = 0;
    this.dailyWins = 0;
    
    // Milestone thresholds
    this.milestones = {
      firstWin: { hit: false, amount: 0 },
      first100: { hit: false, amount: 100 },
      first500: { hit: false, amount: 500 },
      first1000: { hit: false, amount: 1000 },
      houstonFund: { hit: false, amount: 5000 } // Your moving fund goal!
    };
    
    this.initializeAudio();
    this.loadMilestones();
  }
  
  initializeAudio() {
    // Web Audio API for victory sounds
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create victory sounds programmatically (no external files needed)
    this.sounds.smallWin = this.createCoinSound();
    this.sounds.mediumWin = this.createLevelUpSound();
    this.sounds.bigWin = this.createVictoryFanfare();
    this.sounds.milestone = this.createMilestoneSound();
  }
  
  createCoinSound() {
    return () => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
      
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.2);
    };
  }
  
  createLevelUpSound() {
    return () => {
      const notes = [523, 659, 784, 1047]; // C, E, G, High C
      notes.forEach((freq, i) => {
        setTimeout(() => {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
          
          osc.start();
          osc.stop(this.audioContext.currentTime + 0.3);
        }, i * 100);
      });
    };
  }
  
  createVictoryFanfare() {
    return () => {
      // Epic victory sound
      const notes = [261, 329, 392, 523, 392, 523, 659, 784]; // Victory melody
      notes.forEach((freq, i) => {
        setTimeout(() => {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          
          osc.start();
          osc.stop(this.audioContext.currentTime + 0.5);
        }, i * 150);
      });
    };
  }
  
  createMilestoneSound() {
    return () => {
      // Special achievement sound
      const chord = [261, 329, 392, 523]; // C major chord
      chord.forEach(freq => {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 2);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 2);
      });
    };
  }
  
  triggerWinAnimation(profit, balance) {
    // Increment counters
    this.streakCount++;
    this.dailyWins++;
    
    // Determine win tier
    if (profit < 50) {
      this.smallWinAnimation(profit);
    } else if (profit < 200) {
      this.mediumWinAnimation(profit);
    } else {
      this.bigWinAnimation(profit);
    }
    
    // Check milestones
    this.checkMilestones(balance);
    
    // Special animations for streaks
    if (this.streakCount >= 3) {
      this.streakAnimation(this.streakCount);
    }
    
    // Update UI streak counter
    this.updateStreakDisplay();
  }
  
  smallWinAnimation(profit) {
    // Play sound
    if (this.sounds.smallWin) this.sounds.smallWin();
    
    // Visual effect
    this.createFloatingText(`+$${profit.toFixed(2)}`, 'small-win');
    this.sparkleEffect(1);
  }
  
  mediumWinAnimation(profit) {
    // Play sound
    if (this.sounds.mediumWin) this.sounds.mediumWin();
    
    // Visual effects
    this.createFloatingText(`+$${profit.toFixed(2)}`, 'medium-win');
    this.sparkleEffect(3);
    this.screenFlash('#00ff00', 0.3);
    
    // Motivational message
    const messages = [
      "Great trade! Keep it up!",
      "You're on fire! 🔥",
      "Houston is getting closer!",
      "Your daughter would be proud!",
      "That's how we do it!"
    ];
    this.showMotivationalMessage(messages[Math.floor(Math.random() * messages.length)]);
  }
  
  bigWinAnimation(profit) {
    // Play epic sound
    if (this.sounds.bigWin) this.sounds.bigWin();
    
    // Full celebration mode
    this.createFloatingText(`+$${profit.toFixed(2)}`, 'big-win');
    this.sparkleEffect(10);
    this.screenFlash('#ffd700', 0.5);
    this.confettiExplosion();
    
    // Special overlay
    this.createCelebrationOverlay(profit);
  }
  
  createFloatingText(text, className) {
    const element = document.createElement('div');
    element.className = `floating-profit ${className}`;
    element.textContent = text;
    element.style.left = '50%';
    element.style.top = '50%';
    
    document.body.appendChild(element);
    
    // Animate up and fade
    element.animate([
      { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
      { transform: 'translate(-50%, -100%) scale(1.5)', opacity: 1, offset: 0.5 },
      { transform: 'translate(-50%, -150%) scale(1)', opacity: 0 }
    ], {
      duration: 2000,
      easing: 'ease-out'
    }).onfinish = () => element.remove();
  }
  
  sparkleEffect(count) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle-particle';
        sparkle.style.left = Math.random() * window.innerWidth + 'px';
        sparkle.style.top = Math.random() * window.innerHeight + 'px';
        
        document.body.appendChild(sparkle);
        
        sparkle.animate([
          { transform: 'scale(0) rotate(0deg)', opacity: 1 },
          { transform: 'scale(1) rotate(180deg)', opacity: 0 }
        ], {
          duration: 1000,
          easing: 'ease-out'
        }).onfinish = () => sparkle.remove();
      }, i * 100);
    }
  }
  
  screenFlash(color, opacity) {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${color};
      pointer-events: none;
      z-index: 9999;
    `;
    
    document.body.appendChild(flash);
    
    flash.animate([
      { opacity: 0 },
      { opacity: opacity },
      { opacity: 0 }
    ], {
      duration: 500,
      easing: 'ease-out'
    }).onfinish = () => flash.remove();
  }
  
  confettiExplosion() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffd700'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = '50%';
      confetti.style.top = '50%';
      
      document.body.appendChild(confetti);
      
      const angle = (Math.PI * 2 * i) / confettiCount;
      const velocity = 200 + Math.random() * 200;
      const rotateEnd = Math.random() * 720 - 360;
      
      confetti.animate([
        { 
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: 1
        },
        { 
          transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) rotate(${rotateEnd}deg) scale(1)`,
          opacity: 0
        }
      ], {
        duration: 2000,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      }).onfinish = () => confetti.remove();
    }
  }
  
  createCelebrationOverlay(profit) {
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.innerHTML = `
      <div class="victory-content">
        <h1 class="victory-title">🎉 LEGENDARY WIN! 🎉</h1>
        <div class="victory-amount">+$${profit.toFixed(2)}</div>
        <div class="victory-message">You're unstoppable!</div>
        <div class="houston-progress">
          <div class="progress-label">Houston Fund Progress</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.calculateHoustonProgress()}%"></div>
          </div>
          <div class="progress-text">${this.calculateHoustonProgress().toFixed(1)}% to Houston!</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 500);
    }, 4000);
  }
  
  checkMilestones(balance) {
    Object.entries(this.milestones).forEach(([key, milestone]) => {
      if (!milestone.hit && balance >= milestone.amount) {
        milestone.hit = true;
        this.triggerMilestone(key, milestone.amount);
      }
    });
  }
  
  triggerMilestone(type, amount) {
    // Play special sound
    if (this.sounds.milestone) this.sounds.milestone();
    
    // Create special milestone notification
    const messages = {
      firstWin: "🎯 First Win! The journey begins!",
      first100: "💯 First $100! You're building momentum!",
      first500: "🚀 $500 Milestone! Houston is calling!",
      first1000: "🏆 $1000 Achieved! You're halfway there!",
      houstonFund: "🏡 HOUSTON FUND COMPLETE! Time to pack!"
    };
    
    const notification = document.createElement('div');
    notification.className = 'milestone-notification';
    notification.innerHTML = `
      <div class="milestone-icon">🏆</div>
      <div class="milestone-title">MILESTONE ACHIEVED!</div>
      <div class="milestone-message">${messages[type]}</div>
    `;
    
    document.body.appendChild(notification);
    
    // Epic animation for Houston Fund
    if (type === 'houstonFund') {
      this.houstonCelebration();
    }
    
    setTimeout(() => {
      notification.classList.add('slide-out');
      setTimeout(() => notification.remove(), 500);
    }, 5000);
    
    // Save milestone
    this.saveMilestones();
  }
  
  houstonCelebration() {
    // This is THE moment - full celebration mode
    document.body.style.overflow = 'hidden';
    
    const celebration = document.createElement('div');
    celebration.className = 'houston-celebration';
    celebration.innerHTML = `
      <div class="houston-content">
        <h1>🏡 HOUSTON FUND COMPLETE! 🏡</h1>
        <p>You did it! You're going home to your daughter!</p>
        <div class="rocket-animation">🚀</div>
        <button onclick="this.parentElement.parentElement.remove(); document.body.style.overflow = '';">
          Continue Trading Like a BOSS
        </button>
      </div>
    `;
    
    document.body.appendChild(celebration);
    
    // Continuous confetti
    const confettiInterval = setInterval(() => this.confettiExplosion(), 1000);
    setTimeout(() => clearInterval(confettiInterval), 10000);
  }
  
  streakAnimation(count) {
    const streakDiv = document.createElement('div');
    streakDiv.className = 'streak-notification';
    streakDiv.innerHTML = `
      <div class="streak-fire">🔥</div>
      <div class="streak-text">${count} WIN STREAK!</div>
    `;
    
    document.body.appendChild(streakDiv);
    
    setTimeout(() => {
      streakDiv.classList.add('fade-out');
      setTimeout(() => streakDiv.remove(), 500);
    }, 3000);
  }
  
  showMotivationalMessage(message) {
    const motivational = document.createElement('div');
    motivational.className = 'motivational-message';
    motivational.textContent = message;
    
    document.body.appendChild(motivational);
    
    setTimeout(() => {
      motivational.classList.add('fade-out');
      setTimeout(() => motivational.remove(), 500);
    }, 3000);
  }
  
  updateStreakDisplay() {
    const streakElement = document.getElementById('win-streak');
    if (streakElement) {
      streakElement.textContent = this.streakCount;
      if (this.streakCount >= 3) {
        streakElement.classList.add('streak-hot');
      }
    }
  }
  
  calculateHoustonProgress() {
    // Calculate progress towards $5000 Houston fund
    const balance = window.ogzPrime?.tradingBrain?.balance || 0;
    const initial = window.ogzPrime?.config?.initialBalance || 10000;
    const profit = balance - initial;
    const goal = 5000;
    
    return Math.min(100, (profit / goal) * 100);
  }
  
  resetStreak() {
    this.streakCount = 0;
    this.updateStreakDisplay();
  }
  
  saveMilestones() {
    localStorage.setItem('ogzp-milestones', JSON.stringify(this.milestones));
  }
  
  loadMilestones() {
    const saved = localStorage.getItem('ogzp-milestones');
    if (saved) {
      try {
        this.milestones = JSON.parse(saved);
      } catch (e) {
        console.log('Loading fresh milestones');
      }
    }
  }
}