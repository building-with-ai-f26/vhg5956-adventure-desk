import {handleAdmin} from './admin.mjs';
import {prospectState,freshProspects,prospectEvidence,validateProspectOutput,prospectView} from './prospect-review.mjs';
import {rankCandidates,coverage,rankingMethod} from './discovery.mjs';
import {reviewCandidate,summarizeReviews,FIT_VQA_VERSION} from './fit-vqa.mjs';
// Server-only QA boundary. No old local profiles or databases are reachable here.
const HOUR=3600000, DAY=24*HOUR, MODEL='gemma4:12b';
const MODES=new Set(['philosophy','diligence','compare','outreach']);
const enc=new TextEncoder();
export const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}
export async function passwordHash(password,salt=token().slice(0,32)){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bytes=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256);return 'pbkdf2-sha256$100000$'+salt+'$'+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
async function passwordValid(password,expected){if(typeof expected!=='string'||!/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(expected))return false;return equal(await passwordHash(password,expected.split('$')[2]),expected);}
class Problem extends Error{constructor(status,message){super(message);this.status=status;}}
function fail(status,message){throw new Problem(status,message);}
function bounded(v,label,max){if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail(400,label+' is invalid.');return v.trim();}
function response(value,status=200,cookies=[]){const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});for(const c of cookies)headers.append('Set-Cookie',c);return new Response(JSON.stringify(value),{status,headers});}
function cookie(name,value,age=43200){return name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;}
function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2));}
async function body(req){if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'JSON required.');if(Number(req.headers.get('content-length')||0)>150000)fail(413,'Request is too large.');const reader=req.body?.getReader();let size=0,chunks=[];if(!reader)fail(400,'Request body required.');while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>150000){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length;}try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')fail(400,'JSON object required.');return data;}catch(e){if(e instanceof Problem)throw e;fail(400,'Invalid JSON.');}}
const stmt=(db,q,...v)=>db.prepare(q).bind(...v);
async function one(db,q,...v){return stmt(db,q,...v).first();}
async function run(db,q,...v){return stmt(db,q,...v).run();}
async function all(db,q,...v){return (await stmt(db,q,...v).all()).results;}
async function rate(db,key,max,window,now){const bucket=Math.floor(now/window),k=key+':'+bucket;const r=await one(db,'INSERT INTO qa_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',k,(bucket+1)*window);if(r.attempts>max)fail(429,'Too many attempts. Wait before trying again.');}
async function cleanup(db,now){await db.batch([stmt(db,'DELETE FROM qa_auth_tokens WHERE expires_at<=?',now),stmt(db,'DELETE FROM qa_jobs WHERE expires_at<=?',now),stmt(db,'DELETE FROM qa_searches WHERE expires_at<=?',now),stmt(db,'DELETE FROM qa_sessions WHERE expires_at<=?',now),stmt(db,'DELETE FROM qa_limits WHERE expires_at<=?',now),stmt(db,"UPDATE qa_jobs SET status='failed',error='The local worker did not finish. Submit a new review when it is online.',finished_at=? WHERE status='running' AND started_at<?",now,now-10*60*1000)]);}
async function gate(req,db,now){const v=cookies(req).geez_gate;if(!v||!/^[a-f0-9]{64}$/.test(v))return null;return one(db,"SELECT hash FROM qa_auth_tokens WHERE hash=? AND kind='gate' AND expires_at>?",await sha(v),now);}
async function current(req,db,now){const v=cookies(req).geez_session;if(!v||!/^[a-f0-9]{64}$/.test(v))return null;return one(db,"SELECT s.* FROM qa_sessions s JOIN qa_auth_tokens t ON t.session_id=s.id WHERE t.hash=? AND t.kind='session' AND t.expires_at>? AND s.expires_at>?",await sha(v),now,now);}
function sessionView(s){return s?{id:s.id,name:s.name,saving:!!s.saving,code_kind:s.chosen_code_hash?'chosen':s.code_hash?'generated':'temporary'}:null;}
async function workerStatus(db,now){const w=await one(db,"SELECT model,seen_at FROM qa_worker WHERE id='primary'");return {online:!!w&&now-w.seen_at<45000,model:w?.model||null};}
async function mint(db,kind,sessionId,expires){const v=token();await run(db,'INSERT INTO qa_auth_tokens(hash,kind,session_id,expires_at) VALUES(?,?,?,?)',await sha(v),kind,sessionId,expires);return v;}
function jobView(j){if(!j)return null;return {id:j.id,status:j.status,created_at:new Date(j.created_at).toISOString(),model:j.model,mode:j.mode,question:j.question,evidence:j.evidence,output:j.output,error:j.error};}
// The new state is separate from the original saved snapshot. No client-supplied
// approval or evidence flags can certify a candidate, and the model only downgrades.
const SEARCH_VERSION='shortlist-vqa-1', BATCH_SIZE=5;
const PIPELINE='Server evidence gate, then one local Ollama falsifiable critique per batch of at most five. Only both-pass targets may be suggested. This is dated pilot research, not live discovery or completed diligence.';
const stateOf=row=>{try{const state=JSON.parse(row.review_json);return state?.version===SEARCH_VERSION&&state.gate_version===FIT_VQA_VERSION?state:null;}catch{return null;}};
const approved=c=>c.fit_review.verdict==='candidate'&&c.model_review?.verdict==='candidate';
const rejected=c=>c.fit_review.verdict!=='candidate'||c.model_review&&c.model_review.verdict!=='candidate';
const unreviewed=state=>state.items.filter(c=>c.fit_review.verdict==='candidate'&&!c.model_review);
const freshSearch=(input,now,legacy=false)=>{
 const items=rankCandidates(input,now).map(c=>({...c,fit_review:reviewCandidate(input,c)}));
 const pending=items.some(c=>c.fit_review.verdict==='candidate');
 return {version:SEARCH_VERSION,gate_version:FIT_VQA_VERSION,items,status:pending?(legacy?'failed':'ready'):'completed',batch_ids:[],job_id:null,error:pending&&legacy?'This saved shortlist predates backend model VQA. Its original snapshot is preserved. Retry to review eligible targets before they can be suggested.':null,legacy_rechecked:legacy,reviewed_at:new Date(now).toISOString()};
};
const searchRow=(db,id,sessionId)=>one(db,'SELECT * FROM qa_searches WHERE id=? AND session_id=?',id,sessionId);
async function saveState(db,row,state,target=row.target){
 await run(db,'UPDATE qa_searches SET review_json=?,target=? WHERE id=? AND session_id=? AND review_json=?',JSON.stringify(state),target,row.id,row.session_id,row.review_json);
 return searchRow(db,row.id,row.session_id);
}
async function ensureState(db,row,now){
 if(stateOf(row))return row;
 const state=freshSearch(JSON.parse(row.request_json),now,true);
 state.original_counts={loaded:row.loaded,target:row.target};
 await run(db,'UPDATE qa_searches SET review_json=?,loaded=0,target=0 WHERE id=? AND session_id=? AND review_json IS ?',JSON.stringify(state),row.id,row.session_id,row.review_json??null);
 return searchRow(db,row.id,row.session_id);
}
function batchEvidence(state,ids){
 return {candidates:ids.map(id=>{
  const c=state.items.find(item=>item.id===id),g=c.fit_review;
  return {id:c.id,name:c.name,overview:c.overview,subsector:c.subsector,
   sources:g.observed_evidence.map((e,i)=>({id:c.id+'/e'+(i+1),claim:e.claim+' [Dated pilot source: '+e.url+']'})),
   gate:{hypothesis:g.hypothesis,required_evidence:g.required_evidence,mechanism:g.mechanism,cost_classification:g.cost_classification,materiality:g.materiality}};
 })};
}
// Fail the entire batch on invalid IDs, omissions, duplicates, foreign citations
// or schema errors. Model prose remains unverified commentary, never new evidence.
function validateFitOutput(output,evidence){
 const invalid=()=>{throw new Error('The local model returned an invalid VQA batch. No targets in this batch were approved. Retry explicitly when the worker is ready.');};
 let data,source;try{data=JSON.parse(output);source=JSON.parse(evidence);}catch{invalid();}
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!exact(data,['reviews'])||!Array.isArray(data.reviews)||!Array.isArray(source?.candidates)||!source.candidates.length||source.candidates.length>BATCH_SIZE||data.reviews.length!==source.candidates.length)invalid();
 const candidates=new Map(source.candidates.map(c=>[c.id,c])),seen=new Set();
 if(candidates.size!==source.candidates.length)invalid();
 return data.reviews.map(r=>{
  if(!exact(r,['candidate_id','verdict','reason','mechanism','falsifier','evidence_ids'])||!candidates.has(r.candidate_id)||seen.has(r.candidate_id)||!['candidate','needs_evidence','excluded'].includes(r.verdict))invalid();
  seen.add(r.candidate_id);
  for(const [key,max] of [['reason',600],['mechanism',400],['falsifier',400]])if(typeof r[key]!=='string'||!r[key].trim()||r[key].length>max||r[key].includes('\0'))invalid();
  const allowed=new Set(candidates.get(r.candidate_id).sources.map(s=>s.id));
  if(!Array.isArray(r.evidence_ids)||r.evidence_ids.length>5||new Set(r.evidence_ids).size!==r.evidence_ids.length||r.evidence_ids.some(id=>typeof id!=='string'||!allowed.has(id))||r.verdict==='candidate'&&!r.evidence_ids.length)invalid();
  return {...r,reason:r.reason.trim(),mechanism:r.mechanism.trim(),falsifier:r.falsifier.trim()};
 });
}
async function startBatch(db,row,now){
 const state=stateOf(row);
 if(!state||!['ready','failed','completed'].includes(state.status))return row;
 const ids=state.status==='failed'&&state.batch_ids.length?state.batch_ids:unreviewed(state).slice(0,BATCH_SIZE).map(c=>c.id);
 if(!ids.length)return saveState(db,row,{...state,status:'completed',error:null});
 const failed=message=>saveState(db,row,{...state,batch_ids:ids,status:'failed',error:message,job_id:null});
 if(!(await workerStatus(db,now)).online)return failed('Vic-PC is offline or the local worker is not connected. No pending targets were approved. Retry this batch when it is online.');
 try{await rate(db,'reviews:'+row.session_id,12,HOUR,now);}catch(e){if(e instanceof Problem)return failed(e.message);throw e;}
 const question=JSON.parse(row.request_json).thesis,evidence=JSON.stringify(batchEvidence(state,ids));
 if(evidence.length>20000)return failed('The admitted evidence exceeds the bounded model input. No targets were approved.');
 const jobId=crypto.randomUUID(),next={...state,status:'queued',batch_ids:ids,job_id:jobId,error:null};
 // Atomic insert + transition prevents duplicate inference for concurrent calls.
 // Session and global queue bounds are checked inside the same SQL transaction.
 await db.batch([
  stmt(db,"INSERT INTO qa_jobs(id,session_id,idempotency_key,status,mode,question,evidence,model,created_at,expires_at) SELECT ?,?,?,'queued','fit_vqa',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM qa_searches WHERE id=? AND session_id=? AND review_json=?) AND NOT EXISTS(SELECT 1 FROM qa_jobs WHERE session_id=? AND status IN ('queued','running')) AND (SELECT COUNT(*) FROM qa_jobs WHERE status IN ('queued','running'))<20",jobId,row.session_id,jobId,question,evidence,MODEL,now,row.expires_at,row.id,row.session_id,row.review_json,row.session_id),
  stmt(db,'UPDATE qa_searches SET review_json=? WHERE id=? AND session_id=? AND review_json=? AND EXISTS(SELECT 1 FROM qa_jobs WHERE id=?)',JSON.stringify(next),row.id,row.session_id,row.review_json,jobId)
 ]);
 const latest=await searchRow(db,row.id,row.session_id);
 if(latest.review_json!==row.review_json)return latest;
 const busy=await one(db,"SELECT id FROM qa_jobs WHERE session_id=? AND status IN ('queued','running')",row.session_id);
 return failed(busy?'This session already has a queued or running review. Finish it, then retry this batch.':'The QA queue is full. Try this batch again shortly.');
}
async function reconcileSearch(db,row,now){
 row=await ensureState(db,row,now);const state=stateOf(row);
 if(state.status==='ready')return startBatch(db,row,now);
 if(!['queued','reviewing'].includes(state.status))return row;
 let job=await one(db,'SELECT * FROM qa_jobs WHERE id=? AND session_id=?',state.job_id,row.session_id);
 if(job?.status==='queued'&&(!(await workerStatus(db,now)).online||now-job.created_at>10*60*1000)){
  await run(db,"UPDATE qa_jobs SET status='failed',error=?,finished_at=? WHERE id=? AND status='queued'",'The worker is offline or this batch waited too long. No pending targets were approved. Retry explicitly when the worker is online.',now,job.id);
  job=await one(db,'SELECT * FROM qa_jobs WHERE id=?',job.id);
 }
 if(job?.status==='running'&&now-job.started_at>10*60*1000){
  await run(db,"UPDATE qa_jobs SET status='failed',error=?,finished_at=? WHERE id=? AND status='running'",'The local worker did not finish this batch. Retry explicitly when it is ready.',now,job.id);
  job=await one(db,'SELECT * FROM qa_jobs WHERE id=?',job.id);
 }
 if(!job||job.status==='failed')return saveState(db,row,{...state,status:'failed',error:job?.error||'The VQA batch is unavailable. No pending targets were approved. Retry explicitly.'});
 if(job.status==='completed'){
  try{
   const reviews=validateFitOutput(job.output,job.evidence),expected=new Set(state.batch_ids);
   if(reviews.length!==expected.size||reviews.some(r=>!expected.has(r.candidate_id)))throw new Error('The VQA batch did not match the requested targets. No pending targets were approved.');
   const byId=new Map(reviews.map(r=>[r.candidate_id,r]));
   const items=state.items.map(c=>byId.has(c.id)&&c.fit_review.verdict==='candidate'?{...c,model_review:{...byId.get(c.id),model:job.model,reviewed_at:new Date(job.finished_at).toISOString()}}:c);
   const total=items.filter(approved).length;
   return saveState(db,row,{...state,items,status:total>row.loaded?'loading':'completed',error:null,reviewed_at:new Date(now).toISOString()},total);
  }catch(e){return saveState(db,row,{...state,status:'failed',error:e.message});}
 }
 const status=job.status==='running'?'reviewing':'queued';
 return state.status===status?row:saveState(db,row,{...state,status});
}
function searchView(row){
 const input=JSON.parse(row.request_json),state=stateOf(row);
 if(!state)throw new Error('Unreviewed snapshot');
 const accepted=state.items.filter(approved).map((c,i)=>({...c,rank:i+1})),rejections=state.items.filter(rejected);
 const status=state.status==='loading'&&row.loaded>=accepted.length?'completed':state.status;
 const waiting=['queued','reviewing'].includes(status),pending=unreviewed(state).length;
 const batchComplete=state.batch_ids.length>0&&state.batch_ids.every(id=>state.items.find(c=>c.id===id)?.model_review);
 const messages={queued:'Waiting for the local Ollama worker. No pending targets are suggested.',reviewing:'Local Ollama is testing the batch against the thesis, source claims and falsifiers. No partial model progress is estimated.',loading:'The evidence gate and local model critique are complete. Loading the approved dossiers.',completed:accepted.length?'Only evidence-gated, model-reviewed targets are shown. This is preliminary pilot research.':'No targets passed both required checks. No results were padded or invented.',failed:state.error};
 const summary=summarizeReviews(state.items.map(c=>({...c.fit_review,verdict:c.model_review?.verdict||c.fit_review.verdict})));
 const expire=c=>c.listing_status==='active_sale'&&c.deadline&&c.deadline<new Date().toISOString().slice(0,10)?{...c,listing_status:'expired_sale',availability:'The published bid deadline has passed. This is a saved research snapshot, not a currently available sale.'}:c;
 return {id:row.id,...input,created_at:new Date(row.created_at).toISOString(),status,
  total:accepted.length,loaded:Math.min(row.loaded,accepted.length),available_total:accepted.length,has_more:status==='completed'&&pending>0,
  results:accepted.slice(0,row.loaded).map(expire),error:state.error,retryable:status==='failed',
  review_progress:{stage:status==='reviewing'?'model_review':status,completed:batchComplete?state.batch_ids.length:0,total:state.batch_ids.length,message:messages[status]||'Checking the admitted evidence.'},
  screening:{...summary,version:SEARCH_VERSION,methodology:PIPELINE,candidate_count:accepted.length,pending_count:pending,notice:summary.notice+' Local model critique cannot upgrade a failed evidence gate or establish missing financial facts.',reviewed_at:state.reviewed_at,legacy_rechecked:state.legacy_rechecked,rejected:rejections.map(expire)},
  coverage,ranking_method:rankingMethod,warnings:[...(input.budget?['Check size is recorded, not used for suitability or valuation screening; complete pricing and eligibility data are unavailable.']:[]),...(input.inspiration?['Investor inspiration is recorded verbatim. No claim is made to reproduce that investor or their returns.']:[]),...(input.geography?['Geographic fit uses only the limited locations documented in this pilot. Verify actual asset location.']:[]),...(waiting?['No pending target is approved until the entire model batch has been validated.']:[])]};
}
async function startProspect(db,row,now){
 const state=prospectState(row);if(!state||!['ready','failed'].includes(state.status))return row;
 const ids=state.batch_ids.length?state.batch_ids:state.items.filter(c=>!state.reviews[c.id]).slice(0,4).map(c=>c.id);
 if(!ids.length)return saveState(db,row,{...state,status:'completed',error:null});
 const failed=error=>saveState(db,row,{...state,status:'failed',batch_ids:ids,job_id:null,error});
 if(!(await workerStatus(db,now)).online)return failed('Vic-PC is offline. No shortlist released. Retry explicitly when online.');
 try{await rate(db,'reviews:'+row.session_id,12,HOUR,now);}catch(e){if(e instanceof Problem)return failed(e.message);throw e;}
 const evidence=prospectEvidence(state,ids);if(evidence.length>20000)return failed('Source evidence exceeds the supported batch size.');
 const id=crypto.randomUUID(),next={...state,status:'queued',batch_ids:ids,job_id:id,job_ids:[...state.job_ids,id],error:null};
 await db.batch([
 stmt(db,"INSERT INTO qa_jobs(id,session_id,idempotency_key,status,mode,question,evidence,model,created_at,expires_at) SELECT ?,?,?,'queued','prospect_vqa',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM qa_searches WHERE id=? AND session_id=? AND review_json=?) AND NOT EXISTS(SELECT 1 FROM qa_jobs WHERE session_id=? AND status IN ('queued','running')) AND (SELECT COUNT(*) FROM qa_jobs WHERE status IN ('queued','running'))<20",id,row.session_id,id,JSON.parse(row.request_json).thesis,evidence,MODEL,now,row.expires_at,row.id,row.session_id,row.review_json,row.session_id),
 stmt(db,'UPDATE qa_searches SET review_json=? WHERE id=? AND session_id=? AND review_json=? AND EXISTS(SELECT 1 FROM qa_jobs WHERE id=?)',JSON.stringify(next),row.id,row.session_id,row.review_json,id)]);
 const latest=await searchRow(db,row.id,row.session_id);return latest.review_json!==row.review_json?latest:failed('A review is already active or the queue is full. Retry explicitly.');
}
async function reconcileProspect(db,row,now){
 const state=prospectState(row);if(state.status==='ready')return startProspect(db,row,now);if(!['queued','reviewing'].includes(state.status))return row;
 let job=await one(db,'SELECT * FROM qa_jobs WHERE id=? AND session_id=?',state.job_id,row.session_id);
 if(job&&(job.status==='queued'&&(!(await workerStatus(db,now)).online||now-job.created_at>10*60*1000)||job.status==='running'&&now-job.started_at>10*60*1000)){
 await run(db,"UPDATE qa_jobs SET status='failed',error='Worker offline or review deadline expired. Retry explicitly.',finished_at=? WHERE id=? AND status IN ('queued','running')",now,job.id);job=await one(db,'SELECT * FROM qa_jobs WHERE id=?',job.id);}
 if(!job||job.status==='failed')return saveState(db,row,{...state,status:'failed',error:job?.error||'Review unavailable. Retry explicitly.'});
 if(job.status==='completed'){
 try{const reviews=validateProspectOutput(job.output,job.evidence);if(reviews.some(r=>!state.batch_ids.includes(r.candidate_id)))throw new Error('Review IDs do not match batch.');
 const merged={...state.reviews};for(const r of reviews)merged[r.candidate_id]={...r,reviewed_at:new Date(job.finished_at).toISOString(),model:job.model,job_id:job.id};
 row=await saveState(db,row,{...state,reviews:merged,status:Object.keys(merged).length===state.items.length?'completed':'ready',batch_ids:[],job_id:null,error:null});
 return prospectState(row).status==='ready'?startProspect(db,row,now):row;
 }catch(e){return saveState(db,row,{...state,status:'failed',error:e.message});}}
 const status=job.status==='running'?'reviewing':'queued';return state.status===status?row:saveState(db,row,{...state,status});
}
async function workerRoute(req,env,path,now){const auth=req.headers.get('authorization')||'';if(!env.GEEZ_WORKER_TOKEN_HASH||!/^Bearer [a-f0-9]{64}$/.test(auth)||!equal(await sha(auth.slice(7)),env.GEEZ_WORKER_TOKEN_HASH))fail(401,'Worker authorization required.');if(req.method!=='POST')fail(405,'POST required.');const data=await body(req),db=env.DB;
if(path==='/api/worker/heartbeat'||path==='/api/worker/claim'){if(data.model!==MODEL)fail(400,'Installed QA model required.');const wid=bounded(data.worker_id,'Worker ID',80);await run(db,"INSERT INTO qa_worker(id,worker_id,model,seen_at) VALUES('primary',?,?,?) ON CONFLICT(id) DO UPDATE SET worker_id=excluded.worker_id,model=excluded.model,seen_at=excluded.seen_at",wid,MODEL,now);if(path.endsWith('/heartbeat'))return response({ok:true});await cleanup(db,now);const lease=token();const j=await one(db,"UPDATE qa_jobs SET status='running',started_at=?,lease_hash=? WHERE id=(SELECT id FROM qa_jobs WHERE status='queued' AND expires_at>? ORDER BY created_at,id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM qa_jobs WHERE status='running') RETURNING id,mode,question,evidence",now,await sha(lease),now);return response({job:j?{...j,lease_token:lease}:null});}
if(path==='/api/worker/complete'){const id=bounded(data.id,'Job ID',80),lease=bounded(data.lease_token,'Lease',80);const j=await one(db,'SELECT * FROM qa_jobs WHERE id=? AND expires_at>?',id,now);if(!j||!equal(j.lease_hash,await sha(lease)))fail(404,'Job is unavailable.');if(j.status==='completed'||j.status==='failed')return response({ok:true,status:j.status});if(j.status!=='running')fail(409,'Job is not running.');if(data.model!==MODEL)fail(400,'QA model mismatch.');if(['fit_vqa','prospect_vqa'].includes(j.mode)&&(!j.started_at||now-j.started_at>10*60*1000)){await run(db,"UPDATE qa_jobs SET status='failed',error='The local VQA lease expired. No pending targets were approved. Retry explicitly.',finished_at=? WHERE id=? AND status='running'",now,id);return response({ok:true,status:(await one(db,'SELECT status FROM qa_jobs WHERE id=?',id)).status});}const hasOutput=typeof data.output==='string'&&!!data.output.trim();let output,error;
if(['fit_vqa','prospect_vqa'].includes(j.mode)){
 try{output=bounded(data.output,'Output',30000);(j.mode==='prospect_vqa'?validateProspectOutput:validateFitOutput)(output,j.evidence);error=null;}
 catch{output=null;error=typeof data.error==='string'&&data.error.trim()&&data.error.length<=400?data.error.trim():'The local model returned an invalid or incomplete VQA batch. No pending targets were approved. Retry explicitly when the worker is ready.';}
}else{output=hasOutput?bounded(data.output,'Output',30000):null;error=hasOutput?null:bounded(data.error,'Error',400);}
const validOutput=output!==null;await run(db,"UPDATE qa_jobs SET status=?,output=?,error=?,finished_at=? WHERE id=? AND status='running'",validOutput?'completed':'failed',output,error,now,id);
const saved=await one(db,'SELECT status FROM qa_jobs WHERE id=?',id);return response({ok:true,status:saved.status});}
fail(404,'Not found.');}
export async function handleApi(req,env){const now=Date.now();try{const url=new URL(req.url),path=url.pathname.replace(/\/$/,'');if(!env.DB)fail(503,'QA storage is not ready.');if(path.startsWith('/api/worker/'))return await workerRoute(req,env,path,now);if(req.method!=='GET'&&req.method!=='POST')fail(405,'Method not allowed.');if(req.method==='POST'&&req.headers.get('origin')!==url.origin)fail(403,'Same-origin request required.');const db=env.DB;
if(path.startsWith('/api/admin/'))return await handleAdmin(req,env,path,now,{response,fail,body,sha,passwordValid,mint,cookies,rate,run});
if(path==='/api/login'&&req.method==='POST'){if(!env.GEEZ_PASSWORD_HASH)fail(503,'QA login is not configured yet.');const ip=await sha(req.headers.get('cf-connecting-ip')||'shared');await rate(db,'login-ip:'+ip,12,15*60*1000,now);await rate(db,'login-global',120,15*60*1000,now);const data=await body(req);if(typeof data.password!=='string'||data.password.length>200||!await passwordValid(data.password,env.GEEZ_PASSWORD_HASH))fail(401,'That password did not match.');await cleanup(db,now);const t=await mint(db,'gate',null,now+12*HOUR);return response({ok:true},200,[cookie('geez_gate',t)]);}
if(path==='/api/logout'&&req.method==='POST'){const c=cookies(req);for(const key of ['geez_gate','geez_session'])if(c[key])await run(db,'DELETE FROM qa_auth_tokens WHERE hash=?',await sha(c[key]));return response({ok:true},200,[cookie('geez_gate','',0),cookie('geez_session','',0)]);}
const g=await gate(req,db,now);if(path==='/api/me'&&req.method==='GET'){return response({authenticated:!!g,session:g?sessionView(await current(req,db,now)):null,worker:g?await workerStatus(db,now):{online:false,model:null}});}if(!g)fail(401,'Enter the group password to continue.');
if(path==='/api/status'&&req.method==='GET')return response({worker:await workerStatus(db,now)});
if(path==='/api/session'&&req.method==='POST'){await rate(db,'session-gate:'+g.hash,20,HOUR,now);await rate(db,'session-global',200,DAY,now);const data=await body(req);const name=bounded(data.name,'Name',80);if(typeof data.save!=='boolean')fail(400,'Choose whether to save this session.');await cleanup(db,now);let s,recovery;
if(data.session_action!==undefined){
 const action=data.session_action;
 if(!['custom_create','custom_return'].includes(action)||!data.save)fail(400,'Choose a saved-session action.');
 const code=bounded(data.code,'Session code',128),nameKey=await sha(name.normalize('NFKC').toLowerCase());
 const ip=await sha(req.headers.get('cf-connecting-ip')||'shared');
 await rate(db,'chosen-ip:'+ip,20,HOUR,now);await rate(db,'chosen-name:'+nameKey,8,HOUR,now);await rate(db,'chosen-gate:'+g.hash,8,15*60*1000,now);await rate(db,'chosen-global',150,HOUR,now);
 s=await one(db,'SELECT * FROM qa_sessions WHERE name_key=? AND expires_at>?',nameKey,now);
 if(action==='custom_create'&&!s){
  const verifier=await passwordHash(code),id=crypto.randomUUID();
  await run(db,'INSERT OR IGNORE INTO qa_sessions(id,name,saving,name_key,chosen_code_hash,created_at,expires_at) VALUES(?,?,1,?,?,?,?)',id,name,nameKey,verifier,now,now+30*DAY);
  s=await one(db,'SELECT * FROM qa_sessions WHERE name_key=? AND expires_at>?',nameKey,now);
  if(!s||s.id!==id&&!await passwordValid(code,s.chosen_code_hash))fail(404,'Unable to open this saved session. Check the name and code, or use a different name to create one.');
 }else{
  const expected=s?.chosen_code_hash||'pbkdf2-sha256$100000$00000000000000000000000000000000$'+'0'.repeat(64);
  const valid=await passwordValid(code,expected);
  if(!s||!valid)fail(404,'Unable to open this saved session. Check the name and code, or use a different name to create one.');
 }
}else if(data.code){const code=bounded(data.code,'Recovery code',80);if(!/^[a-f0-9]{64}$/.test(code))fail(400,'Use the full generated session code, or leave it blank for a new session.');s=await one(db,'SELECT * FROM qa_sessions WHERE code_hash=? AND expires_at>?',await sha(code),now);if(!s)fail(404,'Session code was not found or has expired.');}else{const id=crypto.randomUUID();recovery=data.save?token():undefined;await run(db,'INSERT INTO qa_sessions(id,name,saving,code_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)',id,name,data.save?1:0,recovery?await sha(recovery):null,now,now+(data.save?30*DAY:DAY));s=await one(db,'SELECT * FROM qa_sessions WHERE id=?',id);}
const t=await mint(db,'session',s.id,Math.min(s.expires_at,now+12*HOUR));return response({session:sessionView(s),...(recovery?{recovery_code:recovery}:{})},200,[cookie('geez_session',t)]);}
const s=await current(req,db,now);if(!s)fail(401,'Open or restore a QA session first.');
if(path==='/api/prospect-search'&&req.method==='POST'){
 const data=await body(req),thesis=bounded(data.thesis,'Thesis',2000),key=bounded(data.idempotency_key,'Retry key',80);if(!/^[a-f0-9-]{36}$/i.test(key))fail(400,'A unique retry key is required.');
 let row=await one(db,'SELECT * FROM qa_searches WHERE session_id=? AND idempotency_key=? AND expires_at>?',s.id,key,now);
 if(row){if(!prospectState(row))fail(409,'Retry key belongs to another search type.');return response({search:prospectView(await reconcileProspect(db,row,now))});}
 await rate(db,'discover:'+s.id,20,HOUR,now);await cleanup(db,now);const state=freshProspects(),id=crypto.randomUUID();
 await run(db,'INSERT OR IGNORE INTO qa_searches(id,session_id,idempotency_key,request_json,candidates_json,review_json,loaded,target,created_at,expires_at) VALUES(?,?,?,?,?,?,0,0,?,?)',id,s.id,key,JSON.stringify({thesis}),JSON.stringify(state.items),JSON.stringify(state),now,s.expires_at);
 row=await one(db,'SELECT * FROM qa_searches WHERE session_id=? AND idempotency_key=?',s.id,key);if(!prospectState(row))fail(409,'Retry key belongs to another search type.');return response({search:prospectView(await reconcileProspect(db,row,now))},202);
}
if(path==='/api/prospect-searches'&&req.method==='GET'){
 const rows=await all(db,"SELECT * FROM qa_searches WHERE session_id=? AND expires_at>? AND json_extract(review_json,'$.version')='prospect-v1' ORDER BY created_at DESC LIMIT 30",s.id,now);return response({searches:rows.map(prospectView)});
}
if(path.startsWith('/api/prospect-search/')){
 const match=path.match(/^\/api\/prospect-search\/([a-f0-9-]{36})(?:\/(retry))?$/i);if(!match)fail(404,'Prospect search not found.');
 let row=await one(db,'SELECT * FROM qa_searches WHERE id=? AND session_id=? AND expires_at>?',match[1],s.id,now);if(!row||!prospectState(row))fail(404,'Prospect search not found in this session.');
 if(req.method==='GET'&&!match[2])row=await reconcileProspect(db,row,now);
 else if(req.method==='POST'&&match[2]==='retry'){await body(req);row=await reconcileProspect(db,row,now);if(prospectState(row).status==='failed')row=await startProspect(db,row,now);}
 else fail(405,'Method not allowed.');return response({search:prospectView(row)});
}
if(path==='/api/discover'&&req.method==='POST')fail(410,'This shortlist submission flow has retired. Reload and use the fresh Ollama prospect search. No new shortlist was created.');
if(path==='/api/discoveries'&&req.method==='GET'){
 const rows=await all(db,"SELECT * FROM qa_searches WHERE session_id=? AND expires_at>? AND COALESCE(json_extract(review_json,'$.version'),'')!='prospect-v1' ORDER BY created_at DESC LIMIT 30",s.id,now),searches=[];
 for(const row of rows.filter(r=>!prospectState(r)))searches.push(searchView(await reconcileSearch(db,row,now)));
 return response({searches});
}
if(path.startsWith('/api/discover/')){
 const match=path.match(/^\/api\/discover\/([a-f0-9-]{36})(?:\/(advance|more|retry))?$/i);if(!match)fail(404,'Shortlist not found in this session.');
 let row=await one(db,'SELECT * FROM qa_searches WHERE id=? AND session_id=? AND expires_at>?',match[1],s.id,now);if(!row||prospectState(row))fail(404,'Shortlist not found in this session.');
 if(req.method==='POST'&&match[2]){
  await body(req);row=await reconcileSearch(db,row,now);const state=stateOf(row);
  if(match[2]==='advance'&&state.status==='loading'){
   await run(db,'UPDATE qa_searches SET loaded=MIN(loaded+1,target) WHERE id=? AND session_id=? AND review_json=?',row.id,s.id,row.review_json);
   row=await searchRow(db,row.id,s.id);
   const latestState=stateOf(row);
   if(latestState.status==='loading'&&row.loaded>=row.target)row=await saveState(db,row,{...latestState,status:'completed'});
  }else if(match[2]==='more'&&searchView(row).has_more)row=await startBatch(db,row,now);
  else if(match[2]==='retry'&&state.status==='failed')row=await startBatch(db,row,now);
 }else if(req.method==='GET'&&!match[2])row=await reconcileSearch(db,row,now);
 else fail(405,'Method not allowed.');
 return response({search:searchView(row)});
}
if(path==='/api/results'&&req.method==='GET'){return response({results:(await all(db,"SELECT * FROM qa_jobs WHERE session_id=? AND status='completed' AND mode NOT IN ('fit_vqa','prospect_vqa') AND expires_at>? ORDER BY created_at DESC LIMIT 100",s.id,now)).map(jobView)});}
if(path.startsWith('/api/jobs/')&&req.method==='GET'){const j=await one(db,'SELECT * FROM qa_jobs WHERE id=? AND session_id=? AND expires_at>?',path.slice('/api/jobs/'.length),s.id,now);if(!j||['fit_vqa','prospect_vqa'].includes(j.mode))fail(404,'Review not found in this session.');return response({job:jobView(j)});}
if(path==='/api/review'&&req.method==='POST'){const data=await body(req);if(!MODES.has(data.mode))fail(400,'Choose a supported research mode.');const question=bounded(data.question,'Question',2000),evidence=bounded(data.evidence,'Evidence',20000),key=bounded(data.idempotency_key,'Retry key',80);if(!/^[a-f0-9-]{36}$/i.test(key))fail(400,'A unique review retry key is required.');const previous=await one(db,'SELECT * FROM qa_jobs WHERE session_id=? AND idempotency_key=? AND expires_at>?',s.id,key,now);if(previous){if(['fit_vqa','prospect_vqa'].includes(previous.mode))fail(404,'Review not found in this session.');return response({job:jobView(previous)});}await cleanup(db,now);await rate(db,'reviews:'+s.id,12,HOUR,now);if(!(await workerStatus(db,now)).online)fail(503,'Vic-PC is offline or the local worker is not connected. Your inputs are still here.');const busy=await one(db,"SELECT id FROM qa_jobs WHERE session_id=? AND status IN ('queued','running')",s.id);if(busy)fail(409,'This session already has a queued or running review.');const count=await one(db,"SELECT COUNT(*) AS n FROM qa_jobs WHERE status IN ('queued','running')");if(count.n>=20)fail(429,'The QA queue is full. Try again shortly.');const id=crypto.randomUUID();await run(db,"INSERT INTO qa_jobs(id,session_id,idempotency_key,status,mode,question,evidence,model,created_at,expires_at) SELECT ?,?,?,'queued',?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM qa_jobs WHERE session_id=? AND status IN ('queued','running')) AND (SELECT COUNT(*) FROM qa_jobs WHERE status IN ('queued','running'))<20",id,s.id,key,data.mode,question,evidence,MODEL,now,s.expires_at,s.id);const j=await one(db,'SELECT * FROM qa_jobs WHERE session_id=? AND idempotency_key=?',s.id,key);if(!j)fail(409,'A review was just queued. Refresh before retrying.');return response({job:jobView(j)},202);}
fail(404,'Not found.');}catch(e){if(e instanceof Problem)return response({error:e.message},e.status);return response({error:'The QA service could not complete this request. Your local inputs have not been changed.'},503);}}
