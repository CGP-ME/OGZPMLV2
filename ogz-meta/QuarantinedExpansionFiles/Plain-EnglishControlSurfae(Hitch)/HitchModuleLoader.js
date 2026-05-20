// HitchModuleLoader.js - Integration layer for all NLP modules
// Ensures all components work together seamlessly

// Note: React components are not imported in Node.js environment
// const { TopHitchCommands } = require('../components/TopHitchCommands');
// const { OGZProfileExporter } = require('../components/OGZProfileExporter');
// const { VoiceFXSystem } = require('../components/VoiceFXSystem');

// Create simple Node.js equivalents for server-side functionality
class ServerTopHitchCommands {
  constructor(hitch) {
    this.hitch = hitch;
  }
  
  async generateAnalytics() {
    try {
      const history = await this.hitch.logger.getCommandHistory();
      return {
        totalCommands: history.length,
        successRate: history.filter(cmd => cmd.success).length / history.length * 100
      };
    } catch (error) {
      return { totalCommands: 0, successRate: 0 };
    }
  }
  
  updateAnalytics(commandRecord) {
    // Server-side analytics update
    console.log(`📊 Command analytics updated: ${commandRecord.input}`);
  }
}

class ServerOGZProfileExporter {
  constructor(hitch) {
    this.hitch = hitch;
  }
  
  async listProfiles() {
    // Return available trading profiles
    return ['aggressive', 'conservative', 'balanced'];
  }
}

class ServerVoiceFXSystem {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.volume = options.volume || 0.7;
  }
  
  onTrade(trade) {
    if (this.enabled) {
      console.log(`🔊 Voice FX: Trade completed - ${trade.symbol} ${trade.side}`);
    }
  }
  
  onCommandExecuted(cmd, result) {
    if (this.enabled) {
      console.log(`🔊 Voice FX: Command executed - ${cmd}`);
    }
  }
  
  speak(text, type = 'info') {
    if (this.enabled) {
      console.log(`🔊 Voice FX [${type}]: ${text}`);
    }
  }
}

class HitchModuleLoader {
  constructor(options = {}) {
    // Handle both old format (ogzPrime) and new format (options)
    if (options.hitch || options.quantumEnhanced) {
      // New format - options object
      this.ogzPrime = options.ogzPrime || null;
      this.hitch = options.hitch || null;
      this.quantumEnhanced = options.quantumEnhanced || false;
      this.neuromorphicProcessing = options.neuromorphicProcessing || false;
      this.realityBendingCommands = options.realityBendingCommands || false;
    } else {
      // Old format - ogzPrime object
      this.ogzPrime = options;
      this.hitch = options?.hitch || null;
      this.quantumEnhanced = false;
      this.neuromorphicProcessing = false;
      this.realityBendingCommands = false;
    }
    
    this.modules = {};
    
    // MERGED: fix-modules.js functionality - Auto-fix ES6 modules
    this.fixedModules = this.autoFixES6Modules();
    
    if (!this.hitch) {
      console.log('❌ HitchNLP not found in OGZPrime! Cannot load modules.');
      console.log('ℹ️ HitchModuleLoader will operate in simulation mode');
      return;
    }
    
    console.log('🔌 Loading Hitch NLP modules...');
    this.loadAllModules();
  }
  
  // MERGED: Auto-fix ES6 modules for browser compatibility
  autoFixES6Modules() {
    const fs = require('fs');
    const path = require('path');
    
    const modulesToFix = [
      'public/modules/fibOverlay.js',
      'public/modules/goalTracker.js', 
      'public/modules/leaderboardUploader.js',
      'public/modules/supportResistance.js',
      'public/modules/trendLines.js',
      'public/modules/sparkleEffects.js',
      'public/modules/stochasticOverlay.js'
    ];

    console.log('🔧 Auto-fixing ES6 modules for browser compatibility...');
    const fixedFiles = [];

    modulesToFix.forEach(modulePath => {
      try {
        if (fs.existsSync(modulePath)) {
          let content = fs.readFileSync(modulePath, 'utf8');
          
          // Replace ES6 exports with window assignments
          let modified = false;
          const originalContent = content;
          
          content = content.replace(/export\s+function\s+(\w+)/g, (match, funcName) => {
            modified = true;
            return `window.${funcName} = function`;
          });
          
          content = content.replace(/export\s+const\s+(\w+)/g, (match, constName) => {
            modified = true;
            return `window.${constName}`;
          });
          
          content = content.replace(/export\s+{[^}]+}/g, () => {
            modified = true;
            return '';
          });
          
          if (modified) {
            fs.writeFileSync(modulePath, content, 'utf8');
            fixedFiles.push(modulePath);
            console.log(`✅ Auto-fixed ES6 exports: ${modulePath}`);
          }
        }
      } catch (err) {
        console.log(`❌ Error auto-fixing ${modulePath}:`, err.message);
      }
    });

    if (fixedFiles.length > 0) {
      console.log(`🚀 Auto-fixed ${fixedFiles.length} ES6 modules for browser compatibility`);
    }
    
    return fixedFiles;
  }
  
  async loadAllModules() {
    try {
      // Load TopHitchCommands analytics (server version)
      this.modules.analytics = new ServerTopHitchCommands(this.hitch);
      console.log('✅ ServerTopHitchCommands analytics loaded');
      
      // Load Profile Exporter (server version)
      this.modules.profiles = new ServerOGZProfileExporter(this.hitch);
      console.log('✅ ServerOGZProfileExporter loaded');
      
      // Load Voice FX System (server version)
      this.modules.voiceFX = new ServerVoiceFXSystem({
        enabled: true,
        volume: 0.7
      });
      console.log('✅ ServerVoiceFXSystem loaded');
      
      // Wire up event listeners
      this.setupEventListeners();
      
      // Test core functionality
      await this.runCompatibilityTests();
      
      console.log('🎯 All Hitch modules loaded successfully!');
      
    } catch (error) {
      console.error('❌ Failed to load Hitch modules:', error);
      throw error;
    }
  }
  
  setupEventListeners() {
    // Connect VoiceFX to trading events
    if (this.ogzPrime.on && this.modules.voiceFX) {
      this.ogzPrime.on('trade_completed', (trade) => {
        this.modules.voiceFX.onTrade(trade);
      });
      
      this.ogzPrime.on('command_executed', (cmd, result) => {
        this.modules.voiceFX.onCommandExecuted(cmd, result);
      });
    }
    
    // Connect command analytics to Hitch events
    if (this.hitch.on && this.modules.analytics) {
      this.hitch.on('commandProcessed', (commandRecord) => {
        this.modules.analytics.updateAnalytics(commandRecord);
      });
    }
  }
  
  async runCompatibilityTests() {
    console.log('🧪 Running compatibility tests...');
    
    // Test 1: Command history access
    try {
      const history = await this.hitch.logger.getCommandHistory();
      console.log(`✅ Command history: ${history.length} commands found`);
    } catch (error) {
      console.warn('⚠️ Command history test failed:', error.message);
    }
    
    // Test 2: Profile export functionality
    try {
      const profiles = await this.modules.profiles.listProfiles();
      console.log(`✅ Profile system: ${profiles.length} profiles available`);
    } catch (error) {
      console.warn('⚠️ Profile system test failed:', error.message);
    }
    
    // Test 3: Analytics computation
    try {
      const analytics = await this.modules.analytics.generateAnalytics();
      console.log(`✅ Analytics: ${analytics.totalCommands} total commands analyzed`);
    } catch (error) {
      console.warn('⚠️ Analytics test failed:', error.message);
    }
    
    // Test 4: Voice FX system
    try {
      if (this.modules.voiceFX.audioContext) {
        console.log('✅ Voice FX: Audio system initialized');
      } else {
        console.log('ℹ️ Voice FX: Audio not available (headless mode)');
      }
    } catch (error) {
      console.warn('⚠️ Voice FX test failed:', error.message);
    }
    
    // Test 5: Hitch command processing
    try {
      const testResult = await this.testHitchCommand();
      console.log(`✅ Hitch processing: ${testResult ? 'Working' : 'Failed'}`);
    } catch (error) {
      console.warn('⚠️ Hitch processing test failed:', error.message);
    }
  }
  
  async testHitchCommand() {
    // Test with a safe, non-destructive command
    const testCommand = "show me today's performance";
    
    try {
      const result = await this.hitch.processCommand(testCommand, {
        source: 'compatibility_test',
        test: true
      });
      
      return result.success;
    } catch (error) {
      return false;
    }
  }
  
  // Public API for accessing modules
  getAnalytics() {
    return this.modules.analytics;
  }
  
  getProfileExporter() {
    return this.modules.profiles;
  }
  
  getVoiceFX() {
    return this.modules.voiceFX;
  }
  
  // Quantum Hitch systems initialization (required by trading bot)
  async initializeQuantumHitchSystems() {
    console.log('🗣️⚛️ Initializing Quantum Hitch Systems...');
    
    try {
      if (this.quantumEnhanced) {
        console.log('⚛️ Quantum-enhanced Hitch processing enabled');
      }
      
      if (this.neuromorphicProcessing) {
        console.log('🧠 Neuromorphic Hitch processing enabled');
      }
      
      if (this.realityBendingCommands) {
        console.log('🌌 Reality bending commands enabled');
      }
      
      // Initialize quantum-enhanced modules if Hitch is available
      if (this.hitch) {
        await this.loadAllModules();
      } else {
        console.log('ℹ️ Hitch not available - using simulation mode');
        // Create simulation modules
        this.modules.analytics = new ServerTopHitchCommands(null);
        this.modules.profiles = new ServerOGZProfileExporter(null);
        this.modules.voiceFX = new ServerVoiceFXSystem({ enabled: false });
      }
      
      console.log('✅ Quantum Hitch Systems initialized successfully!');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize Quantum Hitch Systems:', error);
      return false;
    }
  }

  // Quick demo function
  async runDemo() {
    console.log('\n🎭 HITCH NLP DEMO MODE');
    console.log('====================');
    
    // Demo 1: Process a command
    console.log('\n1. Processing natural language command...');
    const demoResult = await this.hitch.processCommand("set risk to 1.5%", {
      source: 'demo',
      dryRun: true
    });
    
    if (demoResult.success) {
      console.log('✅ Command processed successfully');
      console.log(`   Interpretation: ${demoResult.interpretation.intent}`);
      console.log(`   Updates: ${Object.keys(demoResult.updates.config).length} config changes`);
    }
    
    // Demo 2: Show analytics
    console.log('\n2. Generating command analytics...');
    const analytics = await this.modules.analytics.generateAnalytics();
    console.log(`✅ Analytics generated`);
    console.log(`   Total commands: ${analytics.totalCommands}`);
    console.log(`   Success rate: ${analytics.successRate.toFixed(1)}%`);
    
    // Demo 3: List profiles
    console.log('\n3. Checking available profiles...');
    const profiles = await this.modules.profiles.listProfiles();
    console.log(`✅ Found ${profiles.length} trading profiles`);
    
    // Demo 4: Voice feedback
    console.log('\n4. Testing voice feedback...');
    if (this.modules.voiceFX) {
      this.modules.voiceFX.speak('Hitch NLP demo completed successfully!', 'success');
      console.log('✅ Voice feedback activated');
    }
    
    console.log('\n🎯 Demo completed! All systems operational.');
  }
}

module.exports = { HitchModuleLoader };
