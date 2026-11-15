// Closed, pinned development candidates. No public/default promotion or automatic fallback.
import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';import {readFileSync} from 'node:fs';
import {contextExpansionPlan} from './native-context.mjs';
export const NATIVE_CANDIDATES=Object.freeze(Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./native-model-profiles.json',import.meta.url),'utf8'))).map(([key,pin])=>[key,Object.freeze({...pin,quality_qualified:false,production_promoted:false})])));
function worker(request,signal){
 const python=fileURLToPath(new URL('../.local-runtime/venv/Scripts/python.exe',import.meta.url)),script=fileURLToPath(new URL('./runtime/native_generate.py',import.meta.url));
 const env={};for(const k of ['SystemRoot','WINDIR','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA'])if(process.env[k])env[k]=process.env[k];env.PATH=(env.SystemRoot||'C:\\Windows')+'\\System32';env.TMP=env.TEMP=fileURLToPath(new URL('../.local-runtime/runtime-tmp/',import.meta.url));
 return new Promise((resolve,reject)=>{const child=execFile(python,['-E','-s',script],{env,cwd:fileURLToPath(new URL('./runtime/',import.meta.url)),windowsHide:true,signal,timeout:7210000,maxBuffer:5*1024**2},(error,out)=>{let receipt;try{receipt=JSON.parse(out);}catch{reject(Error('No native qualification receipt'));return;}if(error||!receipt.success)reject(Object.assign(Error(receipt.error||'Native qualification failed'),{receipt}));else resolve(receipt);});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));});
}
export async function experimentalNative(prompt,{profile='qwen14',context=2048,predict=512,signal,schema,action='generate',thinking=true,structuredSampling=false,allowContextExpansion=false,maxContext=32768}={}){
 if(!Object.hasOwn(NATIVE_CANDIDATES,profile))throw Error('Unregistered native checkpoint');signal?.throwIfAborted();
 const pin=NATIVE_CANDIDATES[profile],request={profile,prompt,context,predict,schema,action,thinking,structured_sampling:structuredSampling};let r,expansion;
 try{r=await worker(request,signal);}catch(error){
  expansion=contextExpansionPlan(error.receipt,{enabled:allowContextExpansion,profile,pin,context,predict,maxContext});if(!expansion)throw error;signal?.throwIfAborted();
  try{r=await worker({...request,context:expansion.context,expected_prompt_sha256:expansion.expected_prompt_sha256,expected_input_ids_sha256:expansion.expected_input_ids_sha256},signal);}
  catch(retryError){if(retryError.receipt)retryError.receipt.coordinator_admission_history=[expansion.prior];throw retryError;}
 }
 if(r.checkpoint.sha256!==pin.sha256||r.checkpoint.revision!==pin.revision||!r.owned_processes_zero||!r.private_port_closed)throw Error('Actual native artifact or owned cleanup was not verified');
 const {value,...trace}=r;if(expansion)trace.coordinator_admission_history=[expansion.prior];return {value,trace};
}
export const probeNative=(prompt,options={})=>experimentalNative(prompt,{...options,action:'probe',predict:options.predict??4});
