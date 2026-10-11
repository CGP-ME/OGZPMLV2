const fs=require('fs'),path=require('path');
const root=process.cwd(),dir=__dirname;
process.env.MERCURY_CONFIG_FILE=path.resolve('ogz-meta/inbox/codex/2026-10-06/exit-owner-sequential-rebase/rsi2/private/mercury.current-harness.config.json');
process.env.MERCURY_HARNESS_TREE="9c550a22a4a03d9db79fa0bb8042e42f98c60ff8";
process.env.MERCURY_RUN_LEDGER_DIR=path.relative(root,path.join(dir,'private/ledger'));
require(path.resolve('ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs'));
require(path.resolve('trai_brain/mercury-bridge/ask')).runAgentic('Mercury, break my fix.',{reviewRef:"df1a2ce6079f0b4ed7a38ac1a6871d9132e5093f",reviewBase:"eb0fcd441222a98c4deeabf1be5d1b237cb79ed8",maxTokens:7750,reviewersExplicit:true,reviewers:'mercury'}).then(r=>{fs.writeFileSync(path.join(dir,'private/delivery-review.json'),JSON.stringify(r,null,2));fs.writeFileSync(path.join(dir,'delivery-review-answer.txt'),r.answer||'');console.log(JSON.stringify({run:r.runLedgerEntry?.run_id,verdict:r.runLedgerEntry?.verdict,termination:r.termination}));}).catch(e=>{console.error(e.stack);process.exitCode=1;});
