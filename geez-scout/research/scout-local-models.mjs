import {readFile} from 'node:fs/promises';
import {validateScoutJson} from './scout-schema.mjs';
import {localJsonHttp} from './local-json-http.mjs';
export const SCOUT_LOCAL_PINS=Object.freeze({
 'scout:gemma12':Object.freeze({profile:'gemma12',tag:'geez-scout-gemma12-text:latest',digest:'3b26ba500ddca5d89f29be8a8eb5ae24da63423b3cfa5fbb3358d1f75d6172c9',weight_sha256:'bb722270d54346adc198f213851dbe0207e87c3ecf2a0aff4d92262726215391',independence_key:'gemma4:12b',parameters_billions:11.9}),
 'scout:deepseek14':Object.freeze({profile:'deepseek14',tag:'geez-scout-deepseek14:latest',digest:'2854e4e5c3505ac70acdf02c948bfedebb60324668bad5a15e8fef96c689414c',weight_sha256:'0b319bd0572f2730bfe11cc751defe82045fad5085b4e60591ac2cd2d9633181',independence_key:'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',parameters_billions:14.8})
});
const origin='http://127.0.0.1:11434';
async function api(path,body,signal){return localJsonHttp(path,{body,signal,origin,timeoutMs:3600000});}
export async function scoutLocalInventory(){const tags=await api('/api/tags');return Object.entries(SCOUT_LOCAL_PINS).map(([model,p])=>({model,...p,available:tags.models.some(m=>m.name===p.tag&&m.digest===p.digest),local_only:true}));}
export async function scoutLocalCall(model,prompt,schema,{predict=3072,context=12288,signal}={}){
 const pin=SCOUT_LOCAL_PINS[model];if(!pin)throw Error('Unregistered scout model.');signal?.throwIfAborted();
 if(Buffer.byteLength(prompt)+predict+1024>context)throw Error('The complete source packet exceeds this local context. No text was silently discarded.');
 const receipt=JSON.parse(await readFile(new URL('../.local-runtime/receipts/scout-'+pin.profile+'-ollama.json',import.meta.url),'utf8'));
 if(receipt.ollama_digest!==pin.digest||receipt.tag!==pin.tag||!receipt.local_only||!JSON.stringify(receipt.show).includes(pin.weight_sha256))throw Error('Local scout model registration changed.');
 if(!(await scoutLocalInventory()).find(m=>m.model===model)?.available)throw Error('The pinned local scout model is not installed.');
 if((await api('/api/ps')).models.length)throw Error('Another local model is in use. Wait for it to unload before starting this review.');
 const chat=model==='scout:deepseek14';
 // Family guidance: ollama.com/library/gemma4; DeepSeek's own Distill-Qwen-14B model card.
 // Avoid the old greedy temperature0 override; thinking and exact model pins stay unchanged.
 const sampling=chat?{temperature:0.6,top_p:0.95,seed:2718}:{temperature:1.0,top_p:0.95,top_k:64,seed:2718};
 const started=Date.now();const raw=await api(chat?'/api/chat':'/api/generate',{model:pin.tag,...(chat?{messages:[{role:'user',content:prompt}]}:{prompt,raw:false}),think:true,stream:false,keep_alive:0,format:schema,options:{...sampling,num_ctx:context,num_predict:predict,num_batch:64,num_thread:6,num_gpu:0}},signal);
 const content=chat?raw.message?.content:raw.response,thinking=chat?raw.message?.thinking:raw.thinking;
 const after=await api('/api/ps');if(after.models.some(m=>m.name===pin.tag))throw Object.assign(Error('The completed scout model has not unloaded.'),{raw,sampling});
 if(raw.model!==pin.tag||raw.done!==true||raw.done_reason!=='stop'||!content?.trim()||!thinking?.trim())throw Object.assign(Error('The local model did not complete a thinking answer. No substitute answer was generated.'),{raw,sampling});
 if(raw.prompt_eval_count+predict>context)throw Object.assign(Error('Actual prompt usage exceeded the complete output reserve.'),{raw,sampling});
 let value;try{value=validateScoutJson(JSON.parse(content),schema);}catch(error){Object.assign(error,{raw,sampling});throw error;}
 return {value,trace:{model,tag:pin.tag,digest:pin.digest,weight_sha256:pin.weight_sha256,sampling,local_only:true,cloud_fallback:false,thinking_characters:thinking.length,prompt_tokens:raw.prompt_eval_count,completion_tokens:raw.eval_count,finish_reason:raw.done_reason,elapsed_ms:Date.now()-started,model_unloaded_after:true,service:'existing_local_ollama',transport:chat?'chat_with_schema':'generate_with_schema',owned_process_cleanup:'not_claimed_for_shared_service',raw}};
}
