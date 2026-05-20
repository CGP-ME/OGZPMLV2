// VoiceManager.js - The soul of OGZPrime
const { Howl, Howler } = require('howler');

class VoiceManager {
  constructor() {
    this.voices = {};
    this.voiceMap = {};
    this.isEnabled = true;
    this.volume = 0.8;
    this.currentlyPlaying = null;
    
    // Voice categories and their settings
    this.categories = {
      boot_intro: { volume: 1.0, priority: 1 },
      regerts_mode: { volume: 0.9, priority: 2 },
      trade_signals: { volume: 0.8, priority: 3 },
      commentary: { volume: 0.7, priority: 4 },
      overflow_sequence: { volume: 1.0, priority: 1 },
      final_descent: { volume: 1.0, priority: 1 }
    };
    
    // Initialize the voice map
    this.initializeVoiceMap();
  }

  // Initialize the voice line mappings
  initializeVoiceMap() {
    this.voiceMap = {
      // Boot sequence
      'system_boot': {
        file: 'boot_intro/system_boot.mp3',
        category: 'boot_intro',
        text: "OGZ Prime initializing. Stand by for market domination."
      },
      
      // Regerts Mode activation
      'regerts_mode_start': {
        file: 'regerts_mode/reason_systems_offline.mp3',
        category: 'regerts_mode',
        text: "Reason systems offline. Degeneracy core spooling. Prepare for regret."
      },
      
      // Degeneracy milestones
      'zero_logic': {
        file: 'regerts_mode/brain_activity_none.mp3',
        category: 'regerts_mode',
        text: "Brain activity detected: none."
      },
      
      'degeneracy_detected': {
        file: 'regerts_mode/degeneracy_detected.mp3',
        category: 'regerts_mode',
        text: "Degeneracy detected. Morality not found."
      },
      
      'emotional_trading': {
        file: 'regerts_mode/emotional_trading.mp3',
        category: 'regerts_mode',
        text: "You're emotionally trading. I respect that."
      },
      
      // Overflow sequence
      'overflow_valve_open': {
        file: 'overflow/regret_overflow_valve.mp3',
        category: 'overflow_sequence',
        text: "Regret overflow valve: open."
      },
      
      'goals_released': {
        file: 'overflow/goals_released.mp3',
        category: 'overflow_sequence',
        text: "GOALS: Released."
      },
      
      'aspirations_venting': {
        file: 'overflow/aspirations_venting.mp3',
        category: 'overflow_sequence',
        text: "ASPIRATIONS: Venting."
      },
      
      'responsibilities_purged': {
        file: 'overflow/responsibilities_purged.mp3',
        category: 'overflow_sequence',
        text: "RESPONSIBILITIES: Fully purged."
      },
      
      'follow_me_down': {
        file: 'overflow/follow_me_down.mp3',
        category: 'overflow_sequence',
        text: "Overflow complete. Follow me down.",
        effects: { rate: 0.8, reverb: true } // For that deep effect
      },
      
      // Nelly Furtado chopped & screwed
      'bird_descent': {
        file: 'overflow/bird_chopped.mp3',
        category: 'overflow_sequence',
        text: "I'm liiiike uh buuuhhhhrd... I'll only flyyyy awaaaayy...",
        effects: { rate: 0.6, pitch: -5, reverb: true }
      },
      
      // Final descent (99.9%)
      'gotcha_bitch': {
        file: 'final_descent/gotcha_bitch.mp3',
        category: 'final_descent',
        text: "GOTCHA, BITCH."
      },
      
      'throttle_out': {
        file: 'final_descent/throttle_out.mp3',
        category: 'final_descent',
        text: "When in doubt — throttle her out."
      },
      
      'negative_ghostrider': {
        file: 'final_descent/negative_ghostrider.mp3',
        category: 'final_descent',
        text: "Negative, Ghostrider. You are not clear for logic."
      },
      
      'click': {
        file: 'final_descent/click.mp3',
        category: 'final_descent',
        text: "*click*"
      },
      
      // Trade execution
      'trade_sent': {
        file: 'trade_signals/trade_sent.mp3',
        category: 'trade_signals',
        text: "Trade sent. Faith restored. IQ sacrificed."
      },
      
      'bird_deployed': {
        file: 'trade_signals/bird_deployed.mp3',
        category: 'trade_signals',
        text: "Bird deployed. Flight path: irreversible."
      },
      
      // Commentary
      'hot_patch': {
        file: 'commentary/hot_patch.mp3',
        category: 'commentary',
        text: "Biology isn't JavaScript. Stop trying to hot patch your hand."
      },
      
      'suture_needed': {
        file: 'commentary/suture_needed.mp3',
        category: 'commentary',
        text: "This wasn't a trade. This was a cry for help."
      },
      
      'i_warned_you': {
        file: 'commentary/i_warned_you.mp3',
        category: 'commentary',
        text: "I warned you."
      }
    };
  }

  // Load all voice files
  async loadVoices(voicePackPath = './voices/') {
    console.log('🎙️ Loading OGZPrime voice pack...');
    
    const loadPromises = Object.entries(this.voiceMap).map(([key, config]) => {
      return this.loadVoice(key, voicePackPath + config.file, config);
    });
    
    try {
      await Promise.all(loadPromises);
      console.log('✅ Voice pack loaded successfully');
      
      // Play boot sound
      this.play('system_boot');
    } catch (error) {
      console.error('❌ Error loading voice pack:', error);
    }
  }

  // Load individual voice file
  loadVoice(key, filepath, config) {
    return new Promise((resolve, reject) => {
      const howl = new Howl({
        src: [filepath],
        volume: this.volume * (this.categories[config.category]?.volume || 1),
        onload: () => {
          this.voices[key] = { howl, config };
          resolve();
        },
        onerror: (id, error) => {
          console.warn(`⚠️ Failed to load ${key}:`, error);
          // Don't reject - allow system to work with missing files
          resolve();
        }
      });
    });
  }

  // Play a voice line
  play(key, options = {}) {
    if (!this.isEnabled) return;
    
    const voice = this.voices[key];
    if (!voice) {
      console.warn(`Voice line not found: ${key}`);
      return;
    }
    
    // Check priority - don't interrupt higher priority sounds
    if (this.currentlyPlaying) {
      const currentPriority = this.categories[this.currentlyPlaying.config.category]?.priority || 999;
      const newPriority = this.categories[voice.config.category]?.priority || 999;
      
      if (newPriority > currentPriority) {
        return; // Don't play lower priority sounds
      }
    }
    
    // Apply effects if specified
    if (voice.config.effects) {
      if (voice.config.effects.rate) {
        voice.howl.rate(voice.config.effects.rate);
      }
    }
    
    // Stop current sound if needed
    if (this.currentlyPlaying && options.interrupt !== false) {
      this.currentlyPlaying.howl.stop();
    }
    
    // Play the sound
    this.currentlyPlaying = voice;
    voice.howl.play();
    
    // Log for debugging
    console.log(`🔊 ${voice.config.text}`);
    
    // Clear current when done
    voice.howl.once('end', () => {
      if (this.currentlyPlaying === voice) {
        this.currentlyPlaying = null;
      }
    });
  }

  // Play a sequence of voice lines
  async playSequence(keys, delay = 1000) {
    for (const key of keys) {
      this.play(key);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Special effect: Chopped & screwed audio
  applyChoppedAndScrewed(howl) {
    // This would require Web Audio API for real-time effects
    // For now, we'll use pre-processed files
    howl.rate(0.6); // Slow it down
    // In production, you'd use Web Audio API filters for the full effect
  }

  // Stop all sounds
  stopAll() {
    Howler.stop();
    this.currentlyPlaying = null;
  }

  // Set volume
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    Howler.volume(this.volume);
  }

  // Toggle voice
  toggle() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled) {
      this.stopAll();
    }
    return this.isEnabled;
  }

  // Get a random voice line from a category
  playRandom(category) {
    const categoryVoices = Object.entries(this.voices)
      .filter(([key, voice]) => voice.config.category === category)
      .map(([key]) => key);
    
    if (categoryVoices.length > 0) {
      const randomKey = categoryVoices[Math.floor(Math.random() * categoryVoices.length)];
      this.play(randomKey);
    }
  }

  // Create Web Audio context for advanced effects (optional enhancement)
  initializeWebAudio() {
    if (typeof window !== 'undefined' && window.AudioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create effects chain
      this.effects = {
        reverb: this.createReverb(),
        distortion: this.createDistortion(),
        filter: this.createFilter()
      };
    }
  }

  // Create reverb effect
  createReverb() {
    if (!this.audioContext) return null;
    
    const convolver = this.audioContext.createConvolver();
    // You'd load an impulse response here for real reverb
    return convolver;
  }

  // Create distortion for that degraded feel
  createDistortion() {
    if (!this.audioContext) return null;
    
    const waveshaper = this.audioContext.createWaveShaper();
    const curve = new Float32Array(256);
    
    for (let i = 0; i < 256; i++) {
      const x = (i - 128) / 128;
      curve[i] = Math.tanh(x * 5); // Heavy distortion
    }
    
    waveshaper.curve = curve;
    return waveshaper;
  }

  // Create filter for the chopped & screwed effect
  createFilter() {
    if (!this.audioContext) return null;
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800; // Dark, muffled sound
    filter.Q.value = 1;
    
    return filter;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceManager;
}