// PostHog's official Capture API. Only explicitly allowlisted product events leave this PC.
export const ANALYTICS_EVENTS=new Set(['$pageview','desk_opened','thesis_started','thesis_completed','thesis_accepted','research_started','research_completed','research_failed','results_viewed','source_opened']);
export function analyticsPayload(input,token){
 if(!input||!ANALYTICS_EVENTS.has(input.event)||!/^[a-f0-9-]{36}$/i.test(input.anonymous_id||''))throw Error('Invalid analytics event.');
 const p=input.properties||{},properties={distinct_id:input.anonymous_id,$process_person_profile:false,$geoip_disable:true,$ip:'0.0.0.0',app:'geez',build:'scouting-week3',environment:'localhost',site_surface:'local_app'};
 if(input.event==='$pageview')properties.$current_url='http://127.0.0.1:'+String(process.env.PORT||8792)+'/';
 for(const key of ['result_count','model_calls'])if(Number.isInteger(p[key])&&p[key]>=0&&p[key]<=100)properties[key]=p[key];
 if(typeof p.onboarding==='boolean')properties.onboarding=p.onboarding;
 if(typeof p.qa_run==='boolean')properties.qa_run=p.qa_run;
 return {api_key:token,event:input.event,properties,timestamp:new Date().toISOString()};
}
export async function captureProductEvent(input,{token=process.env.POSTHOG_PROJECT_TOKEN,host=process.env.POSTHOG_HOST||'https://us.i.posthog.com',fetcher=fetch}={}){
 const payload=analyticsPayload(input,token);
 if(!token)return {enabled:false,delivered:false};
 if(!/^phc_[a-zA-Z0-9]+$/.test(token)||!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(host))throw Error('Invalid PostHog project configuration.');
 try{const r=await fetcher(host+'/capture/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000),redirect:'error'});return {enabled:true,delivered:r.ok};}catch{return {enabled:true,delivered:false};}
}
