// Record verified local installation metadata; never download weights or call a cloud model.
import {mkdir,writeFile} from 'node:fs/promises';
import {SCOUT_LOCAL_PINS} from '../research/scout-local-models.mjs';
const origin='http://127.0.0.1:11434';
async function api(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Local Ollama setup check failed.');return r.json();}
const tags=await api('/api/tags'),receipts=new URL('../.local-runtime/receipts/',import.meta.url);await mkdir(receipts,{recursive:true});
for(const p of Object.values(SCOUT_LOCAL_PINS)){
 const installed=tags.models.find(m=>m.name===p.tag&&m.digest===p.digest);
 if(!installed)throw Error('Pinned '+p.tag+' is not installed. No smaller or cloud fallback was selected. See README for this prototype’s setup limitation.');
 const show=await api('/api/show',{model:p.tag});
 if(!JSON.stringify(show).includes(p.weight_sha256))throw Error('The local model weight identity does not match.');
 await writeFile(new URL('scout-'+p.profile+'-ollama.json',receipts),JSON.stringify({tag:p.tag,ollama_digest:p.digest,local_only:true,show},null,2));
 console.log('Verified local '+p.parameters_billions+'B '+p.profile+'; registration saved privately.');
}
