// Event payloads never include form/research text. Optional replay masks inputs and blocks private regions.
let anonymousId,pageviewSent=false;const seen=new Set();
function identity(){if(anonymousId)return anonymousId;try{anonymousId=localStorage.getItem('geez_analytics_anonymous_id');if(!/^[a-f0-9-]{36}$/i.test(anonymousId||'')){anonymousId=crypto.randomUUID();localStorage.setItem('geez_analytics_anonymous_id',anonymousId);}}catch{anonymousId=crypto.randomUUID();}return anonymousId;}
export function track(event,properties={}){
 try{void fetch('/api/analytics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event,anonymous_id:identity(),properties}),keepalive:true}).catch(()=>{});}catch{}
}
export function trackOnce(event,key,properties={}){const id=event+':'+key;let previous=false;try{previous=sessionStorage.getItem('geez_analytics_'+id)==='1';}catch{}if(seen.has(id)||previous)return;seen.add(id);try{sessionStorage.setItem('geez_analytics_'+id,'1');}catch{}track(event,properties);}

export function mountReplayNotice(){
 const notice=document.createElement('section');notice.className='paper card';notice.setAttribute('aria-label','Optional masked app recording');
 notice.innerHTML='<p>Anonymous action analytics are on. Optional app recording masks all input values and hides chats, thesis proposals, research and saved-run details.</p><button type="button" id="allow-masked-replay">Allow masked app recording</button> <button type="button" id="stop-masked-replay" hidden>Stop app recording</button><p id="masked-replay-status" class="small">Recording is off.</p>';
 document.querySelector('main.shell').prepend(notice);
 const allow=notice.querySelector('#allow-masked-replay'),stop=notice.querySelector('#stop-masked-replay'),status=notice.querySelector('#masked-replay-status');
 allow.onclick=()=>{allow.disabled=true;status.textContent='Starting masked app recording…';
  window.addEventListener('geez-replay-ready',()=>{status.textContent='Masked app recording is on. Private content is hidden.';stop.hidden=false;allow.hidden=true;},{once:true});
  window.addEventListener('geez-replay-unavailable',()=>{status.textContent='Recording is unavailable; your desk still works.';allow.disabled=false;},{once:true});
  if(window.posthog?.startSessionRecording){window.posthog.startSessionRecording(true);window.dispatchEvent(new Event('geez-replay-ready'));return;}
  const script=document.createElement('script');script.src='/masked-replay.js';script.onerror=()=>window.dispatchEvent(new Event('geez-replay-unavailable'));document.head.append(script);
 };
 stop.onclick=()=>{window.posthog?.stopSessionRecording();status.textContent='App recording stopped.';stop.hidden=true;};
 if(window.posthog?.sessionRecordingStarted?.()){status.textContent='Masked app recording is on. Private content is hidden.';stop.hidden=false;allow.hidden=true;}
}

export function trackDeskPageView(){if(pageviewSent)return;pageviewSent=true;track("$pageview");}
