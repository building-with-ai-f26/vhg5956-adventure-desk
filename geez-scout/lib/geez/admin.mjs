// Metadata-only readers. No reconciliation, cleanup, job creation or inference.
const states=new Set(['queued','running','completed','failed']);
const modes=new Set(['diligence','philosophy','compare','outreach','fit_vqa','prospect_vqa']);
const id=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v)?v:null;
const time=v=>Number.isSafeInteger(v)&&v>0?v:null;
const span=(a,b)=>time(a)&&time(b)&&b>=a?b-a:null;
function failure(error,status){if(status!=='failed')return null;if(typeof error==='string'&&/did not finish|lease expired/.test(error))return 'deadline_exceeded';if(typeof error==='string'&&/invalid|incomplete/.test(error))return 'invalid_or_incomplete_review';return 'review_failed';}
export function jobMetadata(row,now){const status=states.has(row.status)?row.status:'unknown';return {id:id(row.id),mode:modes.has(row.mode)?row.mode:'unknown',status,model:row.model==='gemma4:12b'?row.model:'unknown',created_at:time(row.created_at),claimed_at:time(row.started_at),finished_at:time(row.finished_at),queue_ms:span(row.created_at,row.started_at),processing_envelope_ms:span(row.started_at,row.finished_at),total_ms:span(row.created_at,row.finished_at),active_age_ms:['queued','running'].includes(status)?span(row.started_at||row.created_at,now):null,error_code:failure(row.error,status)};}
export function searchMetadata(row){
 let s;try{s=JSON.parse(row.review_json);}catch{}
 const empty={id:id(row.id),created_at:time(row.created_at),stage:'unknown',counts:null,job_ids:[]};
 if(!s||typeof s!=='object'||!['prospect-v1','shortlist-vqa-1'].includes(s.version))return empty;
 const stages=new Set(['ready','queued','reviewing','loading','completed','failed']),items=Array.isArray(s.items)?s.items.slice(0,1000):[];
 const prospect=s.version==='prospect-v1';
 if(prospect&&(!s.reviews||typeof s.reviews!=='object'||Array.isArray(s.reviews)))return empty;
 const reviews=prospect?Object.values(s.reviews).slice(0,1000):items.map(x=>x?.model_review).filter(Boolean);
 const outcomes=prospect?reviews:items.map(x=>x?.fit_review?.verdict==='candidate'?x?.model_review:x?.fit_review).filter(Boolean);
 return {id:id(row.id),created_at:time(row.created_at),stage:stages.has(s.status)?s.status:'unknown',counts:{assessed:reviews.length,selected:s.status==='completed'?outcomes.filter(r=>prospect?r?.decision==='investigate'&&r.relevance_grade>=2:r?.verdict==='candidate').length:null,deferred:outcomes.filter(r=>['defer','needs_evidence'].includes(r?.decision||r?.verdict)).length,excluded:outcomes.filter(r=>(r?.decision||r?.verdict)==='excluded').length,expected:Array.isArray(s.items)?Math.min(s.items.length,1000):null},job_ids:[...new Set([...(Array.isArray(s.job_ids)?s.job_ids:[]),s.job_id].filter(id))].slice(0,100)};
}
export async function readSnapshot(db,now){
 const all=async(sql,...v)=>(await db.prepare(sql).bind(...v).all()).results,since=now-86400000;
 const jobs=await all('SELECT id,mode,status,model,created_at,started_at,finished_at,error FROM qa_jobs WHERE expires_at>? AND created_at>=? ORDER BY created_at DESC LIMIT 100',now,since);
 const searches=await all('SELECT id,created_at,review_json FROM qa_searches WHERE expires_at>? AND created_at>=? ORDER BY created_at DESC LIMIT 50',now,since);
 const totals=await all('SELECT status,COUNT(*) AS count FROM qa_jobs WHERE expires_at>? AND created_at>=? GROUP BY status',now,since);
 const requests=await all("SELECT (SELECT COUNT(*) FROM qa_searches WHERE expires_at>? AND created_at>=?)+(SELECT COUNT(*) FROM qa_jobs WHERE expires_at>? AND created_at>=? AND mode NOT IN ('fit_vqa','prospect_vqa')) AS count",now,since,now,since);
 const w=await db.prepare("SELECT model,seen_at FROM qa_worker WHERE id='primary'").bind().first();
 const summary={requests:Number(requests[0]?.count||0),jobs:0,queued:0,running:0,completed:0,failed:0,unknown:0};for(const row of totals){const k=states.has(row.status)?row.status:'unknown';summary[k]+=Number(row.count);summary.jobs+=Number(row.count);}
 return {as_of:now,window_start:since,summary,worker:{online:!!w&&span(w.seen_at,now)!==null&&span(w.seen_at,now)<45000,last_seen:time(w?.seen_at),model:w?.model==='gemma4:12b'?w.model:null},jobs:jobs.map(j=>jobMetadata(j,now)),searches:searches.map(searchMetadata),limits:{job_rows:100,search_rows:50},measurement_note:'Processing envelope includes model work, validation and completion transport. Pure Ollama compute and historical detailed stages were not recorded. Counts cover unexpired records accepted in the last 24 hours.'};
}
export async function handleAdmin(req,env,path,now,h){
 const {response,fail,body,sha,passwordValid,mint,cookies,rate,run}=h,db=env.DB,hash=env.GEEZ_ADMIN_PASSWORD_HASH;
 const configured=typeof hash==='string'&&/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(hash)&&hash!==env.GEEZ_PASSWORD_HASH;
 if(!configured)fail(503,'Admin access is not provisioned. No operational data is exposed.');
 const kind='admin:'+ (await sha(hash)).slice(0,20),raw=cookies(req)['__Secure-geez_admin'];
 const authenticated=raw&&/^[a-f0-9]{64}$/.test(raw)?await db.prepare('SELECT hash FROM qa_auth_tokens WHERE hash=? AND kind=? AND expires_at>?').bind(await sha(raw),kind,now).first():null;
 const adminCookie=(value,age)=>'__Secure-geez_admin='+value+'; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;
 if(path==='/api/admin/login'&&req.method==='POST'){
  await rate(db,'admin-login-global',10,900000,now);const data=await body(req),p=data.password;
  if(typeof p!=='string'||p.length<32||p.length>200||!await passwordValid(p,hash)||await passwordValid(p,env.GEEZ_PASSWORD_HASH)||await sha(p)===env.GEEZ_WORKER_TOKEN_HASH)fail(401,'Admin sign-in failed.');
  const t=await mint(db,kind,null,now+1800000);return response({ok:true,expires_in_seconds:1800},200,[adminCookie(t,1800)]);
 }
 if(path==='/api/admin/session'&&req.method==='GET')return response({authenticated:!!authenticated});
 if(!authenticated)fail(401,'Separate admin sign-in required.');
 if(path==='/api/admin/logout'&&req.method==='POST'){await run(db,'DELETE FROM qa_auth_tokens WHERE hash=? AND kind=?',await sha(raw),kind);return response({ok:true},200,[adminCookie('',0)]);}
 if(path==='/api/admin/snapshot'&&req.method==='GET')return response(await readSnapshot(db,now));
 fail(404,'Admin route not found.');
}
