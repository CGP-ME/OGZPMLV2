const fs = require('fs');
const path = require('path');
const PineRuntime = require('../core/PineRuntime');

// Mission two fetch loop: run real TradingView scripts through the loud gate
// and report each one's fate. This harness is the catalog generator - it
// records outcomes, it does not judge them. Named refusals become build-list
// entries; unnamed errors are contract gaps the parser/gate must learn to
// name; clean loads graduate to behavior verification on Trey's desk.
//
// Outcome categories logged per script:
//   LOADS            - constructs; next step is behavior verification
//   REFUSED_NAMED    - PINE_LOAD_REFUSED with named features (gate contract)
//   PARSE_ERROR      - parser threw without naming a feature (contract gap)
//   OTHER_ERROR      - anything else (contract gap, investigate)

const corpusDir = path.join(__dirname, '..', 'corpus');
const corpusFiles = fs.existsSync(corpusDir)
  ? fs.readdirSync(corpusDir).filter((f) => f.endsWith('.pine')).sort()
  : [];

function runGate(source) {
  try {
    // eslint-disable-next-line no-new
    new PineRuntime(source);
    return { status: 'LOADS' };
  } catch (e) {
    if (e && e.code === 'PINE_LOAD_REFUSED') {
      return {
        status: 'REFUSED_NAMED',
        unsupported: e.unsupported || [],
      };
    }
    return {
      status: e instanceof SyntaxError ? 'PARSE_ERROR' : 'OTHER_ERROR',
      message: e && e.message ? e.message : String(e),
    };
  }
}

(corpusFiles.length ? describe : describe.skip)(
  'fetch-loop corpus: every real script gets a recorded fate',
  () => {
    const results = [];

    test.each(corpusFiles)('%s', (file) => {
      const source = fs.readFileSync(path.join(corpusDir, file), 'utf8');
      expect(source.trim().length).toBeGreaterThan(0);
      const outcome = runGate(source);
      results.push({ file, ...outcome });
      console.log(`[corpus] ${file} :: ${JSON.stringify(outcome)}`);
      expect(outcome.status).toBeDefined();
    });

    afterAll(() => {
      const counts = results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      console.log(`[corpus-summary] ${JSON.stringify(counts)}`);
    });
  }
);
