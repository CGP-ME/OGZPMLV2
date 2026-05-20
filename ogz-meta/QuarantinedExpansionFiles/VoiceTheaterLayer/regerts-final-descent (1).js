// regertsFinalDescent.js - The point of no return
const EventEmitter = require('events');

class RegertsFinalDescent extends EventEmitter {
  constructor(tradingBrain, voiceManager) {
    super();
    this.tradingBrain = tradingBrain;
    this.voiceManager = voiceManager;
    this.isTriggered = false;
    this.throttleLevel = 0;
    this.countdown = null;
    
    // Configuration
    this.config = {
      bsodDuration: 8000, // How long the BSOD sequence lasts
      freezeDuration: 2000, // Input freeze after click
      autoExecuteTrade: true, // Actually execute a trade at 100%
      maxPositionMultiplier: 3, // How much bigger the YOLO trade is
      removeStopLoss: true // Full degen mode
    };
  }

  // Trigger the final descent sequence
  async trigger(currentState) {
    if (this.isTriggered) return;
    this.isTriggered = true;
    
    console.log('💀 FINAL DESCENT INITIATED - 99.9% DEGENERACY');
    this.emit('descent-started');
    
    // Phase 1: BSOD Transformation
    await this.phaseBSOD();
    
    // Phase 2: Throttle Sequence
    await this.phaseThrottle();
    
    // Phase 3: The Click
    await this.phaseExecution(currentState);
    
    // Phase 4: Aftermath
    await this.phaseAftermath();
    
    this.emit('descent-complete');
  }

  // Phase 1: Blue Screen of Degeneracy
  async phaseBSOD() {
    return new Promise((resolve) => {
      // Create BSOD overlay
      this.createBSODOverlay();
      
      // Play initial voice line
      this.voiceManager.play('gotcha_bitch');
      
      // Add glitch effects
      this.startGlitchEffects();
      
      setTimeout(() => {
        // Show the classic line
        this.updateBSODText("You were *praying* this would happen. Don't lie to me.");
        
        setTimeout(() => {
          this.updateBSODText("What we have here, boys, is a good old fashioned:");
          resolve();
        }, 2000);
      }, 2000);
    });
  }

  // Phase 2: Throttle Animation
  async phaseThrottle() {
    return new Promise((resolve) => {
      // Display throttle message
      this.updateBSODText("WHEN IN DOUBT — THROTTLE HER OUT.");
      this.voiceManager.play('throttle_out');
      
      // Create throttle visual
      this.createThrottleAnimation();
      
      // Animate throttle slam
      this.animateThrottle(0, 100, 2000, () => {
        // Show 100% degeneracy
        this.showDegeneracyComplete();
        
        setTimeout(() => {
          // Play Top Gun audio
          this.voiceManager.play('negative_ghostrider');
          this.updateBSODText("Negative, Ghostrider. You are not clear for logic.");
          
          setTimeout(resolve, 2000);
        }, 1000);
      });
    });
  }

  // Phase 3: Execute the trade
  async phaseExecution(currentState) {
    return new Promise((resolve) => {
      // The dramatic pause before the click
      this.showClickPrompt();
      
      setTimeout(() => {
        // Play the click
        this.voiceManager.play('click');
        
        // Visual feedback
        this.flashScreen();
        
        // If configured, actually execute a trade
        if (this.config.autoExecuteTrade && this.tradingBrain) {
          this.executeMaxDegeneracyTrade(currentState);
        }
        
        // Freeze all inputs
        this.freezeInputs();
        
        setTimeout(resolve, this.config.freezeDuration);
      }, 1000);
    });
  }

  // Phase 4: The aftermath
  async phaseAftermath() {
    return new Promise((resolve) => {
      // Remove BSOD
      this.removeBSODOverlay();
      
      // Play final voice line
      this.voiceManager.play('trade_sent');
      
      // Show results notification
      this.showTradeNotification();
      
      // Emit completion event
      this.emit('trade-executed', {
        degeneracyLevel: 100,
        logicLevel: 0,
        tradeType: 'MAXIMUM_REGERTS'
      });
      
      setTimeout(resolve, 3000);
    });
  }

  // Create the BSOD overlay
  createBSODOverlay() {
    if (typeof document === 'undefined') return;
    
    this.bsodOverlay = document.createElement('div');
    this.bsodOverlay.id = 'regerts-bsod';
    this.bsodOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #0000aa;
      color: white;
      font-family: 'Lucida Console', monospace;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 99999;
      animation: bsod-flicker 0.1s;
    `;
    
    this.bsodContent = document.createElement('div');
    this.bsodContent.style.cssText = `
      text-align: center;
      max-width: 800px;
      padding: 40px;
    `;
    
    this.bsodContent.innerHTML = `
      <div style="background: white; color: #0000aa; padding: 10px 30px; margin-bottom: 30px;">
        <h1>OGZPrime SYSTEM FAILURE</h1>
      </div>
      <p style="font-size: 24px; margin: 20px 0;">Code: 0xDEGENERATE</p>
      <h2 style="font-size: 48px; margin: 30px 0;">GOTCHA, BITCH.</h2>
      <div id="bsod-message" style="font-size: 20px; margin: 30px 0;"></div>
      <div id="throttle-container"></div>
    `;
    
    this.bsodOverlay.appendChild(this.bsodContent);
    document.body.appendChild(this.bsodOverlay);
    
    // Add CSS animation
    if (!document.getElementById('bsod-styles')) {
      const style = document.createElement('style');
      style.id = 'bsod-styles';
      style.textContent = `
        @keyframes bsod-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        @keyframes throttle-slam {
          0% { transform: rotate(-45deg) scale(1); }
          50% { transform: rotate(0deg) scale(1.2); }
          100% { transform: rotate(45deg) scale(1); }
        }
        
        @keyframes screen-flash {
          0% { background: #0000aa; }
          50% { background: #ffffff; }
          100% { background: #0000aa; }
        }
        
        .glitch {
          animation: glitch 0.3s infinite;
        }
        
        @keyframes glitch {
          0% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          50% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
          100% { transform: translateX(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Update BSOD text
  updateBSODText(text) {
    const messageEl = document.getElementById('bsod-message');
    if (messageEl) {
      messageEl.textContent = text;
      messageEl.classList.add('glitch');
      setTimeout(() => messageEl.classList.remove('glitch'), 300);
    }
  }

  // Create throttle animation
  createThrottleAnimation() {
    const container = document.getElementById('throttle-container');
    if (!container) return;
    
    container.innerHTML = `
      <div style="margin: 40px 0;">
        <div style="width: 300px; height: 150px; margin: 0 auto; position: relative; border: 3px solid white; border-radius: 10px; padding: 20px;">
          <div style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-size: 12px;">THROTTLE</div>
          <div id="throttle-lever" style="
            width: 60px;
            height: 100px;
            background: white;
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) rotate(-45deg);
            transform-origin: bottom center;
            transition: transform 2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            border-radius: 30px 30px 5px 5px;
          ">
            <div style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); color: #0000aa; font-weight: bold;">||||</div>
          </div>
          <div id="throttle-value" style="position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); font-size: 24px;">0%</div>
        </div>
      </div>
    `;
  }

  // Animate the throttle
  animateThrottle(start, end, duration, callback) {
    const lever = document.getElementById('throttle-lever');
    const value = document.getElementById('throttle-value');
    if (!lever || !value) return;
    
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for dramatic effect
      const easeProgress = this.easeOutBounce(progress);
      const currentValue = start + (end - start) * easeProgress;
      
      // Update lever rotation
      const rotation = -45 + (90 * easeProgress);
      lever.style.transform = `translateX(-50%) rotate(${rotation}deg) scale(${1 + easeProgress * 0.2})`;
      
      // Update percentage
      value.textContent = `${Math.floor(currentValue)}%`;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Slam effect
        lever.style.animation = 'throttle-slam 0.5s';
        if (callback) callback();
      }
    };
    
    animate();
  }

  // Bounce easing for throttle
  easeOutBounce(t) {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      t -= 1.5 / 2.75;
      return 7.5625 * t * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      t -= 2.25 / 2.75;
      return 7.5625 * t * t + 0.9375;
    } else {
      t -= 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }
  }

  // Show 100% degeneracy message
  showDegeneracyComplete() {
    const container = document.getElementById('throttle-container');
    if (container) {
      container.innerHTML += `
        <div style="margin-top: 30px; font-size: 36px; animation: bsod-flicker 0.5s;">
          DEGENERACY: <span style="color: #ff0000; text-shadow: 0 0 10px #ff0000;">100%</span>
        </div>
      `;
    }
  }

  // Show click prompt
  showClickPrompt() {
    this.updateBSODText("");
    const container = document.getElementById('throttle-container');
    if (container) {
      container.innerHTML = `
        <div style="font-size: 48px; margin: 50px 0; cursor: pointer;" id="click-prompt">
          *click*
        </div>
      `;
    }
  }

  // Flash screen effect
  flashScreen() {
    if (this.bsodOverlay) {
      this.bsodOverlay.style.animation = 'screen-flash 0.5s';
    }
  }

  // Execute maximum degeneracy trade
  executeMaxDegeneracyTrade(currentState) {
    if (!this.tradingBrain) return;
    
    console.log('🚀 EXECUTING MAXIMUM DEGENERACY TRADE');
    
    // Get current market data
    const { price, trend } = currentState;
    
    // Determine direction (follow the trend blindly)
    const direction = trend > 0 ? 'BUY' : 'SELL';
    
    // Calculate position size (maximum allowed)
    const normalSize = this.tradingBrain.calculatePositionSize();
    const degeneracySize = normalSize * this.config.maxPositionMultiplier;
    
    // Create trade parameters
    const tradeParams = {
      symbol: currentState.symbol,
      direction: direction,
      size: degeneracySize,
      entryPrice: price,
      stopLoss: this.config.removeStopLoss ? null : price * (direction === 'BUY' ? 0.95 : 1.05),
      takeProfit: price * (direction === 'BUY' ? 1.1 : 0.9), // 10% target
      reason: 'MAXIMUM_REGERTS_MODE',
      degeneracyLevel: 100,
      logicLevel: 0
    };
    
    // Emit trade signal
    this.emit('regerts-trade', tradeParams);
    
    // Log the madness
    console.log(`💀 REGERTS TRADE: ${direction} ${degeneracySize} units at ${price}`);
    console.log(`💀 Stop Loss: ${tradeParams.stopLoss || 'DISABLED (YOLO)'}`);
    console.log(`💀 Take Profit: ${tradeParams.takeProfit}`);
    
    // Voice confirmation
    this.voiceManager.play('bird_deployed');
  }

  // Freeze all inputs temporarily
  freezeInputs() {
    if (typeof document === 'undefined') return;
    
    document.body.style.pointerEvents = 'none';
    setTimeout(() => {
      document.body.style.pointerEvents = 'auto';
    }, this.config.freezeDuration);
  }

  // Remove BSOD overlay
  removeBSODOverlay() {
    if (this.bsodOverlay) {
      this.bsodOverlay.style.transition = 'opacity 1s';
      this.bsodOverlay.style.opacity = '0';
      
      setTimeout(() => {
        this.bsodOverlay.remove();
        this.bsodOverlay = null;
      }, 1000);
    }
  }

  // Show trade notification
  showTradeNotification() {
    if (typeof document === 'undefined') return;
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 102, 0.9);
      color: white;
      padding: 30px 50px;
      border-radius: 10px;
      font-size: 24px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 0 50px rgba(255, 0, 102, 0.8);
    `;
    
    notification.textContent = "Trade sent. Faith restored. IQ sacrificed.";
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.transition = 'opacity 2s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 2000);
    }, 3000);
  }

  // Add glitch effects to BSOD
  startGlitchEffects() {
    if (!this.bsodOverlay) return;
    
    const glitchInterval = setInterval(() => {
      if (!this.bsodOverlay) {
        clearInterval(glitchInterval);
        return;
      }
      
      // Random glitch
      if (Math.random() > 0.8) {
        this.bsodOverlay.style.transform = `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)`;
        setTimeout(() => {
          if (this.bsodOverlay) {
            this.bsodOverlay.style.transform = 'translate(0, 0)';
          }
        }, 50);
      }
    }, 100);
    
    // Stop glitching after BSOD phase
    setTimeout(() => clearInterval(glitchInterval), this.config.bsodDuration);
  }

  // Reset state
  reset() {
    this.isTriggered = false;
    this.throttleLevel = 0;
    this.removeBSODOverlay();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegertsFinalDescent;
}