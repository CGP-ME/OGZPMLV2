// lostHopesUI.js - The legendary No Raegerts Mode UI
class LostHopesUI {
  constructor() {
    this.logicLevel = 100;
    this.degeneracyLevel = 0;
    this.isActive = false;
    this.meterInterval = null;
    this.flickerInterval = null;
    this.startTime = null;
    this.voiceManager = null; // Will be injected
    this.onFinalDescent = null; // Callback for 99.9% trigger
  }

  // Initialize the UI elements
  init(container) {
    this.container = container || document.body;
    this.createUI();
    this.attachStyles();
  }

  // Create the dual-meter system
  createUI() {
    this.uiElement = document.createElement('div');
    this.uiElement.id = 'lost-hopes-ui';
    this.uiElement.className = 'lost-hopes-container hidden';
    
    this.uiElement.innerHTML = `
      <div class="lost-hopes-sign">
        <div class="neon-text" data-text="LOST HOPES & DREAMS">
          LOST HOPES & DREAMS
        </div>
      </div>
      
      <div class="meters-container">
        <div class="meter-wrapper">
          <label class="meter-label">LOGIC</label>
          <div class="meter logic-meter">
            <div class="meter-fill logic-fill"></div>
            <span class="meter-value logic-value">100%</span>
          </div>
        </div>
        
        <div class="meter-wrapper">
          <label class="meter-label">DEGENERACY</label>
          <div class="meter degeneracy-meter">
            <div class="meter-fill degeneracy-fill"></div>
            <span class="meter-value degeneracy-value">0%</span>
          </div>
        </div>
      </div>
      
      <div class="regerts-timer hidden">
        Time in Regerts Mode: <span class="timer-value">00:00</span>
      </div>
      
      <div class="degeneracy-messages"></div>
    `;
    
    this.container.appendChild(this.uiElement);
    
    // Cache DOM references
    this.elements = {
      container: this.uiElement,
      logicFill: this.uiElement.querySelector('.logic-fill'),
      logicValue: this.uiElement.querySelector('.logic-value'),
      degeneracyFill: this.uiElement.querySelector('.degeneracy-fill'),
      degeneracyValue: this.uiElement.querySelector('.degeneracy-value'),
      timer: this.uiElement.querySelector('.regerts-timer'),
      timerValue: this.uiElement.querySelector('.timer-value'),
      messages: this.uiElement.querySelector('.degeneracy-messages'),
      neonSign: this.uiElement.querySelector('.neon-text')
    };
  }

  // Inject the CSS styles
  attachStyles() {
    if (document.getElementById('lost-hopes-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'lost-hopes-styles';
    style.textContent = `
      .lost-hopes-container {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid #ff0066;
        border-radius: 10px;
        padding: 20px;
        min-width: 300px;
        z-index: 10000;
        font-family: 'Courier New', monospace;
        box-shadow: 0 0 30px rgba(255, 0, 102, 0.5);
        transition: all 0.3s ease;
      }
      
      .lost-hopes-container.hidden {
        display: none;
      }
      
      .lost-hopes-sign {
        text-align: center;
        margin-bottom: 20px;
        position: relative;
      }
      
      .neon-text {
        font-size: 18px;
        font-weight: bold;
        color: #ff0066;
        text-shadow: 
          0 0 10px #ff0066,
          0 0 20px #ff0066,
          0 0 30px #ff0066,
          0 0 40px #ff0066;
        animation: neon-flicker 2s infinite alternate;
        letter-spacing: 2px;
      }
      
      @keyframes neon-flicker {
        0%, 100% { opacity: 1; }
        33% { opacity: 0.8; }
        66% { opacity: 0.9; }
      }
      
      .meters-container {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      
      .meter-wrapper {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .meter-label {
        color: #00ff00;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .meter {
        width: 100%;
        height: 30px;
        background: #111;
        border: 1px solid #333;
        position: relative;
        overflow: hidden;
        border-radius: 3px;
      }
      
      .meter-fill {
        height: 100%;
        transition: width 0.5s ease;
        position: absolute;
        left: 0;
        top: 0;
      }
      
      .logic-fill {
        background: linear-gradient(90deg, #00ff00, #00aa00);
        box-shadow: 0 0 10px #00ff00;
        width: 100%;
      }
      
      .degeneracy-fill {
        background: linear-gradient(90deg, #ff0066, #cc0052);
        box-shadow: 0 0 10px #ff0066;
        width: 0%;
      }
      
      .meter-value {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: #fff;
        font-size: 14px;
        font-weight: bold;
        text-shadow: 0 0 5px rgba(0, 0, 0, 0.8);
      }
      
      .regerts-timer {
        margin-top: 15px;
        color: #ff9900;
        font-size: 12px;
        text-align: center;
      }
      
      .degeneracy-messages {
        margin-top: 15px;
        color: #ff0066;
        font-size: 11px;
        text-align: center;
        min-height: 20px;
        font-style: italic;
      }
      
      /* BSOD Mode at 99.9% */
      .lost-hopes-container.bsod-mode {
        background: #0000aa;
        border-color: #ffffff;
        width: 80%;
        height: 60%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      }
      
      .bsod-content {
        color: #ffffff;
        text-align: center;
        font-family: 'Lucida Console', monospace;
      }
      
      .bsod-title {
        background: #ffffff;
        color: #0000aa;
        padding: 5px 20px;
        margin-bottom: 20px;
      }
      
      .throttle-visual {
        width: 200px;
        height: 100px;
        margin: 20px auto;
        position: relative;
      }
      
      @keyframes throttle-slam {
        0% { transform: rotate(-45deg); }
        100% { transform: rotate(45deg); }
      }
    `;
    
    document.head.appendChild(style);
  }

  // Activate No Raegerts Mode
  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.startTime = Date.now();
    this.logicLevel = 100;
    this.degeneracyLevel = 0;
    
    this.elements.container.classList.remove('hidden');
    
    // Start the meter animations
    this.startMeterDecay();
    this.startFlicker();
    this.startTimer();
    
    // Initial voice line
    if (this.voiceManager) {
      this.voiceManager.play('regerts_mode_start');
    }
    
    this.showMessage("Reason systems offline. Degeneracy core spooling...");
  }

  // Deactivate the mode
  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.elements.container.classList.add('hidden');
    
    clearInterval(this.meterInterval);
    clearInterval(this.flickerInterval);
    clearInterval(this.timerInterval);
    
    // Reset meters
    this.updateMeters(100, 0);
  }

  // Start the logic decay and degeneracy increase
  startMeterDecay() {
    this.meterInterval = setInterval(() => {
      if (!this.isActive) return;
      
      // Logic depletes faster the longer you're in the mode
      const timeInMode = (Date.now() - this.startTime) / 1000;
      const decayRate = Math.min(0.5 + (timeInMode / 60), 2);
      
      this.logicLevel = Math.max(0, this.logicLevel - decayRate);
      this.degeneracyLevel = Math.min(100, this.degeneracyLevel + (decayRate * 1.5));
      
      this.updateMeters(this.logicLevel, this.degeneracyLevel);
      
      // Check for milestone triggers
      this.checkMilestones();
      
    }, 100); // Update every 100ms for smooth animation
  }

  // Update meter displays
  updateMeters(logic, degeneracy) {
    this.elements.logicFill.style.width = `${logic}%`;
    this.elements.logicValue.textContent = `${Math.floor(logic)}%`;
    
    this.elements.degeneracyFill.style.width = `${degeneracy}%`;
    this.elements.degeneracyValue.textContent = `${Math.floor(degeneracy)}%`;
  }

  // Check for voice line triggers
  checkMilestones() {
    // At 0% logic
    if (this.logicLevel <= 0 && !this.triggeredZeroLogic) {
      this.triggeredZeroLogic = true;
      this.showMessage("Brain activity detected: none.");
      if (this.voiceManager) {
        this.voiceManager.play('zero_logic');
      }
    }
    
    // At 50% degeneracy
    if (this.degeneracyLevel >= 50 && !this.triggered50Degeneracy) {
      this.triggered50Degeneracy = true;
      this.showMessage("Degeneracy detected. Morality not found.");
      if (this.voiceManager) {
        this.voiceManager.play('degeneracy_detected');
      }
    }
    
    // At 75% degeneracy - overflow valve
    if (this.degeneracyLevel >= 75 && !this.triggered75Degeneracy) {
      this.triggered75Degeneracy = true;
      this.triggerOverflowSequence();
    }
    
    // At 99.9% - FINAL DESCENT
    if (this.degeneracyLevel >= 99.9 && !this.triggeredFinalDescent) {
      this.triggeredFinalDescent = true;
      this.triggerFinalDescent();
    }
  }

  // Trigger the overflow valve sequence
  triggerOverflowSequence() {
    this.showMessage("REGRET OVERFLOW VALVE: CRACKED");
    
    if (this.voiceManager) {
      // Play the sequence with delays
      this.voiceManager.play('overflow_valve_open');
      
      setTimeout(() => {
        this.showMessage("GOALS: Released.");
        this.voiceManager.play('goals_released');
      }, 1000);
      
      setTimeout(() => {
        this.showMessage("ASPIRATIONS: Venting.");
        this.voiceManager.play('aspirations_venting');
      }, 2000);
      
      setTimeout(() => {
        this.showMessage("RESPONSIBILITIES: Fully purged.");
        this.voiceManager.play('responsibilities_purged');
      }, 3000);
      
      setTimeout(() => {
        this.showMessage("Overflow complete. Follow me down.");
        this.voiceManager.play('follow_me_down');
      }, 4000);
    }
  }

  // THE BIG ONE - 99.9% BSOD trigger
  triggerFinalDescent() {
    // Notify external handler
    if (this.onFinalDescent) {
      this.onFinalDescent();
    }
    
    // Transform UI to BSOD
    this.elements.container.className = 'lost-hopes-container bsod-mode';
    this.elements.container.innerHTML = `
      <div class="bsod-content">
        <div class="bsod-title">OGZPrime SYSTEM FAILURE</div>
        <p>Code: 0xDEGENERATE</p>
        <h2>GOTCHA, BITCH.</h2>
        <p>You were *praying* this would happen. Don't lie to me.</p>
        <br>
        <p>What we have here, boys, is a good old fashioned:</p>
        <h3>"WHEN IN DOUBT — THROTTLE HER OUT."</h3>
        
        <div class="throttle-visual">
          <div class="throttle-lever">⬆️</div>
        </div>
        
        <p>DEGENERACY: 100%</p>
        <p style="font-size: 10px; margin-top: 20px;">
          "Negative, Ghostrider. You are not clear for logic."
        </p>
        <p style="font-size: 20px; margin-top: 10px;">*click*</p>
      </div>
    `;
    
    // Play the final sequence
    if (this.voiceManager) {
      this.voiceManager.play('gotcha_bitch');
      setTimeout(() => this.voiceManager.play('throttle_out'), 2000);
      setTimeout(() => this.voiceManager.play('negative_ghostrider'), 4000);
      setTimeout(() => this.voiceManager.play('click'), 6000);
    }
  }

  // Show temporary messages
  showMessage(text) {
    this.elements.messages.textContent = text;
    setTimeout(() => {
      if (this.elements.messages.textContent === text) {
        this.elements.messages.textContent = '';
      }
    }, 5000);
  }

  // Start the timer
  startTimer() {
    this.timerInterval = setInterval(() => {
      if (!this.isActive) return;
      
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      this.elements.timerValue.textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      this.elements.timer.classList.remove('hidden');
    }, 1000);
  }

  // Neon flicker effect
  startFlicker() {
    this.flickerInterval = setInterval(() => {
      if (Math.random() > 0.9) {
        this.elements.neonSign.style.opacity = '0.7';
        setTimeout(() => {
          this.elements.neonSign.style.opacity = '1';
        }, 100);
      }
    }, 200);
  }

  // Get current state
  getState() {
    return {
      isActive: this.isActive,
      logicLevel: this.logicLevel,
      degeneracyLevel: this.degeneracyLevel,
      timeInMode: this.isActive ? (Date.now() - this.startTime) / 1000 : 0
    };
  }

  // Inject dependencies
  setVoiceManager(voiceManager) {
    this.voiceManager = voiceManager;
  }

  // External trigger for trades
  onTradeExecuted() {
    if (!this.isActive) return;
    
    // Each trade increases degeneracy faster
    this.degeneracyLevel = Math.min(100, this.degeneracyLevel + 5);
    this.updateMeters(this.logicLevel, this.degeneracyLevel);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LostHopesUI;
}