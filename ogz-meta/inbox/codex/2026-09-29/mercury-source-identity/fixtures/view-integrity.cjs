'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const packet=path.resolve(__dirname,'..'),root=path.resolve(__dirname,'../../../../../..');
const ledger=path.join(packet,'private/ledger'), records=[];
for(const dir of fs.readdirSync(ledger,{withFileTypes:true}).filter(e=>e.isDirectory())){
 const p=path.join(ledger,dir.name);
 for(const name of fs.readdirSync(p).filter(n=>/^source-.*\.json$/.test(n))){
  const manifestPath=path.join(p,name), m=JSON.parse(fs.readFileSync(manifestPath));
  const sourceRoot=path.join(p,name.slice(0,-5));
  for(const f of m.files){
   const bytes=fs.readFileSync(path.join(sourceRoot,f.file));
   const sha=crypto.createHash('sha256').update(bytes).digest('hex');
   const object=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
   if(sha!==f.sha256||object!==f.object)throw Error('Evidence view mismatch: '+f.file);
  }
  records.push({tree:m.tree,baseTree:m.baseTree,files:m.files.length,
   allCapturedBytesMatchGitObjects:true,manifest:path.relative(root,manifestPath)});
 }
}
fs.writeFileSync(path.join(packet,'private/view-integrity.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify(records));
