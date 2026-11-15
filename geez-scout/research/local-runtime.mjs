import {chooseContext,GENERATION_PROFILE} from './generation-profile.mjs';
import {maxRamEnabled} from './resource-policy.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PARITY_CORPUS,corpusHash,requireQualification} from './runtime-qualification.mjs';
import os from 'node:os';
import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {promptAdmission} from './token-admission.mjs';
const python=fileURLToPath(new URL('../.local-runtime/venv/Scripts/python.exe',import.meta.url));
const script=name=>fileURLToPath(new URL('./runtime/'+name,import.meta.url));
function workerEnv(){const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA'])if(process.env[key])env[key]=process.env[key];env.PATH=[fileURLToPath(new URL('../.local-runtime/venv/Scripts/',import.meta.url)),(env.SystemRoot||'C:\\Windows')+'\\System32'].join(';');env.TEMP=env.TMP=fileURLToPath(new URL('../.local-runtime/runtime-tmp/',import.meta.url));return env;}
const sha=s=>createHash('sha256').update(s).digest('hex');
const qualificationPath=(model)=>new URL('../.local-runtime/receipts/parity-'+model.replaceAll(':','-')+'.json',import.meta.url);
async function runtimeFingerprint(){const files=['./local-runtime.mjs','./runtime-qualification.mjs','./generation-profile.mjs','./runtime/owned_job.py','./runtime/native_count.py','./runtime/owned_generate.py','../.local-runtime/receipts/private-model-copy.json','../.local-runtime/receipts/private-ollama-install.json','../.local-runtime/receipts/native-tokenizer-install.json','../.local-runtime/receipts/tokenizer-control-spec.json'];return sha((await Promise.all(files.map(async f=>f+':'+sha(await readFile(new URL(f,import.meta.url)))))).join('\n'));}
const tokenizers={"deepseek-r1:8b":"f46b5d0d344800e08a036dc2556f1d510ba6c57afbd1adab5e57d0da49f5ac6c","gemma4:12b":"ca703bf9059232afd8342ad6a7c8d5879249e08959a59d7095bb1e38e65def19"};
export function renderLocalPrompt(model,prompt){prompt=prompt.replaceAll('<','\\u003c').replaceAll('>','\\u003e');if(model==='deepseek-r1:8b')return '<｜begin▁of▁sentence｜><｜User｜>'+prompt+'<｜Assistant｜><think>\n';if(model==='gemma4:12b')return prompt;throw Error('Unsupported local checkpoint');}
let unresolvedRecovery=null;
async function recover(before){if(await maxRamEnabled())return true;let stable=null;const start=Date.now();while(Date.now()-start<15000){if(os.freemem()>=2*1024**3){stable??=Date.now();if(Date.now()-stable>=5000)return true;}else stable=null;await new Promise(r=>setTimeout(r,100));}return false;}
function pythonJson(name,payload,signal,timeout){const before=os.freemem();return new Promise((resolve,reject)=>{signal?.throwIfAborted();const child=execFile(python,['-E','-s',script(name)],{windowsHide:true,signal,timeout,env:workerEnv(),cwd:fileURLToPath(new URL('./runtime/',import.meta.url)),maxBuffer:5*1024**2},async(error,stdout,stderr)=>{if(error){if(!await recover(before))unresolvedRecovery=before;let detail;try{detail=JSON.parse(stdout).error;}catch{}reject(Object.assign(new Error(detail||'The owned local runtime could not complete this step. Your input is saved.'),{cause:error}));return;}try{resolve(JSON.parse(stdout));}catch{reject(Error('The local runtime returned an unreadable receipt.'));}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));});}
export async function ownedGenerate(model,prompt,schema,{predict=GENERATION_PROFILE.research_output_tokens,ctx,signal,checkpoint_digest}={}){
 if(unresolvedRecovery!==null){if(!await recover(unresolvedRecovery))throw Error('The previous local worker has not met its recovery check. Your input is saved.');unresolvedRecovery=null;}
 const rendered=renderLocalPrompt(model,prompt),template=sha(renderLocalPrompt(model,''));
 const native=await pythonJson('native_count.py',{model,prompt:rendered,rendered:true},signal,40000);
 ctx=chooseContext(native.tokens,predict,ctx);
 const fingerprint=await runtimeFingerprint();let qualification;try{qualification=JSON.parse(await readFile(qualificationPath(model,ctx),'utf8'));}catch{}
 requireQualification(qualification,{model,context:ctx,fingerprint});
 const admission=promptAdmission({model,prompt:rendered,count:{model,tokens:native.tokens,exact:true,prompt_sha256:native.prompt_sha256,tokenizer_sha256:tokenizers[model],template_sha256:template},context:ctx,output_reserve:predict,template_sha256:template,tokenizer_sha256:tokenizers[model],checkpoint_digest,expected_digest:checkpoint_digest});
 const result=await pythonJson('owned_generate.py',{model,prompt:rendered,schema,predict,context:ctx},signal,7210000);
 if(result.raw.prompt_eval_count!==admission.prompt_tokens)throw Error('The serving model and preflight disagree about the complete input. No answer was approved.');
 return {...result,generation_profile:GENERATION_PROFILE.version,admission:{...admission,native_counter:native.counter,backend_count_parity:'qualified_before_run_and_verified_this_response',qualification_fingerprint:fingerprint},rendered_prompt_sha256:sha(rendered)};
}
// Developer-only, bounded qualification. Not a semantic-quality approval or a public endpoint.
export async function qualifyLocalInput(model,{context=6144,signal}={}){
 if(!tokenizers[model]||![6144,8192,12288,16384,24576,32768].includes(context))throw Error('Unsupported qualification profile');
 const fingerprint=await runtimeFingerprint(),cases=[];
 for(const [index,prompt] of PARITY_CORPUS.entries()){
  const rendered=renderLocalPrompt(model,prompt),native=await pythonJson('native_count.py',{model,prompt:rendered,rendered:true},signal,40000);
  if(native.tokens+257>context)throw Error('Qualification corpus exceeds the safe input budget');
  const result=await pythonJson('owned_generate.py',{model,prompt:rendered,predict:1,context},signal,7210000);
  if(result.raw.prompt_eval_count!==native.tokens)throw Error('Input qualification count mismatch; full generation remains blocked');
  cases.push({index,prompt_sha256:sha(rendered),native_tokens:native.tokens,backend_tokens:result.raw.prompt_eval_count,max_generated_tokens:1,job_processes_zero:result.ownership.job_processes_zero,private_port_closed:result.ownership.private_port_closed});
 }
 const receipt={schema:'geez-native-parity-v2',model,context,runtime_fingerprint:fingerprint,corpus_sha256:corpusHash,production_semantic_qualified:false,memory_peak_qualified:false,cases,completed_at:new Date().toISOString()};
 requireQualification(receipt,{model,context,fingerprint});await mkdir(new URL('../.local-runtime/receipts/',import.meta.url),{recursive:true});await writeFile(qualificationPath(model,context),JSON.stringify(receipt,null,2),{flag:'wx'});return receipt;
}
