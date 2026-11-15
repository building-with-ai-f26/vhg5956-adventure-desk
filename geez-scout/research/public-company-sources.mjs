// Discovery links are not company evidence. Only a fetched public primary page is admitted.
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {pageText} from './scout-sources.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const agent='GeezLocalResearch/1.0';
export function isPublicCompanyAddress(address){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function publicCompanyUrl(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(u.hostname.replace(/^\[|\]$/g,''))||!u.hostname.includes('.')||/(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example)$/.test(u.hostname)||/\.(?:pdf|zip|exe|js|css|png|jpe?g|gif|svg|webp)$/i.test(u.pathname))throw Error('Use a public HTTPS company page.');
 u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:gclid|fbclid)$/i.test(key))u.searchParams.delete(key);
 return u.href;
}
async function publicHtmlResponse(raw,{signal,resolveHost=lookup,maxBytes=900000,timeoutMs=25000}={}){
 const url=new URL(publicCompanyUrl(raw));signal?.throwIfAborted();
 const addresses=await resolveHost(url.hostname,{all:true,family:4});
 if(!addresses.length||addresses.some(a=>!isPublicCompanyAddress(a.address)))throw Error('The source resolves to a private or reserved address.');
 const address=addresses[0].address;
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const request=https.request(url,{method:'GET',signal,headers:{'user-agent':agent,accept:'text/html,application/xhtml+xml','accept-encoding':'identity'},lookup:(_host,options,callback)=>options?.all?callback(null,[{address,family:4}]):callback(null,address,4)},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){const location=response.headers.location;response.destroy();finish(null,{status:response.statusCode,location});return;}
   if(response.statusCode!==200||!/^text\/html|^application\/xhtml\+xml/i.test(response.headers['content-type']||'')||(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')){response.resume();finish(Error('The public company page is unavailable or not readable HTML.'));return;}
   let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){const error=Error('The public company page exceeds the source limit.');finish(error);request.destroy(error);}else chunks.push(chunk);});
   response.on('error',error=>finish(error));response.on('aborted',()=>finish(Error('The public company response ended before completion.')));
   response.on('end',()=>{if(!settled){const bytes=Buffer.concat(chunks);finish(null,{status:200,url:url.href,html:bytes.toString('utf8'),bytes:bytes.length,sha256:sha(bytes),accessed_at:new Date().toISOString()});}});
  });
  const timer=setTimeout(()=>request.destroy(Error('The public company page timed out.')),timeoutMs);
  request.on('error',error=>finish(error));request.end();
 });
}
export async function publicCompanyPage(raw,options={}){
 let url=publicCompanyUrl(raw);const visited=new Set();
 for(let n=0;n<4;n++){
  if(visited.has(url))throw Error('The public source redirect loops.');visited.add(url);
  const capture=await publicHtmlResponse(url,options);
  if(capture.status===200)return capture;
  if(!capture.location)throw Error('The public source redirect has no destination.');
  url=publicCompanyUrl(new URL(capture.location,url).href);
 }
 throw Error('The public company page redirects too many times.');
}
export function parseCompanySearch(html){
 if(/challenge-form|anomaly\.js|unfortunately, bots|verify you are human/i.test(html))throw Error('Public search requires a human check; no prospect results were invented.');
 const entries=[];
 for(const m of html.matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b)[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  try{
   const link=new URL(pageText(m[1]),'https://duckduckgo.com');const raw=link.hostname==='duckduckgo.com'&&link.pathname==='/l/'?link.searchParams.get('uddg'):link.href;if(!raw)continue;
   const url=publicCompanyUrl(raw),host=new URL(url).hostname.replace(/^www\./,'');
   if(/(^|\.)(?:duckduckgo\.com|bing\.com|google\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org|bizbuysell\.com|bizquest\.com|chamberofcommerce\.com|zoominfo\.com|crunchbase\.com)$/.test(host)||entries.some(e=>new URL(e.url).hostname.replace(/^www\./,'')===host))continue;
   entries.push({id:'company-'+entries.length,title:pageText(m[2]),url,kind:'company_prospect'});
   if(entries.length===10)break;
  }catch{}
 }
 return entries;
}
export async function companySearch(query,{signal,fetcher=fetch}={}){
 if(typeof query!=='string'||!query.trim()||query.length>180||/[\0@]|https?:\/\/|[$€£]|\b\d[\d ()+.-]{7,}\d\b/i.test(query))throw Error('Use generic public business-search terms, without contacts, URLs or financial amounts.');
 const url=new URL('https://html.duckduckgo.com/html/');url.searchParams.set('q',query);
 const response=await fetcher(url,{signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])]),redirect:'error',headers:{'user-agent':agent}});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Public company discovery is unavailable.');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>500000)throw Error('Public search exceeds the discovery limit.');chunks.push(value);}}finally{await reader.cancel();}
 const html=Buffer.concat(chunks).toString('utf8'),entries=parseCompanySearch(html);
 return {entries,query,source:'DuckDuckGo HTML link discovery',accessed_at:new Date().toISOString(),sha256:sha(html),coverage:'Up to ten public search links. Search titles are leads only; primary company pages must be fetched before showing a prospect.'};
}
export function parseCompanyDetail(capture,entry){
 const html=capture.html,title=pageText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||entry.title);
 if(/just a moment|access denied|robot check|human verification|security check/i.test(title))throw Error('The company page requires a human access check.');
 const body=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||html).replace(/<(script|style|noscript|nav|form)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 const full=pageText(body);if(/fictional company|fictional listing|demonstration content|lorem ipsum/i.test(full))throw Error('Demonstration content cannot establish a real company prospect.');
 const paragraphs=[...body.matchAll(/<(?:p|li|address)\b[^>]*>([\s\S]*?)<\/(?:p|li|address)>/gi)].map(m=>pageText(m[1]));
 const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
 const sentences=paragraphs.flatMap(p=>p.length<=320?[p]:[...segmenter.segment(p)].map(s=>s.segment)).map(s=>s.trim()).filter(s=>s.length>=45&&s.length<=320&&full.includes(s)&&!(/[$€£%]|\b(?:SDE|EBITDA|valuation|profit margin|annual revenue|gross revenue)\b/i.test(s))&&!(/\b(?:revenue|turnover|profit)\b/i.test(s)&&/\d|million|billion|thousand|estimated|forecast/i.test(s))&&!/cookie|privacy policy|terms of (?:use|service)|all rights reserved|subscribe to our newsletter/i.test(s));
 const quotes=[...new Set(sentences)].slice(0,10);if(!quotes.length)throw Error('No usable primary company description found.');
 return {id:entry.id,kind:'company_prospect',title,url:capture.url||entry.url,location:'Location not verified',status:'sale_status_unknown',source_name:new URL(capture.url||entry.url).hostname,source_receipt:{accessed_at:capture.accessed_at,html_sha256:capture.sha256,bytes:capture.bytes},evidence:quotes.map((quote,i)=>({id:entry.id+'-e'+i,quote})),reported_financials:{revenue:null,mrr:null},unknowns:['This operating-company prospect is not known to be for sale.','Revenue, MRR and financial fit are unverified. Operating clues are not revenue estimates.','Website statements have not been independently verified.']};
}
export async function companyDetails(entries,ids,options={}){
 const results=[],errors=[];for(const id of [...new Set(ids)].slice(0,3)){
  const entry=entries.find(e=>e.id===id);if(!entry)throw Error('The model selected a company outside the admitted search links.');
  try{results.push(parseCompanyDetail(await publicCompanyPage(entry.url,options),entry));}catch(error){errors.push({id,url:entry.url,error:error.message});}
 }
 return {results,errors};
}
