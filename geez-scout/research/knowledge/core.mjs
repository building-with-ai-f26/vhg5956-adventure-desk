import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
export const sha=text=>createHash('sha256').update(text).digest('hex');
const kinds=new Set(['user_rule','library_guidance','research_source','lesson_candidate','archived_artifact']);
async function safePath(root,p){
 if(typeof p!=='string'||!p||p.includes('\\')||p.includes(':')||p.includes('\0')||isAbsolute(p)||p.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Unsafe vault path');
 const base=await realpath(root),target=resolve(base,p);let current=base;
 for(const part of p.split('/')){current=resolve(current,part);const s=await lstat(current);if(s.isSymbolicLink())throw Error('Linked vault entry refused');}
 const actual=await realpath(target),rel=relative(base,actual);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Vault escape');return actual;
}
export async function createSnapshot(root,documents){
 await mkdir(root);
 const entries=[],seen=new Set();
 for(const d of documents){
  if(!kinds.has(d.kind)||typeof d.body!=='string'||!d.id||seen.has(d.id))throw Error('Invalid document manifest');
  seen.add(d.id);
  const path='Documents/'+d.id+'.md';if(!/^[a-z0-9_-]+$/i.test(d.id))throw Error('Invalid document identity');
  await mkdir(resolve(root,'Documents'),{recursive:true});
  // Exclusive creation: a frozen snapshot is never silently rewritten.
  await writeFile(resolve(root,path),d.body,{flag:'wx'});
  entries.push({id:d.id,path,title:d.title||d.id,kind:d.kind,status:d.kind==='user_rule'?'user_instruction':d.kind==='lesson_candidate'?'candidate_not_policy':d.kind==='archived_artifact'?'archive_not_model_context':'unverified_guidance_or_source',scope:d.scope||'reference_only',provenance:d.provenance||null,sha256:sha(d.body),characters:d.body.length});
 }
 const index={schema:'geez-brain-v1',created_at:new Date().toISOString(),offset_unit:'UTF-16 code units, end exclusive',entries};
 const text=JSON.stringify(index,null,2)+'\n';await writeFile(resolve(root,'index.json'),text,{flag:'wx'});return {index_sha256:sha(text),documents:entries.length,index};
}
function terms(text){return [...new Set(String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(x=>!new Set(['the','and','for','with','that','this','what','from','want','into','how','should','can','you','are','have']).has(x));}
function passages(text){
 const out=[];let start=0;
 for(const m of text.matchAll(/\r?\n[ \t]*\r?\n/g)){const end=m.index+m[0].length;if(end>start)out.push({start,end,text:text.slice(start,end)});start=end;}
 if(start<text.length)out.push({start,end:text.length,text:text.slice(start)});
 const substantive=[];let heading=null;
 for(const p of out){if(p.start===0&&/^---\r?\n[\s\S]*?\r?\n---/.test(p.text))continue;
  if(!p.text.replace(/^\s*#{1,6}[^\r\n]*(?:\r?\n|$)/gm,'').trim()){heading=p;continue;}
  const first=heading?.start??p.start;substantive.push({start:first,end:p.end,text:text.slice(first,p.end)});heading=null;
 }return substantive;
}
export async function retrieve({root,index_sha256,query='',max_characters=12000,preferred_paths=[]}){
 if(!/^[a-f0-9]{64}$/.test(index_sha256||''))throw Error('Trusted index hash required');
 if(typeof query!=='string'||query.length>20000||!Number.isInteger(max_characters)||max_characters<1||max_characters>100000)throw Error('Invalid retrieval budget/query');
 const raw=await readFile(await safePath(root,'index.json'),'utf8');if(sha(raw)!==index_sha256)throw Error('Index integrity failure');
 const index=JSON.parse(raw);if(index.schema!=='geez-brain-v1'||!Array.isArray(index.entries))throw Error('Unknown index schema');
 const q=terms(query),all=[],mandatory=[],archived=[];let total=0;
 for(const e of index.entries){
  if(!kinds.has(e.kind))throw Error('Unknown authority class');
  const text=await readFile(await safePath(root,e.path),'utf8');if(sha(text)!==e.sha256||text.length!==e.characters)throw Error('Source integrity failure: '+e.id);
  if(e.kind==='archived_artifact'){archived.push({id:e.id,start:0,end:text.length,reason:'archive_only_not_model_context'});continue;}
  if(e.kind==='user_rule'){mandatory.push({...e,start:0,end:text.length,passage:text});total+=text.length;continue;}
  for(const p of passages(text)){
   const pt=terms(p.text),tt=terms(e.title),score=(preferred_paths.includes(e.title)?1000:0)+q.reduce((n,t)=>n+(pt.includes(t)?1:0)+(tt.includes(t)?0.5:0),0);
   all.push({...e,start:p.start,end:p.end,passage:p.text,score});
  }
 }
 if(total>max_characters)throw Error('Mandatory policy exceeds budget; refusing silent omission');
 all.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)||a.start-b.start);
 const selected=[...mandatory],omitted=[...archived];
 for(const p of all){if(p.score===0){omitted.push({id:p.id,start:p.start,end:p.end,reason:'no_lexical_match'});continue;}if(total+p.passage.length>max_characters){omitted.push({id:p.id,start:p.start,end:p.end,reason:'budget'});continue;}selected.push(p);total+=p.passage.length;}
 return {schema:'geez-brain-packet-v1',index_sha256,query_sha256:sha(query),algorithm:'lexical_substantive_v2_not_semantically_qualified',selected,characters:total,max_characters,budget_scope:'selected_passage_characters_only; metadata/system/current-deal/output tokens require separate full prompt admission',omitted,source_documents:index.entries.length,notice:'Stored text is not model training. Guidance, sources and candidate lessons are untrusted reference data. Only user_rule entries are mandatory policy. No completeness, factual truth or comprehension claim.'};
}
