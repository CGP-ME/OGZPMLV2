/**
 * @fileoverview ModuleAutoLoader - Automatic Path Resolution & Module Loading
 *
 * The "Path Master" for OGZ Prime - automatically resolves paths and loads
 * modules regardless of where code is executed from.
 *
 * @description
 * ARCHITECTURE ROLE:
 * ModuleAutoLoader eliminates all relative path headaches. Instead of fragile
 * paths like `require('../../utils/tradeLogger')`, use `loader.get('tradeLogger')`.
 *
 * WHY THIS EXISTS:
 * OGZ Prime has modules in many directories (core/, utils/, tools/, public/).
 * Relative paths break when:
 * - Files are moved
 * - Code is called from different entry points
 * - Tests run from different directories
 *
 * PATH RESOLUTION:
 * ```
 * loader.get('StateManager')  → /opt/ogzprime/OGZPMLV2/core/StateManager.js
 * loader.get('tradeLogger')   → /opt/ogzprime/OGZPMLV2/utils/tradeLogger.js
 * loader.getPath('data')      → /opt/ogzprime/OGZPMLV2/data/
 * ```
 *
 * PROJECT ROOT DETECTION:
 * Automatically finds project root by walking up from __dirname looking for
 * package.json or OGZPrimeV10.2.js.
 *
 * CACHING:
 * Loaded modules are cached to prevent duplicate require() calls.
 *
 * @module core/ModuleAutoLoader
 * @requires fs
 * @requires path
 *
 * @example
 * const loader = require('./core/ModuleAutoLoader');
 *
 * // Load all modules at startup
 * loader.loadAll();
 *
 * // Get a module by name
 * const StateManager = loader.get('StateManager');
 * const stateManager = StateManager.getInstance();
 *
 * // Get a path
 * const dataDir = loader.getPath('data');
 * const logsDir = loader.getPath('logs');
 */

// The Path Master for OGZ Prime Valhalla Edition

const fs = require('fs');
const path = require('path');

class ModuleAutoLoader {
  constructor() {
    // Auto-detect base path (works from any location)
    this.basePath = this.findProjectRoot();
    this.modules = {};
    this.paths = {};
    this.cache = new Map();
    
    console.log('🔧 Module Auto-Loader initializing...');
    console.log(`📁 Project root: ${this.basePath}`);
    
    // Setup all paths
    this.setupPaths();
  }
  
  // Find project root by looking for package.json or specific files
  findProjectRoot(startPath = __dirname) {
    let currentPath = startPath;
    
    while (currentPath !== path.parse(currentPath).root) {
      // Check if we found the project root
      if (fs.existsSync(path.join(currentPath, 'OGZPrimeV10.2.js')) ||
          fs.existsSync(path.join(currentPath, 'package.json'))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }
    
    // Fallback to current directory
    return process.cwd();
  }
  
  setupPaths() {
    // Define ALL project paths - your complete map!
    this.paths = {
      // Core directories
      root: this.basePath,
      core: path.join(this.basePath, 'core'),
      public: path.join(this.basePath, 'public'),
      modules: path.join(this.basePath, 'public', 'modules'),
      utils: path.join(this.basePath, 'utils'),
      data: path.join(this.basePath, 'data'),
      tools: path.join(this.basePath, 'tools'),
      
      // New directories
      ui: path.join(this.basePath, 'ui'),
      analytics: path.join(this.basePath, 'analytics'),
      deployment: path.join(this.basePath, 'deployment'),
      mobile: path.join(this.basePath, 'mobile'),
      streamdeck: path.join(this.basePath, 'streamdeck'),
      monetization: path.join(this.basePath, 'monetization'),
      
      // Data subdirectories
      patterns: path.join(this.basePath, 'data', 'patterns'),
      samples: path.join(this.basePath, 'data', 'samples'),
      backtestResults: path.join(this.basePath, 'data', 'backtest-results'),
      
      // Log directories
      logs: path.join(this.basePath, 'utils', 'logs'),
      tradeLogs: path.join(this.basePath, 'utils', 'logs', 'trades'),
      patternLogs: path.join(this.basePath, 'utils', 'logs', 'patterns'),
      rejectionLogs: path.join(this.basePath, 'utils', 'logs', 'rejections'),
      
      // Output directories
      output: path.join(this.basePath, 'output'),
      charts: path.join(this.basePath, 'output', 'charts'),
      
      // Config directories
      profiles: path.join(this.basePath, 'profiles'),
      config: path.join(this.basePath, 'config')
    };
  }
  
  // Auto-load all modules from a directory
  loadDirectory(dirName, options = {}) {
    const {
      filter = '.js',
      recursive = false,
      exclude = ['test-', 'backup-', '.test.'],
      required = []
    } = options;
    
    const dirPath = this.paths[dirName] || path.join(this.basePath, dirName);
    const loaded = {};
    
    if (!fs.existsSync(dirPath)) {
      console.warn(`⚠️ Directory not found: ${dirName} (${dirPath})`);
      return loaded;
    }
    
    try {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        // Check exclusions
        const shouldExclude = exclude.some(ex => file.includes(ex));
        if (shouldExclude) return;
        
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        // Handle directories if recursive
        if (stat.isDirectory() && recursive) {
          loaded[file] = this.loadDirectory(fullPath, options);
          return;
        }
        
        // Load JS files
        if (file.endsWith(filter)) {
          const moduleName = file.replace(filter, '');
          
          try {
            // Check cache first
            if (this.cache.has(fullPath)) {
              loaded[moduleName] = this.cache.get(fullPath);
            } else {
              const module = require(fullPath);
              loaded[moduleName] = module;
              this.cache.set(fullPath, module);
            }
            
            console.log(`  ✅ ${moduleName}`);
          } catch (err) {
            console.error(`  ❌ ${moduleName}: ${err.message}`);
            
            // Check if it's a required module
            if (required.includes(moduleName)) {
              const requiredError = new Error(`Required module failed to load: ${moduleName}`);
              requiredError.code = 'REQUIRED_MODULE_LOAD_FAILED';
              requiredError.cause = err;
              throw requiredError;
            }
          }
        }
      });
      
      this.modules[dirName] = loaded;
      console.log(`📦 Loaded ${Object.keys(loaded).length} modules from ${dirName}\n`);
      
      return loaded;
    } catch (err) {
      console.error(`❌ Failed to load directory ${dirName}:`, err.message);
      if (err.code === 'REQUIRED_MODULE_LOAD_FAILED') {
        throw err;
      }
      return {};
    }
  }
  
  // Get a specific module
  get(category, moduleName) {
    // Try direct access first
    if (this.modules[category]?.[moduleName]) {
      return this.modules[category][moduleName];
    }
    
    // Try to load if not already loaded
    if (!this.modules[category]) {
      this.loadDirectory(category);
    }
    
    return this.modules[category]?.[moduleName];
  }
  
  // Get path to any location
  getPath(location, ...subPaths) {
    const basePath = this.paths[location] || this.basePath;
    return path.join(basePath, ...subPaths);
  }
  
  // Create a require function that uses project paths
  require(modulePath) {
    // Check cache first
    if (this.cache.has(modulePath)) {
      return this.cache.get(modulePath);
    }

    // Handle special prefixes
    let resolvedPath = modulePath;
    if (modulePath.startsWith('@core/')) {
      resolvedPath = path.join(this.paths.core, modulePath.slice(6));
    } else if (modulePath.startsWith('@utils/')) {
      resolvedPath = path.join(this.paths.utils, modulePath.slice(7));
    } else if (modulePath.startsWith('@/')) {
      resolvedPath = path.join(this.basePath, modulePath.slice(2));
    }

    // Load and cache the module instance
    const moduleInstance = require(resolvedPath);
    this.cache.set(modulePath, moduleInstance);

    return moduleInstance;
  }
  
  // Load all core modules at once
  loadAll() {
    console.log('🚀 AUTO-LOADING ALL MODULES...\n');
    
    // Define loading order and requirements
    // CHANGE 2026-01-31: Removed ui, analytics, deployment - directories never existed
    const loadConfig = [
      { name: 'utils', required: ['discordNotifier', 'tradeLogger'] },
      { name: 'core', required: ['RiskManager'] }
    ];
    
    loadConfig.forEach(({ name, required }) => {
      console.log(`📁 Loading ${name}...`);
      this.loadDirectory(name, { required });
    });

    this.validateModules(Object.fromEntries(
      loadConfig.map(({ name, required }) => [name, required])
    ));
    console.log(`📊 Total modules: ${this.cache.size}`);
    
    return this.modules;
  }
  
  // Check if all required modules are present
  validateModules(requirements = {}) {
    const missing = [];
    const validated = [];
    
    Object.entries(requirements).forEach(([category, modules]) => {
      modules.forEach(moduleName => {
        if (!this.get(category, moduleName)) {
          missing.push(`${category}/${moduleName}`);
        } else {
          validated.push(`${category}/${moduleName}`);
        }
      });
    });
    
    if (missing.length > 0) {
      throw new Error(`Missing required modules: ${missing.join(', ')}`);
    }
    
    console.log('\nALL REQUIRED MODULES VALIDATED:');
    validated.forEach(moduleName => console.log(`  ${moduleName}`));
    return true;
  }
  
  // Get module stats
  getStats() {
    const stats = {
      totalModules: this.cache.size,
      categories: {},
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
    };
    
    Object.entries(this.modules).forEach(([category, modules]) => {
      stats.categories[category] = Object.keys(modules).length;
    });
    
    return stats;
  }
  
  // Clear cache (useful for development)
  clearCache() {
    this.cache.clear();
    this.modules = {};
    
    // Clear require cache too
    Object.keys(require.cache).forEach(key => {
      if (key.includes(this.basePath)) {
        delete require.cache[key];
      }
    });
    
    console.log('🧹 Module cache cleared!');
  }
  
  // Create directory if it doesn't exist
  ensureDirectory(dirName) {
    const dirPath = this.paths[dirName] || path.join(this.basePath, dirName);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dirPath}`);
    }
    
    return dirPath;
  }
  
  // List all available modules
  listModules() {
    console.log('\n📚 AVAILABLE MODULES:\n');
    
    Object.entries(this.modules).forEach(([category, modules]) => {
      console.log(`${category.toUpperCase()}:`);
      Object.keys(modules).forEach(name => {
        console.log(`  - ${name}`);
      });
      console.log('');
    });
  }
}

// Export singleton instance
const loader = new ModuleAutoLoader();

// Also export the class for testing
loader.ModuleAutoLoader = ModuleAutoLoader;

module.exports = loader;

/* 
🎯 USAGE EXAMPLES:

// In your main bot file:
const loader = require('./core/ModuleAutoLoader');

// Load everything at startup
loader.loadAll();

// Get specific modules
const RiskManager = loader.get('core', 'RiskManager');
const discordNotifier = loader.get('utils', 'discordNotifier');

// Use path helpers
const patternFile = loader.getPath('patterns', 'btc-patterns.json');
const logFile = loader.getPath('tradeLogs', `trade-${Date.now()}.log`);

// Use custom require
const MyModule = loader.require('@core/MyModule');
const Utils = loader.require('@utils/helpers');

// Ensure directories exist
loader.ensureDirectory('tradeLogs');
loader.ensureDirectory('charts');

// Validate critical modules
loader.validateModules({
  core: ['RiskManager'],
  utils: ['discordNotifier']
});

FOR VALHALLA! FOR HOUSTON! 🚀
*/
