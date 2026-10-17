const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'ConfigLoader.cjs'),'utf8');
const ast=acorn.parse(source,{ecmaVersion:'latest',locations:true});let object;
walk.simple(ast,{VariableDeclarator(n){if(n.id.name==='EDITABLE_SETTINGS')object=n.init.arguments[0];}});
const owners=new Map();const duplicates=[];
for(const property of object.properties){
 const expression=property.type==='SpreadElement'?source.slice(property.argument.start,property.argument.end):'{'+source.slice(property.start,property.end)+'}';
 const fields=vm.runInNewContext('('+expression+')');
 for(const [key,value] of Object.entries(fields)){
  const owner={line:property.loc.start.line,value};
  if(owners.has(key))duplicates.push({key,previous:owners.get(key),next:owner,equal:JSON.stringify(owners.get(key).value)===JSON.stringify(value)});
  owners.set(key,owner);
 }
}
console.log(JSON.stringify({unique:owners.size,duplicates},null,2));
