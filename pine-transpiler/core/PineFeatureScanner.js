// core/PineFeatureScanner.js
class PineFeatureScanner {
  scan(source = '') {
    const text = String(source || '');
    const has = (re) => re.test(text);

    const features = {
      varDeclarations: has(/\bvar\b/),
      reassignment: has(/:=/),
      arrays: has(/\barray\./),
      loops: has(/\bfor\b\s+\w+\s*=\s*.+\bto\b|\bwhile\b/),
      functionsArrow: has(/\w+\s*\([^\)]*\)\s*=>/),
      strategyExit: has(/\bstrategy\.exit\s*\(/),
      strategyClose: has(/\bstrategy\.close\s*\(/),
      strategyState: has(/\bstrategy\.(position_size|position_avg_price|closedtrades|equity)\b/),
      sessionTime: has(/\binput\.session\b|\btime\s*\(/),
      plotsAlerts: has(/\bplot\w*\s*\(|\balertcondition\s*\(/),
      atr: has(/\bta\.atr\s*\(/),
      highest: has(/\bta\.highest\s*\(/),
      lowest: has(/\bta\.lowest\s*\(/),
      stdev: has(/\bta\.stdev\s*\(/),
      vwap: has(/\bta\.vwap\s*\(/),
    };

    const unsupportedSignalMode = [];
    if (features.arrays) unsupportedSignalMode.push('array.* operations');
    if (features.loops) unsupportedSignalMode.push('for/while loops');
    if (features.functionsArrow) unsupportedSignalMode.push('multi-step => functions');
    if (features.strategyExit || features.strategyClose || features.strategyState) {
      unsupportedSignalMode.push('strategy.* position/exit lifecycle semantics');
    }
    if (features.sessionTime) unsupportedSignalMode.push('session-aware time() semantics');

    return {
      features,
      unsupportedSignalMode,
      signalModeReady: unsupportedSignalMode.length === 0,
    };
  }
}

module.exports = PineFeatureScanner;
