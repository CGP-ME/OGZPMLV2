const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const base=require('babel-jest').createTransformer();
const {root, manifest, sources}=require('./build-implementation.cjs');
const overlays=new Set(manifest.files.map(f=>f.path));
const tracked=new Set(cp.execFileSync('git',['ls-tree','-r','--name-only','-z',manifest.base_commit],{encoding:'utf8'}).split('\0'));
module.exports={process(source,file,options){
 const relative=path.relative(root,file).split(path.sep).join('/');
 if(!process.env.MERCURY_QUALIFY_BASELINE && overlays.has(relative)) source=sources.get(relative);
 else if(tracked.has(relative)) source=cp.execFileSync('git',['show',manifest.base_commit+':'+relative],{encoding:'utf8',maxBuffer:64000000});
 return base.process(source,file,options);
}};
