import {acceptThesisProposal,clearThesisProposal,thesisResearchRequest,thesisConversationMessages} from './thesis-state.js';
import {track,trackOnce,mountReplayNotice,trackDeskPageView} from './analytics.js';
const root=document.querySelector('#app'),el=id=>document.getElementById(id);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session,job,timer,state;
async function api(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'The local desk could not complete this request.');return v;}
function save(){localStorage.setItem('geez-thesis-first-'+session.id,JSON.stringify(state));}
function load(){
 let prior={},old={};try{prior=JSON.parse(localStorage.getItem('geez-thesis-first-'+session.id))||{};old=JSON.parse(localStorage.getItem('geez-evidence-input-'+session.id))||{};}catch{}
 state={draft:old.idea||'',notes:old.notes||'',category:old.category||'',messages:[],chat:'',pending:null,accepted:null,lastThesisJob:null,...prior};
 for(const key of ['draft','notes','category','chat'])if(typeof state[key]!=='string')state[key]='';
 if(!Array.isArray(state.messages))state.messages=[];
}
function login(message=''){
 root.innerHTML=`<main class="signin"><section class="welcome"><div class="wordmark">geez<span>THE ACQUISITION DESK</span></div><h1>Shape the idea.<br>Find the evidence.</h1><p>Talk with the local AIs, build a thesis you control, then research real companies and listings that fit.</p></section><section class="login-panel"><form id="login"><h2>Open your research desk.</h2><label for="password">Demo password</label><input id="password" type="password" autocomplete="current-password"><button>Open my desk</button><p>No investor profile required.</p><p class="error" role="alert">${e(message)}</p></form></section></main>`;
 el('login').onsubmit=async event=>{event.preventDefault();try{await api('/api/login',{password:el('password').value});session=(await api('/api/session',{})).session;load();desk();}catch(error){login(error.message);}};
}
function desk(){
 trackOnce('desk_opened','session');trackDeskPageView();
 root.innerHTML=`<header class="topbar"><div class="wordmark">geez<span>THE ACQUISITION DESK</span></div><button id="logout" class="text-button">Sign out</button></header><main class="shell"><section class="baseline-intro"><p class="eyebrow">THESIS FIRST · LOCAL AI RESEARCH</p><div class="intro"><h1>What’s your<br>investment idea?</h1><p>Start a conversation. The local AIs help shape your thesis and research criteria. You decide when to search.</p></div></section><p id="error" class="error" role="alert"></p><div class="thesis-layout with-chat"><section class="paper chat-panel"><h2>Develop your thesis</h2><div id="messages" class="messages" aria-live="polite"></div><form id="chat"><label for="chat-message">What would you like to explore? (optional)</label><textarea id="chat-message" rows="3" placeholder="An industry, a business model, an advantage you bring, or something you want to avoid…">${e(state.chat)}</textarea><button id="refine">${state.messages.length?'Keep refining':'Develop my thesis'}</button><p id="chat-status" class="small" aria-live="polite"></p></form><button id="reset-chat" class="text-button">New conversation · keep my thesis</button><p class="small">DeepSeek drafts, Gemma gives feedback, and DeepSeek improves the proposal before you review it. No research starts until you choose it.</p></section><section><div id="proposal"></div><form id="scout" class="paper card composer"><label for="category">Your focus (optional)</label><select id="category"><option value="">Open possibilities</option><option>Private equity</option><option>Search fund</option><option>Real estate</option><option>Something else</option></select><label for="idea">Your working thesis (optional)</label><textarea id="idea" rows="5" placeholder="Review an AI proposal above when ready, or write your own thesis here…">${e(state.draft)}</textarea><label for="notes">Anything else to consider? (optional)</label><textarea id="notes" rows="2" placeholder="Exclusions, preferences, context or corrections…">${e(state.notes)}</textarea><button id="run">Research this thesis</button><p class="small">Research uses this editable working thesis. No required budget, geography, return target or profile.</p><div id="accepted-brief"></div></form></section></div><section id="output" aria-live="polite"></section><section class="history"><h2>Your saved runs</h2><div id="history"></div></section><details class="paper card"><summary>Coverage and what this version does</summary><p>The thesis conversation shapes your own criteria; it does not invent or verify investments. A proposed thesis is not applied until you use it. You can edit or research your own wording at any time.</p><p>Gemma 11.9B and DeepSeek 14.8B run locally, one at a time. Research reads one broker office (Transworld NorthStar, mainly Upper Midwest business listings) and uses bounded public search to find operating-company websites. Primary pages must be read before a prospect appears. This is not a complete market or property feed.</p><p>Research uses the same DeepSeek, Gemma diagnostic feedback, DeepSeek refinement flow and shows original source excerpts. Listed businesses and operating-company prospects have different sale-status labels. Revenue/MRR stay unknown unless explicitly reported; operating clues are never converted into revenue. Risk narratives, outreach and full VQA approval remain outside this baseline.</p></details></main>`;
 mountReplayNotice();
 el('category').value=state.category;
 for(const [id,key] of [['idea','draft'],['notes','notes'],['category','category']])el(id).oninput=()=>{state[key]=el(id).value;clearThesisProposal(state);save();drawProposal();};
 el('chat-message').oninput=()=>{state.chat=el('chat-message').value;save();};
 el('chat').onsubmit=async event=>{
  event.preventDefault();el('error').textContent='';
  const messages=state.chat.trim()?[...state.messages,{role:'user',content:state.chat}]:[...state.messages];
  if(messages.length>12){el('error').textContent='Keep your working thesis up to date, then start a new conversation to continue. Your conversation is preserved in saved runs.';return;}
  state.messages=messages;state.chat='';state.pending=null;save();drawMessages();drawProposal();el('chat-message').value='';
  await start('/api/thesis',{draft:state.draft,notes:state.notes,category:state.category,messages:thesisConversationMessages(messages)});
 };
 el('scout').onsubmit=async event=>{event.preventDefault();try{await start('/api/research',thesisResearchRequest(state));}catch(error){el('error').textContent=error.message;}};
 el('reset-chat').onclick=()=>{state.messages=[];state.chat='';state.pending=null;save();el('chat-message').value='';drawMessages();drawProposal();el('chat-status').textContent='New conversation. Your working thesis is unchanged.';};
 el('logout').onclick=async()=>{window.posthog?.stopSessionRecording();try{await api('/api/logout',{});clearTimeout(timer);session=null;job=null;state=null;login();}catch(error){el('error').textContent=error.message;}};
 drawMessages();drawProposal();render();busy(true);history();
}
function drawMessages(){
 el('messages').innerHTML=state.messages.length?state.messages.map(m=>`<div class="message ${m.role==='user'?'user':'assistant'}"><strong>${m.role==='user'?'You':'Local thesis assistant'}</strong><p>${e(m.content)}</p></div>`).join(''):'<p>Start anywhere: a business you understand, a customer you like serving, or something you want to avoid. The AIs will help you explore the next useful choice.</p>';
 el('messages').scrollTop=el('messages').scrollHeight;
 el('refine').textContent=state.messages.length?'Keep refining':'Develop my thesis';
}
function criteriaHtml(criteria){return Object.entries({must_have:'Must have',preferences:'Preferences',exclusions:'Exclude',undecided:'Still open'}).filter(([key])=>criteria[key]?.length).map(([key,label])=>`<h3>${label}</h3><ul>${criteria[key].map(x=>`<li>${e(x)}</li>`).join('')}</ul>`).join('');}
function savedNotesHtml(notes){
 if(!notes)return '';
 try{const parsed=JSON.parse(notes),c=parsed?.thesis_criteria;if(c&&['must_have','preferences','exclusions','undecided'].every(k=>Array.isArray(c[k])&&c[k].every(x=>typeof x==='string')))return `<details class="paper card"><summary>Criteria used for this research</summary>${criteriaHtml(c)}${parsed.investor_notes?`<p>${e(parsed.investor_notes)}</p>`:''}</details>`;}catch{}
 return `<p class="small">Saved notes: ${e(notes)}</p>`;
}
function drawProposal(){
 el('accepted-brief').innerHTML=state.accepted?`<p class="small">DeepSeek and Gemma receive this exact working thesis. Earlier notes have been folded into the brief; you can add new notes or edit it any time.</p>${state.accepted.originalNotes?`<details><summary>Earlier notes · retained for reference</summary><p>${e(state.accepted.originalNotes)}</p></details>`:''}`:'';
 const p=state.pending;el('proposal').innerHTML=p?`<section class="paper card thesis-proposal"><p class="eyebrow">LOCAL AI PROPOSAL · FOR YOUR REVIEW</p><h2>A thesis you can use</h2><blockquote>${e(p.draft)}</blockquote><button id="accept-thesis">Use this thesis</button><p class="small">Using this proposal replaces your working thesis and folds the current notes into it. Earlier notes stay in saved conversation history. Review it or keep refining. This is an editable proposal refined using feedback, not investment approval.</p></section>`:'';
 if(p)el('accept-thesis').onclick=()=>{acceptThesisProposal(state);track('thesis_accepted');save();el('idea').value=state.draft;el('notes').value=state.notes;drawProposal();el('chat-status').textContent='Thesis accepted. Keep refining or research it when you are ready.';};
}
function financialHtml(source){
 const facts=source.reported_financials||{},revenue=facts.revenue;
 let body=revenue?.status==='source_reported_unverified'?`<p><strong>Source-reported ${e(revenue.label)}:</strong> ${e(revenue.value_text)}<br><span class="small">Reporting period: ${e(revenue.period)}. Not independently verified.</span></p>`:'<p><strong>Revenue:</strong> unverified.</p>';
 if(facts.mrr?.status==='source_reported_unverified')body+=`<p><strong>Source-reported ${e(facts.mrr.label)}:</strong> ${e(facts.mrr.value_text)}<br><span class="small">${e(facts.mrr.period)}. Not independently verified.</span></p>`;
 return `<section class="financial-facts"><h3>Financial size</h3>${body}<p class="small">Operating clues are not revenue estimates. A published figure without a period does not confirm annual revenue or financial fit.</p></section>`;
}
function busy(value){for(const id of ['refine','run','category','idea','notes','chat-message','reset-chat','accept-thesis'])if(el(id))el(id).disabled=value;}
async function start(path,body){
 el('error').textContent='';busy(true);
 try{job=(await api(path,{...body,idempotency_key:crypto.randomUUID()})).job;track(path==='/api/thesis'?'thesis_started':'research_started');render();await history();poll();}
 catch(error){el('error').textContent=error.message;busy(job?.status==='running');}
}
function receiveThesis(){
 const r=job?.result;if(r?.kind!=='baseline_thesis'||r.onboarding||state.lastThesisJob===job.id)return;
 state.messages.push({role:'assistant',content:r.reply,draft:r.draft});
 state.pending={draft:r.draft};state.lastThesisJob=job.id;save();drawMessages();drawProposal();
}
async function history(){
 try{
  const r=await api('/api/research');
  if(!job&&r.jobs.length){job=r.jobs.find(j=>j.status==='running')||r.jobs[0];receiveThesis();render();if(job.status==='running')poll();}
  el('history').innerHTML=r.jobs.map(j=>`<button data-job="${e(j.id)}"><span>${e(j.kind==='thesis'?'Thesis conversation · '+(j.conversation?.filter(m=>m.role==='user').at(-1)?.content||j.query||'Blank start'):j.query||j.notes||'Blank start')}</span><span>${e(j.status)}</span></button>`).join('')||'<p>Your thesis conversations and research will appear here.</p>';
  document.querySelectorAll('[data-job]').forEach(b=>b.onclick=async()=>{
   if(job?.status==='running')return;
   try{
    job=(await api('/api/research/'+b.dataset.job)).job;
    if(job.result?.kind==='baseline_thesis'&&!job.result.onboarding){state.draft=job.query;state.notes=job.notes;state.category=job.category;state.messages=job.conversation.map(({role,content,assistant_proposed_draft})=>({role,content,...(assistant_proposed_draft?{draft:assistant_proposed_draft}:{})}));clearThesisProposal(state);state.lastThesisJob=null;receiveThesis();save();desk();}
    else{render();if(job.status==='running')poll();}
   }catch(error){el('error').textContent=error.message;}
  });
 }catch(error){el('error').textContent=error.message;}
 finally{busy(job?.status==='running');}
}
async function poll(){
 clearTimeout(timer);if(!job)return;
 try{job=(await api('/api/research/'+job.id)).job;
 if(job.status==='completed')trackOnce(job.kind==='thesis'?'thesis_completed':'research_completed',job.id,{onboarding:!!job.result?.onboarding,model_calls:job.result?.model_calls||0,result_count:job.result?.cards?.length||0});
 if(job.status==='failed')trackOnce('research_failed',job.id);
 receiveThesis();render();if(job.status==='running')timer=setTimeout(poll,2500);else{busy(false);await history();}}
 catch(error){el('error').textContent='Could not refresh progress: '+error.message;timer=setTimeout(poll,5000);}
}
function render(){
 const out=el('output');if(!out||!job)return;
 if(job.status==='running'){
  busy(true);const message=job.progress?.message||'Preparing the complete request…';el('chat-status').textContent=job.kind==='thesis'?message:'';
  out.innerHTML=`<section class="paper card"><h2>${job.kind==='thesis'?'Developing your thesis locally.':'Reading the sources locally.'}</h2><p>${e(message)}</p><p class="small">The AIs run one at a time. Your inputs are saved.</p><button id="cancel" class="text-button">Stop this run</button></section>`;
  el('cancel').onclick=async()=>{try{await api('/api/research/'+job.id+'/cancel',{});el('cancel').disabled=true;el('cancel').textContent='Stopping…';}catch(error){el('error').textContent=error.message;}};return;
 }
 if(job.status==='failed'){out.innerHTML=`<section class="paper card"><h2>This run needs attention.</h2><p>${e(job.error)}</p><p>Your working thesis is unchanged. No substitute result was generated.</p></section>`;el('chat-status').textContent=job.kind==='thesis'?'The turn did not finish. Your text and working thesis are saved.':'';return;}
 const r=job.result;if(!r)return;
 if(r.kind==='baseline_thesis'){out.innerHTML='';el('chat-status').textContent=r.onboarding?'Share an idea or use your working thesis. No AI call was needed for this blank start.':state.pending?'Your proposed thesis is ready to review. Research has not started.':state.accepted?'Your working thesis is ready. Keep refining or research it now.':'Conversation saved. Continue refining or edit your working thesis.';return;}
 el('chat-status').textContent='';
 if(r.kind!=='source_preview'){out.innerHTML='<section class="paper card"><h2>Earlier research retained.</h2><p>This saved run used a previous workflow.</p></section>';return;}
 if(r.onboarding){out.innerHTML='<section class="paper card"><h2>Start anywhere.</h2><p>Develop an idea in the chat or write your working thesis. All investor fields are optional. No model or web call was needed for this blank search.</p></section>';return;}
 out.innerHTML=`<section class="result-head"><p class="eyebrow">QUOTED EVIDENCE TO EXPLORE</p><h2>${r.cards.length?'Companies and listings to investigate':'No company selection was supported in this run'}</h2><p><strong>Saved request:</strong> ${e(job.query||'Blank start')}</p>${savedNotesHtml(job.notes)}<p>${e(r.coverage)}</p><p class="small">Original source material to investigate; sale status and financial fit remain unconfirmed.</p></section>`;
 trackOnce('results_viewed',job.id,{result_count:r.cards.length});
 for(const card of r.cards){
  const c=card.source,prospect=c.kind==='company_prospect';
  const flow=r.process?.writer?'DeepSeek selected these leads and refined them using Gemma’s diagnostic feedback. The final revision is not independently approved.':'Saved source selection from an earlier workflow.';
  out.innerHTML+=`<article class="paper card source-evidence-card"><p class="eyebrow">${prospect?'OPERATING-COMPANY PROSPECT':'BROKER-ADVERTISED BUSINESS'}</p><h2>${e(c.title)}</h2><p>${prospect?'Sale status unknown · no willingness to sell established':'Advertised availability unconfirmed'}</p><p class="small">${e(c.location)}</p><h3>Why investigate</h3>${card.excerpts.map(x=>`<blockquote>${e(x.quote)}</blockquote>`).join('')}<h3>Operating context for a size check</h3>${card.operating_clues?.length?card.operating_clues.map(x=>`<blockquote>${e(x.quote)}</blockquote>`).join(''):'<p class="small">No operating-scale clue selected. Financial size remains unverified.</p>'}${financialHtml(c)}<a href="${e(c.url)}" target="_blank" rel="noopener noreferrer">${prospect?'Read the company website':'Read the original listing'} ↗</a><p class="small">Accessed ${e(c.source_receipt.accessed_at)}. Selected source excerpts, not the complete page. Source statements have not been independently verified.</p><p class="small">${e(flow)} This is not investment diligence or full VQA approval.</p></article>`;
 }
 out.innerHTML+=`<p class="notice">${e(r.notice)}</p>`;
}
async function init(){try{const me=await api('/api/me');if(!me.authenticated)return login();session=me.session||(await api('/api/session',{})).session;load();desk();}catch(error){login(error.message);}}
init();

document.addEventListener('click',event=>{if(event.target.closest('.source-evidence-card a'))track('source_opened');});
