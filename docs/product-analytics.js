// Public showcase only. The private localhost app has separate event-only analytics.
document.addEventListener('DOMContentLoaded',()=>{
 const status=document.getElementById('recording-status'),allow=document.getElementById('allow-replay'),decline=document.getElementById('decline-replay'),stop=document.getElementById('stop-replay');
 document.querySelectorAll('a[href="#live-demo"]').forEach(link=>link.addEventListener('click',()=>window.posthog?.capture('product_demo_clicked',{site_surface:'product_page',button:'see_prototype'})));
 allow.addEventListener('click',()=>{
  window.posthog?.startSessionRecording(true);
  window.posthog?.capture('product_page_recording_allowed',{site_surface:'product_page'});
  status.textContent='Page recording is allowed for this visit. You can stop it below. Inputs are masked.';
  allow.hidden=true;decline.hidden=true;stop.hidden=false;
 });
 decline.addEventListener('click',()=>{window.posthog?.stopSessionRecording();status.textContent='Page recording is off. Anonymous page and demo-click analytics remain on.';allow.hidden=true;decline.hidden=true;});
 stop.addEventListener('click',()=>{window.posthog?.stopSessionRecording();status.textContent='Page recording stopped. Anonymous page and demo-click analytics remain on.';stop.hidden=true;});
});
