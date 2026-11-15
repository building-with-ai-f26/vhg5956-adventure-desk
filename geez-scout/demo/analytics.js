// Never send form values, research text, URLs, identities, errors or DOM contents.
let anonymousId;const seen=new Set();
function identity(){if(anonymousId)return anonymousId;try{anonymousId=localStorage.getItem('geez_analytics_anonymous_id');if(!/^[a-f0-9-]{36}$/i.test(anonymousId||'')){anonymousId=crypto.randomUUID();localStorage.setItem('geez_analytics_anonymous_id',anonymousId);}}catch{anonymousId=crypto.randomUUID();}return anonymousId;}
export function track(event,properties={}){
 try{void fetch('/api/analytics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event,anonymous_id:identity(),properties}),keepalive:true}).catch(()=>{});}catch{}
}
export function trackOnce(event,key,properties={}){const id=event+':'+key;let previous=false;try{previous=sessionStorage.getItem('geez_analytics_'+id)==='1';}catch{}if(seen.has(id)||previous)return;seen.add(id);try{sessionStorage.setItem('geez_analytics_'+id,'1');}catch{}track(event,properties);}
