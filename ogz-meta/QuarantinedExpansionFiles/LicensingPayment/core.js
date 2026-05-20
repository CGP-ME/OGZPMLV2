#!/usr/bin/env node
// PROTECTED TRADING CORE
const weights = {m:2.847,r:1.923,v:0.734,t:3.211,p:96};
console.log("OGZPrime Protected Core v1.0");
if(!process.env.LICENSE_KEY){console.error("No license");process.exit(1);}
exports.trade=(d,c)=>({s:d.m*weights.m+d.r*weights.r,a:d.r<30?"BUY":"WAIT"});
