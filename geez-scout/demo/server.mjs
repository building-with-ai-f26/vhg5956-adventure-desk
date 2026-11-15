import {recordFailedExperiment} from '../research/lesson-store.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {handleApi,passwordHash,sha} from '../lib/geez/api.mjs';
import {research as legacyResearch} from '../research/engine.mjs';
import {developThesis as legacyDevelopThesis,thesisInput} from '../research/thesis.mjs';
import {skills} from '../research/skills.mjs';
import {libraryInventory,LIBRARY_SHA256} from '../research/library.mjs';
import {knowledgeSession} from '../research/knowledge.mjs';
import {generate,isBusy,inventory} from '../research/models.mjs';
import {extensionInventory,EXTENSION_SPEC_SHA256} from '../research/extension.mjs';
import {dataRoomFiles} from '../research/data-room.mjs';
import {debtScenario} from '../research/debt-scenario.mjs';
import {prepareDeal} from '../research/deal-packet.mjs';
import {planningZip} from '../research/zip.mjs';
import {realScout,localScoutThesis} from '../research/scout-workflow.mjs';
import {scoutLocalInventory} from '../research/scout-local-models.mjs';
import {simpleScout as baselineScout} from '../research/simple-scout.mjs';
import {simpleThesis as baselineThesis} from '../research/simple-thesis.mjs';
import {LOCAL_VQA_SKILLS} from '../research/local-feedback-cycle.mjs';
import {captureProductEvent} from '../research/product-analytics.mjs';
try{process.loadEnvFile(new URL('../.env',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stateName=process.env.GEEZ_DEMO_STATE_DIR||'.demo-state';
if(!/^\.[a-z0-9-]+$/.test(stateName))throw Error('Use an isolated state-folder name.');
const stateDir=resolve(root,stateName);mkdirSync(stateDir,{recursive:true});
const db=new DatabaseSync(resolve(stateDir,'demo.sqlite'));
db.exec('PRAGMA journal_mode=WAL;');
db.exec('CREATE TABLE IF NOT EXISTS demo_migrations(name TEXT PRIMARY KEY);');
for(const name of readdirSync(resolve(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())if(!db.prepare('SELECT name FROM demo_migrations WHERE name=?').get(name)){db.exec('BEGIN');try{db.exec(readFileSync(resolve(root,'drizzle',name),'utf8'));db.prepare('INSERT INTO demo_migrations VALUES(?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
db.exec('CREATE TABLE IF NOT EXISTS demo_research(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, retry_key TEXT NOT NULL, status TEXT NOT NULL, query TEXT NOT NULL, notes TEXT NOT NULL, progress TEXT, result TEXT, error TEXT, created_at INTEGER NOT NULL, UNIQUE(session_id,retry_key));');
if(!db.prepare('PRAGMA table_info(demo_research)').all().some(c=>c.name==='dual'))db.exec('ALTER TABLE demo_research ADD COLUMN dual INTEGER NOT NULL DEFAULT 1;');
for(const [name,type] of [['intent',"TEXT NOT NULL DEFAULT 'sourcing'"],['kind',"TEXT NOT NULL DEFAULT 'research'"],['category',"TEXT NOT NULL DEFAULT ''"],['conversation',"TEXT NOT NULL DEFAULT '[]'"]])if(!db.prepare('PRAGMA table_info(demo_research)').all().some(c=>c.name===name))db.exec(`ALTER TABLE demo_research ADD COLUMN ${name} ${type};`);
db.exec("UPDATE demo_research SET intent='thesis_builder' WHERE kind='thesis' AND intent='sourcing';");
db.exec("UPDATE demo_research SET status='failed',error='The demo restarted before this review finished. Please retry.' WHERE status='running';");
class D1{prepare(sql){let values=[];return{bind(...v){values=v;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return{results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};}async batch(statements){const prior=this.lock||Promise.resolve();let release;this.lock=new Promise(r=>release=r);await prior;db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}finally{release();}}}
const password=process.env.GEEZ_DEMO_PASSWORD||'Geez-demo-2026';
const env={DB:new D1(),GEEZ_PASSWORD_HASH:await passwordHash(password),GEEZ_WORKER_TOKEN_HASH:await sha(randomUUID())};
const port=Number(process.env.PORT||8791),origin=`http://127.0.0.1:${port}`;
const cookieNamespace=process.env.GEEZ_DEMO_COOKIE_NAMESPACE||'';
if(!/^[a-z0-9_-]{0,48}$/.test(cookieNamespace))throw Error('Use a simple local-demo cookie namespace.');
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const view=r=>({id:r.id,status:r.status,query:r.query,notes:r.notes,dual:!!r.dual,kind:r.kind,intent:r.intent,category:r.category,conversation:JSON.parse(r.conversation||'[]'),created_at:r.created_at,progress:JSON.parse(r.progress||'null'),result:JSON.parse(r.result||'null'),error:r.error});
const testMode=process.env.GEEZ_TEST_MODE==='1';
const scoutMode=process.env.GEEZ_SCOUT_MODE==='1';
const baselineMode=process.env.GEEZ_SCOUT_BASELINE==='1';
if(baselineMode&&testMode)throw Error('Baseline mode uses actual local models. Use injected module tests separately.');
const activeControllers=new Map();
function research(request,progress,caller){const signal=activeControllers.values().next().value?.signal;return baselineMode?baselineScout(request,progress,{signal}):scoutMode?realScout(request,progress,undefined,{signal}):legacyResearch(request,progress,caller);}
function developThesis(request,progress,caller){const signal=activeControllers.values().next().value?.signal;return baselineMode?baselineThesis(request,progress,{signal}):scoutMode?localScoutThesis(request,progress,{signal}):legacyDevelopThesis(request,progress,caller);}
let syntheticCalls=0;
function syntheticCaller(){return async(model,prompt,schema)=>{
 syntheticCalls++;const delay=Number(process.env.GEEZ_TEST_DELAY_MS||0);if(delay)await new Promise(r=>setTimeout(r,Math.min(delay,10000)));
 if(syntheticCalls===Number(process.env.GEEZ_TEST_FAIL_CALL||0))throw Error('Synthetic controlled failure; retry is available.');
 if(prompt.includes('INPUT_JSON:\n')){const data=JSON.parse(prompt.split('INPUT_JSON:\n').at(-1));
 if(Object.hasOwn(schema.properties,'rubric'))return {value:{submission_hash:schema.properties.submission_hash.const,verdict:'needs_evidence',rubric:Object.fromEntries(Object.keys(schema.properties.rubric.properties).map(k=>[k,{verdict:'not_assessable',reason:'Synthetic transport cannot establish actual research quality.'}])),claim_checks:[],vqa:{review_subject:'sealed_author_work',method:'causal_proposal',inspection:null,finding:'unknown',defect:'Target fit is not assessed by this transport fixture.',hypothesis:'Sparse sources may leave material conditions unaddressed.',prediction:'Some thesis conditions may have no supporting passage.',test:'Compare each material claim with the actual source and thesis.',reject_if:'Exact target-specific evidence supports the claimed conditions.',executed:false},next_action:'Run actual semantic assessment when larger models are resource-qualified.'},trace:{model,test_only:true,prompt}};
 if(Object.hasOwn(schema.properties,'reply'))return {value:{reply:'Synthetic chat transport: your idea is preserved in the proposed draft.',draft:data.draft?data.draft+' — SYNTHETIC proposal for UI QA only.':data.messages.filter(m=>m.role==='user').map(m=>m.content).join(' '),question:'Which part would you like to refine?'},trace:{model,test_only:true,prompt}};
 if(Object.hasOwn(schema.properties,'workflow_intent'))return {value:{workflow_intent:data.intent,summary:'SYNTHETIC QA ONLY: workflow controls and persistence are exercised; research quality is not assessed.',decision_state:'not_yet_assessable',thesis_fit:'Unassessed by synthetic transport.',deal_quality:'No target-level quality conclusion established.',price_economics:'No verified financial inputs supplied.',transaction_status:'unknown',sections:[{heading:'Evidence needed',text:'Obtain the target-specific records relevant to this workflow. This is a test fixture.'}],initiatives:data.intent==='value_creation'?[{name:'Synthetic planning example',horizon:'0-30 days',baseline:'Not supplied',mechanism:'Unassessed fixture',costs:'Unknown',stop_test:'Do not implement without verified inputs and authority.'}]:[],next_question:'Which record or decision would you like to examine?',source_ids:[],evidence_checks:[]},trace:{model,test_only:true,prompt}};
 const critique=Object.hasOwn(schema.properties,'challenge');return {value:critique?{challenge:'Synthetic peer challenge.',unsupported_claims:[],constraint_gaps:['Seller interest is unknown.'],next_test:'Obtain a dated seller mandate.'}:{summary:'Synthetic test only: economics and seller interest remain unknown.',hypothesis:'A measured pilot might reduce paid delivery effort.',evidence_ids:data.sources.slice(0,1).map(x=>x.id),falsifier:{observation:'Comparable net paid costs after implementation.',reject_if:'Net costs do not decrease at unchanged quality.'},self_check:'No financial or seller evidence is supplied.',next_steps:['Obtain source-backed costs.'],clarification:'Which condition matters most?',candidate_ids:data.candidates.slice(0,1).map(x=>x.id)},trace:{model,test_only:true,prompt}};}throw Error('Synthetic packet missing');};}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);res.end('Unexpected host.');return;}
  if(cookieNamespace)req.headers.cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieNamespace+'geez_gate=')||v.startsWith(cookieNamespace+'geez_session=')).map(v=>v.slice(cookieNamespace.length)).join('; ');
  const url=new URL(req.url,origin);let response;
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>50000)throw Error('Request is too large.');}
  const request=new Request(url,{method:req.method,headers:req.headers,...(raw?{body:raw}:{})});
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/health'&&req.method==='GET')response=json({app:'geez-local-scout',workflow:baselineMode?'scouting_pivot_v1':'earlier_development_mode'});
   else if(url.pathname==='/api/analytics'&&req.method==='POST'){
    const me=await (await handleApi(new Request(origin+'/api/me',{headers:req.headers}),env)).json();
    response=!me.authenticated||!me.session?json({error:'Sign in first.'},401):req.headers.origin!==origin?json({error:'Same-origin request required.'},403):json(await captureProductEvent(JSON.parse(raw||'{}')));
   }else if(url.pathname==='/api/session'&&req.method==='POST'){
    const input=JSON.parse(raw||'{}');if(!input.name?.trim())input.name='Guest';if(input.save===undefined)input.save=false;
    response=await handleApi(new Request(url,{method:'POST',headers:req.headers,body:JSON.stringify(input)}),env);
   }else if(url.pathname.startsWith('/api/research')||url.pathname==='/api/thesis'||url.pathname==='/api/library'||url.pathname==='/api/demo-status'||url.pathname==='/api/prepare-deal'||url.pathname==='/api/debt-scenario'){
    const me=await (await handleApi(new Request(origin+'/api/me',{headers:req.headers}),env)).json();
    if(!me.authenticated||!me.session)response=json({error:'Please sign in to open your research desk.'},401);
    else if(req.method==='POST'&&req.headers.origin!==origin)response=json({error:'Same-origin request required.'},403);
    else if(url.pathname==='/api/debt-scenario'&&req.method==='POST')response=json(debtScenario(JSON.parse(raw||'{}')));
    else if(url.pathname==='/api/prepare-deal'&&req.method==='POST'){const input=JSON.parse(raw||'{}'),prepared=prepareDeal(input),memory=await knowledgeSession({query:(input.query||'')+' '+(input.notes||''),category:input.category||'',intent:input.intent||'known_deal'});response=json({...prepared,knowledge:memory.receipt});}
    else if(url.pathname==='/api/library')response=baselineMode?json({skills:[{id:'deepseek-self-vqa',sha256:LOCAL_VQA_SKILLS.writer.sha256},{id:'gemma-local-vqa',sha256:LOCAL_VQA_SKILLS.critic.sha256}],scope:'Active local scouting guidance only. The larger experimental skill library is not qualified in this baseline.'}):json({skills:[...skills,...extensionInventory()],library:libraryInventory(),extension_library:extensionInventory(),library_total:libraryInventory().length+extensionInventory().length,extension_spec_sha256:EXTENSION_SPEC_SHA256,library_sha256:LIBRARY_SHA256,provenance:'174-file reconstructed replacement downloaded and verified; relevant instructions loaded per request. Runtime overlays cover additional PDF-described checks.'});
    else if(url.pathname==='/api/demo-status'){let modelStatus;try{modelStatus=testMode?{test_only:true}:scoutMode||baselineMode?await scoutLocalInventory():await inventory();}catch{modelStatus={unavailable:true};}response=json({test_mode:testMode,scout_mode:scoutMode,baseline_mode:baselineMode,workflow:baselineMode?'scouting_pivot_v1':'earlier_development_mode',busy:isBusy(),models:modelStatus});}
    else if(url.pathname==='/api/research'&&req.method==='GET')response=json({jobs:db.prepare('SELECT * FROM demo_research WHERE session_id=? ORDER BY created_at DESC LIMIT 30').all(me.session.id).map(view)});
    else if(['/api/research','/api/thesis'].includes(url.pathname)&&req.method==='POST'){
     const data=JSON.parse(raw||'{}'),kind=url.pathname==='/api/thesis'?'thesis':'research',query=(kind==='thesis'?data.draft:data.query)??'',notes=data.notes??'',key=data.idempotency_key,category=data.category??'',conversation=kind==='thesis'?(data.messages??[]):[],intent=kind==='thesis'?'thesis_builder':(data.intent??'sourcing');
     const dual=kind==='research';
     if(kind==='thesis')thesisInput({category,draft:query,messages:conversation});
     if(baselineMode&&kind==='research'&&intent!=='sourcing')response=json({error:'This local build supports thesis development and company scouting. Earlier opportunity/growth modes are not active.'},400);
     else if(!['sourcing','thesis_builder','known_deal','value_creation'].includes(intent)||(kind==='research'&&intent==='thesis_builder')||typeof category!=='string'||category.length>100||typeof query!=='string'||query.length>2000||query.includes('\0')||typeof notes!=='string'||notes.length>10000||notes.includes('\0')||typeof key!=='string'||!/^[a-f0-9-]{36}$/i.test(key))response=json({error:'Use a request under 2,000 characters and notes under 10,000. Then retry.'},400);
     else{
      const previous=db.prepare('SELECT * FROM demo_research WHERE session_id=? AND retry_key=?').get(me.session.id,key);
      if(previous)response=previous.query!==query||previous.notes!==notes||previous.kind!==kind||previous.intent!==intent||previous.category!==category||previous.conversation!==JSON.stringify(conversation)||!!previous.dual!==dual?json({error:'This retry key belongs to different inputs. Start a new request.'},409):json({job:view(previous)});
      else if(db.prepare("SELECT id FROM demo_research WHERE status='running'").get())response=json({error:'Another review is using this local demo. Your text is preserved; try again when it finishes.'},409);
      else{
       const id=randomUUID();db.prepare("INSERT INTO demo_research(id,session_id,retry_key,status,query,notes,created_at,dual,kind,category,conversation,intent) VALUES(?,?,?,'running',?,?,?,?,?,?,?,?)").run(id,me.session.id,key,query,notes,Date.now(),dual?1:0,kind,category,JSON.stringify(conversation),intent);
       response=json({job:view(db.prepare('SELECT * FROM demo_research WHERE id=?').get(id))},202);
       const controller=new AbortController();activeControllers.set(id,controller);
       setImmediate(async()=>{try{const baseCaller=testMode?syntheticCaller():generate,call=async(model,prompt,schema,options={})=>{controller.signal.throwIfAborted();const result=await baseCaller(model,prompt,schema,{...options,signal:controller.signal});controller.signal.throwIfAborted();return result;};call.transport=testMode?'injected_caller':'local_model_runtime';const onProgress=p=>db.prepare('UPDATE demo_research SET progress=? WHERE id=?').run(JSON.stringify(p),id);const result=kind==='thesis'?await developThesis({category,draft:query,notes,messages:conversation},onProgress,call):await research({query,notes,category,intent,dual},onProgress,call);controller.signal.throwIfAborted();const publicResult={...result,...(testMode?{test_only:true,verification_level:'synthetic_model_transport'}:{})};delete publicResult.audit;db.prepare("UPDATE demo_research SET status='completed',result=? WHERE id=?").run(JSON.stringify(publicResult),id);writeFileSync(resolve(stateDir,`${id}.audit.json`),JSON.stringify({...result,...(testMode?{test_only:true,verification_level:'synthetic_model_transport'}:{})},null,2));}catch(e){try{await recordFailedExperiment(stateDir,{run_id:id,session_id:me.session.id,input:{query,notes,category,intent,conversation},error:e.message||'Execution failed',code:e.code||'unclassified_execution_failure'});}catch{}if(e.audit)writeFileSync(resolve(stateDir,`${id}.failed-audit.json`),JSON.stringify({...e.audit,...(testMode?{test_only:true,verification_level:'synthetic_model_transport'}:{})},null,2));db.prepare("UPDATE demo_research SET status='failed',error=? WHERE id=?").run(e.message||'The review could not finish. Your inputs are saved.',id);}finally{activeControllers.delete(id);}});
      }
     }
    }else if(/^\/api\/research\/[a-f0-9-]{36}\/cancel$/i.test(url.pathname)&&req.method==='POST'){const row=db.prepare('SELECT * FROM demo_research WHERE id=? AND session_id=?').get(url.pathname.split('/')[3],me.session.id);if(!row)response=json({error:'This review is not in your session.'},404);else if(row.status!=='running')response=json({cancel_requested:false,status:row.status});else{const controller=activeControllers.get(row.id);if(!controller)response=json({error:'The local worker could not be reached.'},409);else{controller.abort(Error('Cancelled. Your input is saved; no result was substituted.'));response=json({cancel_requested:true,status:'stopping'});}}
    }else if(/^\/api\/research\/[a-f0-9-]{36}\/data-room\.zip$/i.test(url.pathname)&&req.method==='GET'){
     const row=db.prepare('SELECT * FROM demo_research WHERE id=? AND session_id=?').get(url.pathname.split('/')[3],me.session.id),result=row?.result?JSON.parse(row.result):null;
     response=result?.data_room?new Response(planningZip(dataRoomFiles(result.data_room,{intent:row.intent,query:row.query,category:row.category,category_profile:result.category_profile??null,category_selection:result.category_selection??'Not recorded for this historical result.'})),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename=Geez-data-room-plan.zip','cache-control':'no-store','x-content-type-options':'nosniff'}}):json({error:'No completed data-room plan in this session.'},404);
    }else if(/^\/api\/research\/[a-f0-9-]{36}$/i.test(url.pathname)&&req.method==='GET'){
     const row=db.prepare('SELECT * FROM demo_research WHERE id=? AND session_id=?').get(url.pathname.split('/').at(-1),me.session.id);response=row?json({job:view(row)}):json({error:'This review is not in your session.'},404);
    }else response=json({error:'Not found.'},404);
   }else response=await handleApi(request,env);
  }else{
   const files={'/':'index.html','/app.js':baselineMode?'thesis-app.js':scoutMode?'scout-app.js':'app.js','/analytics.js':'analytics.js','/thesis-state.js':'thesis-state.js','/style.css':'style.css'};const name=files[url.pathname];
   response=name?new Response(readFileSync(resolve(root,'demo',name)),{headers:{'content-type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}}):new Response('Not found',{status:404});
  }
  const headers=Object.fromEntries(response.headers);const cookies=response.headers.getSetCookie().map(v=>cookieNamespace?v.replace(/^(geez_gate|geez_session)=/,cookieNamespace+'$1='):v);if(cookies.length)headers['set-cookie']=cookies;res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'That request could not be read. Your saved work has not changed.'}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Geez isolated demo: ${origin}\nMode: ${testMode?'SYNTHETIC QA ONLY':baselineMode?'local evidence baseline':'real local Ollama'}\nUses its own ${stateName} database; production and existing apps are untouched.`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{for(const controller of activeControllers.values())controller.abort(Error('Local demo stopping; inputs preserved.'));server.close(()=>{db.close();process.exit(0);});});
