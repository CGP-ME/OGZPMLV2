QuickActions.js
// ui/milestoneEffects.js
class MilestoneEffects {
  constructor() {
    this.milestones = {
      firstTrade: { achieved: false, value: 1 },
      firstWin: { achieved: false, value: 1 },
      first100: { achieved: false, value: 100 },
      first1000: { achieved: false, value: 1000 },
      houstonQuarter: { achieved: false, value: 2500 },
      houstonHalf: { achieved: false, value: 5000 },
      houstonReady: { achieved: false, value: 10000 }
    };
    
    this.loadProgress();
  }

  checkMilestone(type, value) {
    const milestone = this.milestones[type];
    if (!milestone || milestone.achieved) return;
    
    if (value >= milestone.value) {
      milestone.achieved = true;
      this.triggerCelebration(type);
      this.saveProgress();
    }
  }

  triggerCelebration(type) {
    const celebrations = {
      firstTrade: () => this.firstTradeCelebration(),
      firstWin: () => this.firstWinCelebration(),
      first100: () => this.profitMilestoneCelebration(100),
      first1000: () => this.profitMilestoneCelebration(1000),
      houstonQuarter: () => this.houstonProgressCelebration(25),
      houstonHalf: () => this.houstonProgressCelebration(50),
      houstonReady: () => this.houstonReadyCelebration()
    };
    
    const celebrate = celebrations[type];
    if (celebrate) celebrate();
  }

  firstTradeCelebration() {
    this.showBanner('🎯 First Trade Complete!', 'The journey begins!');
    this.confetti(20);
  }

  firstWinCelebration() {
    this.showBanner('💰 First Win!', 'Taste of victory!');
    this.confetti(30);
    this.playSound('win');
  }

  profitMilestoneCelebration(amount) {
    this.showBanner(`🎉 $${amount} Milestone!`, 'Profits are stacking up!');
    this.confetti(50);
    this.screenFlash('#00ff00');
    this.playSound('milestone');
  }

  houstonProgressCelebration(percent) {
    this.showBanner(`🚀 ${percent}% to Houston!`, 'Getting closer to your daughter!');
    this.confetti(75);
    this.rocketAnimation();
    this.playSound('progress');
  }

  houstonReadyCelebration() {
    // This is THE moment
    document.body.style.overflow = 'hidden';
    
    const overlay = document.createElement('div');
    overlay.className = 'houston-ready-overlay';
    overlay.innerHTML = `
      <div class="houston-ready-content">
        <div class="rocket-launch">🚀</div>
        <h1>HOUSTON FUND COMPLETE!</h1>
        <p>You did it! Time to reunite with your daughter!</p>
        <div class="stars">✨ ✨ ✨</div>
        <button onclick="this.parentElement.parentElement.remove(); document.body.style.overflow = '';">
          Continue Trading Like a Champion
        </button>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Continuous celebration
    this.epicConfetti();
    this.playSound('victory');
  }

  showBanner(title, message) {
    const banner = document.createElement('div');
    banner.className = 'milestone-banner';
    banner.innerHTML = `
      <h2>${title}</h2>
      <p>${message}</p>
    `;
    
    banner.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #9d71c7, #7d51a7);
      color: white;
      padding: 20px 40px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideDown 0.5s ease-out;
    `;
    
    document.body.appendChild(banner);
    
    setTimeout(() => {
      banner.style.animation = 'slideUp 0.5s ease-out';
      setTimeout(() => banner.remove(), 500);
    }, 4000);
  }

  confetti(count) {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffd700'];
    
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
          position: fixed;
          width: 10px;
          height: 10px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          left: ${Math.random() * window.innerWidth}px;
          top: -10px;
          z-index: 9999;
          animation: confettiFall 3s ease-out forwards;
        `;
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
      }, i * 50);
    }
  }

  screenFlash(color) {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${color};
      opacity: 0;
      pointer-events: none;
      z-index: 9998;
      animation: flash 0.5s ease-out;
    `;
    
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  rocketAnimation() {
    const rocket = document.createElement('div');
    rocket.textContent = '🚀';
    rocket.style.cssText = `
      position: fixed;
      font-size: 100px;
      bottom: -100px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      animation: rocketLaunch 3s ease-out forwards;
    `;
    
    document.body.appendChild(rocket);
    setTimeout(() => rocket.remove(), 3000);
  }

  epicConfetti() {
    const duration = 10000; // 10 seconds
    const interval = setInterval(() => this.confetti(10), 200);
    setTimeout(() => clearInterval(interval), duration);
  }

  playSound(type) {
    // Sound implementation
    console.log(`🔊 Playing ${type} sound`);
  }

  loadProgress() {
    const saved = localStorage.getItem('ogzp-milestones');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        Object.assign(this.milestones, data);
      } catch (e) {
        console.error('Failed to load milestones:', e);
      }
    }
  }

  saveProgress() {
    localStorage.setItem('ogzp-milestones', JSON.stringify(this.milestones));
  }
}

// Add required CSS
const style = document.createElement('style');
style.textContent = `
@keyframes slideDown {
  from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}

@keyframes slideUp {
  to { transform: translateX(-50%) translateY(-100px); opacity: 0; }
}

@keyframes confettiFall {
  to { 
    transform: translateY(${window.innerHeight}px) rotate(720deg);
    opacity: 0;
  }
}

@keyframes flash {
  0% { opacity: 0; }
  50% { opacity: 0.3; }
  100% { opacity: 0; }
}

@keyframes rocketLaunch {
  to {
    transform: translateX(-50%) translateY(-${window.innerHeight + 200}px);
  }
}

.houston-ready-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #000428, #004e92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.houston-ready-content {
  text-align: center;
  color: white;
  animation: zoomIn 1s ease-out;
}

@keyframes zoomIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
`;
document.head.appendChild(style);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MilestoneEffects;
}