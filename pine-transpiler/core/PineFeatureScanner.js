// core/PineFeatureScanner.js
class PineFeatureScanner {
  stripCommentsAndStrings(source) {
    return String(source || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ')
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
  }

  detectSecurityLookahead(text) {
    const securityCall = /\brequest\.security\s*\(/g;
    let match;

    while ((match = securityCall.exec(text)) !== null) {
      const callStart = match.index + match[0].length;
      let depth = 1;
      let cursor = callStart;

      while (cursor < text.length && depth > 0) {
        const char = text[cursor];
        if (char === '(') depth++;
        if (char === ')') depth--;
        cursor++;
      }

      const args = text.slice(callStart, cursor - 1);
      if (/\blookahead\s*=\s*(?:barmerge\.)?lookahead_on\b/.test(args) ||
          /\blookahead\s*=\s*true\b/.test(args)) {
        return true;
      }
    }

    return false;
  }

  detectRecursiveFunctions(text) {
    const functionPattern = /^([A-Za-z_]\w*)\s*\([^)]*\)\s*=>\s*(.*(?:\n(?:[ \t]+.*|$))*)/gm;
    let match;

    while ((match = functionPattern.exec(text)) !== null) {
      const name = match[1];
      const body = match[2] || '';
      const recursiveCall = new RegExp(`\\b${name}\\s*\\(`);
      if (recursiveCall.test(body)) return true;
    }

    return false;
  }

  scan(source = '') {
    const rawText = String(source || '');
    const text = this.stripCommentsAndStrings(rawText);
    const has = (re) => re.test(text);

    const features = {
      varDeclarations: has(/\bvar\b/),
      varipDeclarations: has(/\bvarip\b/),
      reassignment: has(/:=/),
      arrays: has(/\barray\./),
      arrayFrom: has(/\barray\.from\s*\(/),
      loops: has(/\bfor\b\s+\w+\s*=\s*.+\bto\b|\bwhile\b/),
      functionsArrow: has(/\w+\s*\([^\)]*\)\s*=>/),
      recursiveFunctions: this.detectRecursiveFunctions(text),
      requestSecurity: has(/\brequest\.security\s*\(/),
      requestSecurityLookahead: this.detectSecurityLookahead(text),
      calcOnEveryTickTrue: has(/\bcalc_on_every_tick\s*=\s*true\b/),
      switchStatements: has(/\bswitch\b/),
      tupleAssignments: has(/(^|[\n\r])\s*(?:var\s+|varip\s+)?\[[^\]\n,]+,[^\]\n]+\]\s*=/),
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

    const refusalFeatures = [];
    if (features.requestSecurityLookahead) {
      refusalFeatures.push({
        feature: 'request.security() lookahead',
        reason: 'request.security() with lookahead can repaint imported signals',
      });
    }
    if (features.calcOnEveryTickTrue) {
      refusalFeatures.push({
        feature: 'calc_on_every_tick=true',
        reason: 'calc_on_every_tick=true can produce intrabar repaint patterns',
      });
    }
    if (features.varipDeclarations) {
      refusalFeatures.push({
        feature: 'varip',
        reason: 'varip intrabar persistence is untested by this transpiler',
      });
    }
    if (features.arrayFrom) {
      refusalFeatures.push({
        feature: 'array.from',
        reason: 'array.from constructor semantics are untested by this transpiler',
      });
    }
    if (features.recursiveFunctions) {
      refusalFeatures.push({
        feature: 'recursive functions',
        reason: 'recursive user functions are untested by this transpiler',
      });
    }
    if (features.switchStatements) {
      refusalFeatures.push({
        feature: 'switch',
        reason: 'switch statement semantics are untested by this transpiler',
      });
    }
    if (features.tupleAssignments) {
      refusalFeatures.push({
        feature: 'tuples',
        reason: 'tuple assignment semantics are untested by this transpiler',
      });
    }

    return {
      features,
      unsupportedSignalMode,
      refusalFeatures,
      refusalRequired: refusalFeatures.length > 0,
      signalModeReady: unsupportedSignalMode.length === 0,
    };
  }

  assertImportable(source = '') {
    const result = this.scan(source);
    if (!result.refusalRequired) return result;

    const names = result.refusalFeatures.map((entry) => entry.feature).join(', ');
    const reasons = result.refusalFeatures
      .map((entry) => `${entry.feature}: ${entry.reason}`)
      .join('; ');
    const error = new Error(`Pine import refused: unsupported repaint/untested feature(s): ${names}. ${reasons}`);
    error.code = 'PINE_IMPORT_REFUSED';
    error.features = result.refusalFeatures;
    error.scanResult = result;
    throw error;
  }
}

module.exports = PineFeatureScanner;
