// Development qualification only; never a public/default checkpoint switch.
import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';
export const NATIVE32_CANDIDATES=Object.freeze({qwen32:Object.freeze({repo:'Qwen/Qwen3-32B-GGUF',revision:'938a7432affaec9157f883a87164e2646ae17555',sha256:'efd971561896866f0e910cce52761ca77b1b138090c7f15fe284676d57d1f689',quality_qualified:false,production_promoted:false})});
export async function experimentalNative32(prompt,{profile='qwen32',context=2048,predict=512,signal,schema}={}){
 if(!Object.hasOwn(NATIVE32_CANDIDATES,profile))throw Error('No native checkpoint registered for that profile');signal?.throwIfAborted();
 const python=fileURLToPath(new URL('../.local-runtime/venv/Scripts/python.exe',import.meta.url)),script=fileURLToPath(new URL('./runtime/native_32b_generate.py',import.meta.url));
 const env={};for(const k of ['SystemRoot','WINDIR','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA'])if(process.env[k])env[k]=process.env[k];env.PATH=(env.SystemRoot||'C:\\Windows')+'\\System32';env.TMP=env.TEMP=fileURLToPath(new URL('../.local-runtime/runtime-tmp/',import.meta.url));
 const r=await new Promise((resolve,reject)=>{const child=execFile(python,['-E','-s',script],{env,cwd:fileURLToPath(new URL('./runtime/',import.meta.url)),windowsHide:true,signal,timeout:7210000,maxBuffer:5*1024**2},(error,out)=>{let receipt;try{receipt=JSON.parse(out);}catch{reject(Error('No native32B qualification receipt'));return;}if(error||!receipt.success)reject(Object.assign(Error(receipt.error||'Native32B qualification failed'),{receipt}));else resolve(receipt);});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({prompt,context,predict,schema}));});
 const pin=NATIVE32_CANDIDATES[profile];if(r.checkpoint.sha256!==pin.sha256||r.checkpoint.revision!==pin.revision||!r.owned_processes_zero)throw Error('Actual native checkpoint or owned cleanup not verified');
 const {value,...trace}=r;return {value,trace};
}
