# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2024-12-05 - CRITICAL PATTERN MEMORY FIX & MODULE CLEANUP

### Fixed
- **CRITICAL BUG**: Pattern memory was being wiped on every bot restart for 3+ MONTHS
  - File: `core/EnhancedPatternRecognition.js` line 246
  - Bug: Only checked `if (this.patternCount === 0)` to init seed patterns
  - Problem: This wiped ALL existing patterns even when memory had patterns
  - Fix: Changed to `if (Object.keys(this.memory).length === 0 && this.patternCount === 0)`
  - Impact: Bot lost ALL learned patterns every restart - couldn't learn anything

- **Discord Notifier**: Module export was missing
  - File: `utils/discordNotifier.js`
  - Added: `module.exports = DiscordTradingNotifier;`

- **Pattern Memory Format**: Fixed structure
  - File: `pattern_memory.json`
  - Changed from flat object to `{"patterns": {...}, "count": 1}` format

### Added
- **PatternMemoryBank.js**: New module at `core/PatternMemoryBank.js`
  - Purpose: TRAI AI pattern learning (separate from chart patterns)
  - Methods: recordPattern(), getSuccessfulPatterns(), pruneOldPatterns()
  - Saves to: `trai_brain/learned_patterns.json`

- **ModuleAutoLoader**: Added to `run-empire-v2.js` lines 27-29
  - MAY HAVE BROKEN BOT - bot exits after 2 candles with this change
  - Code added:
    ```javascript
    const loader = require('./core/ModuleAutoLoader');
    const modules = loader.loadAll();
    ```

### Fixed (Round 2)
- **Pattern initialization chicken-egg problem**
  - File: `core/EnhancedPatternRecognition.js` lines 266-288
  - Problem: Bot needs patterns to run, but can't learn patterns if it can't run
  - Old bug: Wiped all patterns but at least provided fresh ones
  - First fix: Preserved patterns but provided none on first run (bot couldn't start)
  - Final fix: Always ensures at least one BASE_PATTERN exists for startup
  - Now: Bot can start AND preserves learned patterns

### Fixed (Round 3)
- **ModuleAutoLoader causing bot to hang**
  - Problem: Bot would get stuck after Candle #2 and stop processing
  - Root cause: ModuleAutoLoader pre-loaded all modules, but bot still had direct require() statements
  - This caused double-loading and async/sync conflicts
  - Bot didn't exit - it got stuck waiting indefinitely
  - Solution: REMOVED ModuleAutoLoader from run-empire-v2.js
  - Bot now uses original direct require() statements as designed

### Fixed (Round 5) - CRITICAL: Bot running with EMPTY STUB CLASSES
- **Root cause of Candle #2 death identified**
  - File: `run-empire-v2.js` lines 78-87
  - Problem: ModuleAutoLoader stores modules as `{core: {...}, utils: {...}}`
  - Code was trying: `modules.EnhancedPatternRecognition` (undefined)
  - Fell back to: `|| { EnhancedPatternChecker: class {} }` (EMPTY CLASS)
  - Bot was running with DUMMY MODULES instead of real ones!
  ```javascript
  // WRONG - creates empty stub classes:
  const { EnhancedPatternChecker } = modules.EnhancedPatternRecognition || { EnhancedPatternChecker: class {} };
  // Result: EnhancedPatternChecker is literally "class {}" with NO methods
  ```
  - On Candle #2: tries to call methods on empty class → undefined → silent exit
  - No error because it's not a crash, just calling undefined methods
  - Singleton lock releases cleanly because bot "completed" (with nothing)

### Fixed (Round 6) - Proper ModuleAutoLoader integration
- **run-empire-v2.js uses loader.get() properly**
  - File: `run-empire-v2.js` lines 73-92
  - Changed all module access to use loader.get('core', 'ModuleName')
  - Added debug logging to verify modules are loading
  - Added safety check to exit if EnhancedPatternChecker undefined
  ```javascript
  // CORRECT - uses loader API:
  const EnhancedPatternRecognition = loader.get('core', 'EnhancedPatternRecognition');
  const RiskManager = loader.get('core', 'RiskManager');
  ```
  - This is how ModuleAutoLoader was designed to be used
  - No more stub classes, no more empty modules

### Fixed (Round 5) - ModuleAutoLoader module access
- **run-empire-v2.js module structure fix**
  - File: `run-empire-v2.js` lines 46-52
  - Problem: loader.loadAll() returns nested structure {core: {...}, utils: {...}}
  - Was trying: modules.SingletonLock (undefined)
  - Should be: modules.core.SingletonLock
  - Fix: Flatten modules object for direct access
  ```javascript
  const allModules = loader.loadAll();
  const modules = {
    ...allModules.core,
    ...allModules.utils
  };
  ```
  - Now all modules accessible directly: modules.SingletonLock, modules.RiskManager, etc.

### Changed (Round 4) - ModuleAutoLoader as Single Source of Truth
- **ModuleAutoLoader instance caching**
  - File: `core/ModuleAutoLoader.js` lines 172-193
  - Added: Cache Map for module instances to prevent re-loading
  - Now caches module instances, not just file paths
  - Prevents multiple instances of same module being created

- **run-empire-v2.js converted to use ModuleAutoLoader**
  - File: `run-empire-v2.js` lines 40-95
  - Changed ALL module requires to use ModuleAutoLoader
  - Line 42: Added `const loader = require('./core/ModuleAutoLoader')`
  - Line 46: Added `const modules = loader.loadAll()`
  - Lines 73-82: Replaced direct requires with `modules.ModuleName || class {}`
    - EnhancedPatternChecker from modules.EnhancedPatternRecognition
    - OptimizedTradingBrain from modules.OptimizedTradingBrain
    - RiskManager from modules.RiskManager
    - ExecutionRateLimiter from modules.ExecutionRateLimiter
    - AdvancedExecutionLayer from modules['AdvancedExecutionLayer-439-MERGED']
    - PerformanceAnalyzer from modules.PerformanceAnalyzer
    - OptimizedIndicators from modules.OptimizedIndicators
    - MarketRegimeDetector from modules.MarketRegimeDetector
    - TradingProfileManager from modules.TradingProfileManager
    - GridTradingStrategy from modules.GridTradingStrategy
  - Line 90: TRAIDecisionModule from modules.TRAIDecisionModule
  - Line 95: OgzTpoIntegration from modules.OgzTpoIntegration
  - Kept direct requires for:
    - KrakenAdapterSimple (not in core/utils)
    - TierFeatureFlags (in root directory)
  - ModuleAutoLoader is now the SINGLE SOURCE OF TRUTH for module loading

- **EMPIRE-V2-PRINCIPLES.md**: Architecture documentation

### Changed
- **AdvancedExecutionLayer**: Discord method name
  - File: `core/AdvancedExecutionLayer-439-MERGED.js`
  - Changed: `sendTradeNotification()` → `sendMessage()`

- **pattern_memory.json**: Structure update
  - Old: Flat pattern object
  - New: `{"patterns": {...}, "count": N}` format

### Removed
- Duplicate files from root directory (moved to core/)
- Test files and temporary scripts

## [2.0.0] - 2024-12-04 - EMPIRE EDITION LAUNCH

### Added
- **10 Broker Adapters**: Gemini, Schwab/TOS, Uphold (3 new) + 7 existing
- **ModuleAutoLoader**: Automatic module path resolution system
- **Discord Notifications**: Real-time trade alerts to Discord webhooks
- **Production .env**: Copied from FINAL-REFACTOR with real API keys
- **Paper Trading Mode**: Full 48h test configuration ready

### Changed
- Upgraded to V2.0 Empire Edition (from 1.0)
- Integrated ModuleAutoLoader into run-empire-v2.js
- Moved all trading modules to core/ directory
- Added Discord notifications to AdvancedExecutionLayer

### Fixed (Live Debugging)
- Module path issues resolved with ModuleAutoLoader
- Discord notifier integrated into trade execution
- Missing dependencies (PatternMemoryBank, utils links)
- All modules now properly located in core/

## [1.0.0] - 2024-12-03

### Fixed
- **trai_core.js**: Added null guard for patternMemory.pruneOldPatterns() to prevent crashes
- **ExecutionRateLimiter.js**: Added type safety for currentPosition with Number coercion
- **FibonacciDetector.js**: Normalized trend string comparison to catch all variants (up/uptrend/bull)
- **SupportResistanceDetector.js**: Protected against NaN and division by zero in distance calculations
- **tradeLogger.js**: Added type coercion for holdTimeMs in formatHoldTime()
- **AdvancedExecutionLayer.js**: Added WebSocket null check before broadcast
- **TradingProfileManager.js**: Added JSON parse protection and schema validation
- **TimeFrameManager.js**: Fixed performance.now() import for Node.js compatibility

### Added
- Initial trading system components from OGZPV2 migration
- Broker adapters for multiple exchanges (Binance, Coinbase, Kraken, etc.)
- Pattern detection modules (Fibonacci, Support/Resistance)
- OGZ Two-Pole Oscillator integration
- Comprehensive .gitignore for secrets, models, and large files

### Security
- Updated .gitignore to exclude sensitive files and credentials
- Validated all code for hardcoded secrets (none found)

## [0.1.0] - 2024-12-02

### Added
- Initial commit: OGZPrime ML V2 - Empire Architecture