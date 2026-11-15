import {readFile} from 'node:fs/promises';
const hostPolicy=new URL('../.local-runtime/resource-policy.json',import.meta.url);
export async function readResourcePolicy(path=hostPolicy){
 let value;try{value=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;value={version:1,mode:'reserved_ram'};}
 if(value.version!==1||!['reserved_ram','dedicated_max_ram'].includes(value.mode))throw Error('Unsupported host resource policy');
 return {version:1,mode:value.mode,available_ram_floor_bytes:value.mode==='dedicated_max_ram'?0:1536*1024**2};
}
export const maxRamEnabled=async()=>(await readResourcePolicy()).mode==='dedicated_max_ram';
