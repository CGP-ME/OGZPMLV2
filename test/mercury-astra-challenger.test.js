'use strict';
const { CodexChallengerClient, parseCodexTapes, subscriptionEnv } = require('../trai_brain/mercury-bridge/codex-challenger');
const { REVIEWER_REGISTRY, canAttachFinalReview, reportedPanelDecision } = require('../trai_brain/mercury-bridge/reviewer-panel');
const { runAstraAdversarialReview, executePromptOnlyStage } = require('../trai_brain/mercury-bridge/adversarial-review');
const { checkClient } = require('../trai_brain/mercury-bridge/provider-preflight');
const crypto = require('crypto');
const model='gpt-6-astra';
function tapes(applied=model) {
 const stdout=[{type:'item.completed',item:{type:'agent_message',text:'VERDICT: pass\nCONSENSUS_BLOCKING: no'}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}].map(JSON.stringify).join('\n');
 const stderr='TRACE codex_api::sse::responses: SSE event: '+JSON.stringify({type:'response.completed',response:{id:'resp_fixture',model:applied,status:'completed'}})+'\n';
 return {stdout,stderr};
}
function client(result=tapes()) {
 const c=new CodexChallengerClient({model,repoRoot:process.cwd(),systemPrompt:'Read only.',maxTokens:2000,requestTimeoutMs:1000,invoke:jest.fn(async()=>result)});
 c.initialized=true;c.executableTrust={trusted:true};c.authStatus={authenticated:true};return c;
}

test('registry replaces only challenger; Kimi attachment binds exact Astra answer and order',()=>{
 expect(REVIEWER_REGISTRY.map(x=>x.id)).toEqual(['mercury','astra','kimi']);
 const a={status:'succeeded',sequence:1,answer:'answer'};
 const k={status:'succeeded',sequence:2,inputDependencies:[{id:'astra',sequence:1,answerSha256:crypto.createHash('sha256').update(a.answer).digest('hex')}]};
 expect(canAttachFinalReview(a,k)).toBe(true);
 expect(canAttachFinalReview({...a,answer:'changed'},k)).toBe(false);
 expect(reportedPanelDecision({seats:[{id:'mercury',status:'succeeded',answer:'pass',parsed:{verdict:'pass'}},{id:'astra',status:'failed'}]}).verdict).toBe('review_incomplete');
});

test('subscription environment removes API credentials and uses response-only trace',()=>{
 const env=subscriptionEnv({OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret',OPENAI_BASE_URL:'https://other',NODE_OPTIONS:'injection'});
 expect(env.OPENAI_API_KEY).toBeUndefined();expect(env.CODEX_API_KEY).toBeUndefined();expect(env.OPENAI_BASE_URL).toBeUndefined();expect(env.NODE_OPTIONS).toBeUndefined();
 expect(env.RUST_LOG).toBe('codex_api::sse::responses=trace');
});

test.each([null,'gpt-5.6-sol','claude-fable-5'])('provider identity %s is recorded without discarding the answer',async applied=>{
 const c=client(tapes(applied));const r=await c.generateResponseWithMetadata('review');
 expect(r.answer).toContain('VERDICT: pass');expect(r.metadata.identityPosture.status).toBe('identity_conflict');expect(c.invoke).toHaveBeenCalledTimes(1);
});

test('actual provider identity, completion and complete tapes qualify; CLI config alone does not',async()=>{
 const c=client();const r=await c.generateResponseWithMetadata('review');
 expect(r.answer).toContain('VERDICT: pass');expect(r.metadata.appliedModel).toBe(model);expect(r.metadata.rawError.toString()).toContain('response.completed');
 const args=c.invoke.mock.calls[0][1];expect(args).toContain('forced_login_method="chatgpt"');expect(args).toContain('read-only');expect(args.join(' ')).not.toMatch(/claude|api_key/);
 const absent=await client({...tapes(),stderr:''}).generateResponseWithMetadata('review');expect(absent.answer).toContain('VERDICT: pass');expect(absent.metadata.identityPosture.status).toBe('identity_conflict');
});

test.each(['timeout','malformed','incomplete'])('failure %s preserves tapes without fallback',async kind=>{
 const raw=tapes();if(kind==='timeout')raw.error=Object.assign(new Error('timed out'),{code:'ETIMEDOUT'});
 if(kind==='malformed')raw.stderr+='TRACE SSE event: {broken\n';
 if(kind==='incomplete')raw.stdout=raw.stdout.split('\n')[0];
 const c=client(raw),r=await c.generateResponseWithMetadata('review');expect(r.answer).toContain('VERDICT: pass');expect(r.metadata.rawResponse.toString()).toBe(raw.stdout);expect(c.invoke).toHaveBeenCalledTimes(1);
});

test('tool requests and command outcomes are retained independently of verdict text',()=>{
 const raw=tapes();raw.stderr+='TRACE SSE event: '+JSON.stringify({type:'response.output_item.done',item:{type:'function_call',name:'exec',call_id:'call1',arguments:'read source'}})+'\n';
 raw.stdout+='\n'+JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'rg x file.js',exit_code:0,status:'completed',aggregated_output:'evidence'}});
 const p=parseCodexTapes(raw.stdout,raw.stderr,model);expect(p.tools.enabled).toBe(true);expect(p.tools.calls[0].name).toBe('exec');expect(p.tools.execution_events[0].item.aggregated_output).toBe('evidence');
});

test('identity conflict retains the answer and raw receipts without a replacement call',async()=>{
 const persistRaw=jest.fn((role,attempt,bytes)=>({role,attempt,bytes:bytes.length}));
 const c=client(tapes('wrong'));
 const r=await runAstraAdversarialReview({query:'Review this change.',mercuryResult:{answer:'Evidence absent.'},createAstraClient:()=>c,persistRaw});
 expect(r.ok).toBe(true);expect(r.answer).toContain('VERDICT: pass');expect(r.identityPosture.status).toBe('identity_conflict');expect(c.invoke).toHaveBeenCalledTimes(1);expect(persistRaw).toHaveBeenCalled();
 const preflight=await checkClient('astra_challenger',()=>client(tapes('wrong')));expect(preflight.identityPosture.status).toBe('identity_conflict');expect(preflight.attemptReceipt.applied_model).toBe('wrong');
});

test('Kimi still rejects exposed tools; Astra keeps tool-enabled receipts',async()=>{
 const metadata={provider:'codex-subscription',requestedModel:model,appliedModel:model,toolsAvailable:['read'],tools:{enabled:true,calls:[{name:'exec'}]},identityPosture:{status:'verified'},rawResponse:Buffer.from('raw')};
 const factory=()=>({initialize:async()=>{},generateResponseWithMetadata:async()=>({ok:true,answer:'VERDICT: pass',metadata})});
 const input={prompt:'review',createClient:factory,persistRaw:()=>({path:'fixture'}),attemptNumber:1};
 await expect(executePromptOnlyStage({...input,role:'kimi_tie_breaker'})).rejects.toThrow('prompt-only');
 const result=await executePromptOnlyStage({...input,role:'astra_challenger'});expect(result.receipt.tools.enabled).toBe(true);
});

test('transport failure and partial answer survive on the stage receipt without a new throw',async()=>{
 const raw={...tapes(),error:Object.assign(new Error('transport timed out'),{code:'ETIMEDOUT',killed:true})};
 const stage=await executePromptOnlyStage({role:'astra_challenger',prompt:'review',createClient:()=>client(raw),persistRaw:(role,attempt,bytes)=>({role,size:bytes.length}),attemptNumber:1});
 expect(stage.answer).toContain('VERDICT: pass');
 expect(stage.receipt.status).toBe('failed');
 expect(stage.receipt.termination).toBe('error');
 expect(stage.receipt.provider_error.message).toBe('transport timed out');
 expect(stage.receipt.raw_output.size).toBeGreaterThan(0);
 expect(stage.receipt.raw_error.size).toBeGreaterThan(0);
});

test('identity-conflicted Astra does not stop the next selected seat',async()=>{
 const {runReviewerPanel}=require('../trai_brain/mercury-bridge/reviewer-panel');
 const visited=[];
 const panel=await runReviewerPanel({selected:['astra','mercury'],isHardStop:()=>false,runSeat:async reviewer=>{
  visited.push(reviewer.id);
  if(reviewer.id==='astra'){
   const r=await runAstraAdversarialReview({query:'review',mercuryResult:{answer:'Evidence absent.'},createAstraClient:()=>client(tapes('wrong')),persistRaw:()=>({path:'fixture'})});
   return {answer:r.answer,identityConflict:r.identityPosture.status==='identity_conflict'};
  }
  return {answer:'Mercury answer'};
 }});
 expect(visited).toEqual(['astra','mercury']);
 expect(panel.seats[0].answer).toContain('VERDICT: pass');
 expect(panel.seats[1].answer).toBe('Mercury answer');
 expect(panel.diagnostics.issues).toContain('identity_conflict');
});

test('selected source snapshot reaches the Astra tool working directory',async()=>{
 const snapshot='/selected/review/source';let used;
 await runAstraAdversarialReview({query:'review',reviewRoot:snapshot,mercuryResult:{answer:'Prior evidence'},persistRaw:()=>({path:'fixture'}),createAstraClient:options=>{
  used=client();used.repoRoot=options.repoRoot;return used;
 }});
 const args=used.invoke.mock.calls[0][1];expect(args[args.indexOf('--cd')+1]).toBe(snapshot);
 expect(used.invoke.mock.calls[0][2].cwd).toBe(snapshot);
});

test('subscription quota errors and provider tool catalog are visible on the receipt',async()=>{
 const raw=tapes();raw.stdout+='\n'+JSON.stringify({type:'error',message:'Usage limit reached'})+'\n'+JSON.stringify({type:'turn.failed',error:{message:'Usage limit reached'}});
 raw.stderr+='TRACE SSE event: '+JSON.stringify({type:'response.created',response:{id:'resp_tools',model,tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'exec'}]}]}})+'\n';
 raw.error=Object.assign(new Error('Codex exited'),{code:1});
 const stage=await executePromptOnlyStage({role:'astra_challenger',prompt:'review',createClient:()=>client(raw),persistRaw:()=>({path:'fixture'}),attemptNumber:1});
 expect(stage.answer).toContain('VERDICT: pass');
 expect(stage.receipt.provider_errors).toContainEqual({type:'error',message:'Usage limit reached'});
 expect(stage.receipt.tools.available).toEqual(['functions.exec']);
 expect(stage.receipt.tools.availability_status).toBe('provider_response_catalog');
});

test('malformed provider frames and tool catalogs preserve the answer and complete raw tapes',async()=>{
 const raw=tapes();raw.stdout+='\nnull\n42';
 raw.stderr+='TRACE SSE event: null\n';
 raw.stderr+='TRACE SSE event: '+JSON.stringify({type:'response.created',response:{id:'malformed_tools',model,tools:[null,{type:'namespace',name:'broken',tools:{}},{type:'namespace',name:'functions',tools:[null,{type:'custom',name:'exec'}]}]}})+'\n';
 const result=await client(raw).generateResponseWithMetadata('review');
 expect(result.answer).toContain('VERDICT: pass');
 expect(result.metadata.rawResponse.toString()).toBe(raw.stdout);
 expect(result.metadata.rawError.toString()).toBe(raw.stderr);
 expect(result.metadata.parseErrors).toEqual(expect.arrayContaining(['invalid_exec_frame','invalid_provider_event','invalid_provider_tool_catalog_entry','invalid_provider_tool_namespace']));
 expect(result.metadata.tools.available).toEqual(['functions.exec']);
});

test.each([null,undefined,false,{},42,'bad'])('malformed completion response %p retains stage answer and both tapes',async response=>{
 const raw=tapes();raw.stderr='TRACE SSE event: '+JSON.stringify({type:'response.completed',response})+'\n';
 const stored=[];
 const stage=await executePromptOnlyStage({role:'astra_challenger',prompt:'review',createClient:()=>client(raw),persistRaw:(role,attempt,bytes)=>{stored.push(bytes.toString());return {role};},attemptNumber:1});
 expect(stage.answer).toContain('VERDICT: pass');
 expect(stored).toEqual([raw.stdout,raw.stderr]);
 expect(stage.receipt.parse_errors).toContain('invalid_provider_completion');
 expect(stage.receipt.identity_posture.status).toBe('identity_conflict');
});
