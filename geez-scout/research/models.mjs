import {GENERATION_PROFILE} from './generation-profile.mjs';
import {ownedGenerate} from './local-runtime.mjs';
import {maxRamEnabled} from './resource-policy.mjs';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
export const OLLAMA='http://127.0.0.1:11434';
// User requirement: larger than 4B, no Flash models and no smaller fallback.
export const MODELS=['deepseek-r1:8b','gemma4:12b'];
export const EXPECTED_DIGESTS={'deepseek-r1:8b':'6995872bfe4c521a67b32da386cd21d5c6e819b6e0d62f79f64ec83be99f5763','gemma4:12b':'6114515d63c17436a7c0417d82820ac65ad643e2806c5a3c89cb62846436ed0b'};
export async function ollama(path,payload,timeout=180000){
 if(payload||!['/api/tags','/api/ps','/api/version'].includes(path))throw Error('The shared local service is read-only; inference uses an owned worker.');
 const response=await fetch(OLLAMA+path,{method:payload?'POST':'GET',headers:payload?{'content-type':'application/json'}:undefined,body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(!response.ok)throw new Error('The local model service could not complete this step.');
 return response.json();
}
export async function inventory(){const receipt=JSON.parse(await readFile(new URL('../.local-runtime/receipts/private-model-copy.json',import.meta.url),'utf8'));const models=MODELS.map(name=>({name,digest:receipt.pins[name],size:receipt.blobs.filter(b=>b.tag===name).reduce((n,b)=>n+b.bytes,0),local_private_copy:true}));return {models,running:[],running_status:'Per-call owned workers; active requests are exposed separately by isBusy, not polled here.',version:'0.40.16',available_bytes:os.freemem(),total_bytes:os.totalmem()};}
let busy=false;
export async function exclusive(task){if(busy)throw new Error('Another review is using the local models. Try again when it finishes.');busy=true;try{return await task();}finally{busy=false;}}
export const isBusy=()=>busy;
export async function generate(model,prompt,schema,{predict=GENERATION_PROFILE.research_output_tokens,ctx,think=true,signal,knowledge_receipt}={}){
 signal?.throwIfAborted();
 if(!MODELS.includes(model)||think!==true)throw Error('Use an approved local thinking checkpoint. No smaller or cloud fallback is available.');
 let inv;try{inv=await inventory();}catch{throw Error('Local model setup is incomplete. Your input is saved; no model was started.');}const installed=inv.models.find(m=>m.name===model);
 if(!installed||installed.digest!==EXPECTED_DIGESTS[model])throw Error('The pinned private local model is unavailable. Your input is saved.');
 if(!await maxRamEnabled()&&inv.available_bytes<2*1024**3)throw Error('More available memory is needed even for local setup checks. Your input is saved.');
 const before=process.memoryUsage(),started=Date.now();const result=await ownedGenerate(model,prompt,schema,{predict,ctx,signal,checkpoint_digest:installed.digest});const raw=result.raw;
 if(raw.done!==true||raw.done_reason==='length'||typeof raw.response!=='string'||!raw.response.trim())throw Error('The local reviewer did not finish a complete answer. Your input is saved.');
 let value;try{value=JSON.parse(raw.response);}catch{throw Error('The local reviewer did not return usable structured work. No facts were approved.');}
 return {value,trace:{model,digest:installed.digest,ollama:inv.version,prompt,prompt_sha256:createHash('sha256').update(prompt).digest('hex'),rendered_prompt_sha256:result.rendered_prompt_sha256,options:{num_ctx:result.admission.context,num_predict:predict,num_gpu:0,temperature:0,seed:2718},thinking_requested:true,thinking_characters:raw.thinking?.length||0,raw_output:raw.response,elapsed_ms:Date.now()-started,total_duration_ns:raw.total_duration,load_duration_ns:raw.load_duration,prompt_eval_count:raw.prompt_eval_count,eval_count:raw.eval_count,eval_duration_ns:raw.eval_duration,memory_samples:result.memory_samples,memory_sample_count:result.sample_count,memory_recovery_verified:result.memory_recovery_verified,ownership:result.ownership,admission:result.admission,knowledge:knowledge_receipt,node_memory_before:before,node_memory_after:process.memoryUsage(),semantic_quality:'not_independently_qualified'}};
}
