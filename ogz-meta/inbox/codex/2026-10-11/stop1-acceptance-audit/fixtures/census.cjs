// Read-only source census. No application module is imported or executed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const parser = require('@babel/parser');
const out = path.resolve(__dirname, '..');
const tracked = cp.execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
const excluded = /^(ogz-meta|test|tests|docs|archive|backups|node_modules|\.claude)\//;
const files = tracked.filter(p => /\.(c?js|mjs)$/.test(p) && !excluded.test(p));
// This metadata-directory module is explicitly imported by the live runner
// and OrderExecutor. Directory names do not determine runtime ownership.
files.push('ogz-meta/claudito-logger.js');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const sources = [], calls = [], env = [], imports = [], parseErrors = [];
const literal = n => n && (n.type === 'StringLiteral' || n.type === 'Literal') && typeof n.value === 'string' ? n.value : null;
function expr(n) {
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
    const owner = expr(n.object), prop = n.computed ? literal(n.property) : n.property.name;
    return owner && prop ? owner + '.' + prop : null;
  }
  return null;
}
function resolveLocal(file, request) {
  if (!request.startsWith('.')) return null;
  const base = path.resolve(path.dirname(file), request);
  return [base,base+'.js',base+'.cjs',base+'.json',path.join(base,'index.js')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()) || false;
}
for (const file of files) {
  const bytes = fs.readFileSync(file), source = bytes.toString();
  let headHash = null;
  try { headHash=hash(cp.execFileSync('git',['show',`HEAD:${file}`],{maxBuffer:10*1024*1024})); } catch {}
  sources.push({file,sha256:hash(bytes),headSha256:headHash,dirty:headHash!==hash(bytes)});
  let ast;
  try {ast=parser.parse(source,{sourceType:'unambiguous',allowReturnOutsideFunction:true,plugins:['jsx']});}
  catch(e){parseErrors.push({file,error:e.message});continue;}
  function visit(n) {
    if (!n || typeof n !== 'object') return;
    const line=n.loc?.start.line;
    if (n.type==='CallExpression' || n.type==='OptionalCallExpression') {
      const callee=expr(n.callee), arg=literal(n.arguments[0]);
      if (callee==='require') {
        const resolved=arg===null?null:resolveLocal(file,arg);
        imports.push({file,line,request:arg,dynamic:arg===null,resolved});
        if(file.startsWith('ogz-meta/') && resolved) {
          const relative=path.relative(process.cwd(),resolved);
          if(relative.startsWith('ogz-meta/') && /\.(c?js|mjs)$/.test(relative) && !files.includes(relative)) files.push(relative);
        }
      }
      if (callee && /(?:ConfigLoader|configLoader|configProvider|configuration|getSettingsFileValue|getInternalsFileValue)/.test(callee)) calls.push({file,line,callee,key:arg,dynamic:arg===null});
    }
    if (n.type==='ImportDeclaration' || n.type==='ExportNamedDeclaration' && n.source) {
      const arg=literal(n.source);imports.push({file,line,request:arg,resolved:resolveLocal(file,arg)});
    }
    if ((n.type==='MemberExpression'||n.type==='OptionalMemberExpression') && expr(n.object)==='process.env') env.push({file,line,key:n.computed?literal(n.property):n.property.name,dynamic:n.computed&&literal(n.property)===null});
    for(const [k,v] of Object.entries(n)) if(!['loc','start','end','comments','tokens'].includes(k)) {
      if(Array.isArray(v)) v.forEach(visit); else if(v&&typeof v==='object')visit(v);
    }
  }
  visit(ast.program);
}
const leaves=[];
function walk(value, key, owner) {
  if(value && typeof value==='object' && Object.keys(value).length) for(const [k,v] of Object.entries(value)) walk(v,key?key+'.'+k:k,owner);
  else leaves.push({owner,key,type:value===null?'null':Array.isArray(value)?'array':typeof value});
}
for(const owner of ['config/settings.json','config/internals.json']) walk(JSON.parse(fs.readFileSync(owner,'utf8')),'',owner);
const graph=new Map();
for(const i of imports) if(i.resolved) {
  const target=path.relative(process.cwd(),i.resolved);
  if(!graph.has(i.file))graph.set(i.file,[]);graph.get(i.file).push(target);
}
const roots=['run-empire-v2.js','ogzprime-ssl-server.js','core/Supervisor.js','ecosystem.config.js'];
const reachability={};
for(const root of roots){const seen=new Set();function dfs(f){if(seen.has(f))return;seen.add(f);for(const x of graph.get(f)||[])dfs(x);}dfs(root);reachability[root]=[...seen].sort();}
const result={head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),generatedAt:new Date().toISOString(),method:'AST inventory only; static imports conservatively include conditional/function-local requires. Not execution or behavioral proof. Dynamic requires explicitly unresolved. Config leaves include arrays/profile duplicates/metadata, not customer-control count.',sources,leaves,calls,env,imports,parseErrors,reachability};
fs.writeFileSync(path.join(out,'source-census.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sources:sources.length,leaves:leaves.length,configCalls:calls.length,envReferences:env.length,parseErrors,missingLocalImports:imports.filter(x=>x.resolved===false),dynamicImports:imports.filter(x=>x.dynamic).length,rootReachability:Object.fromEntries(Object.entries(reachability).map(([k,v])=>[k,v.length]))},null,2));
