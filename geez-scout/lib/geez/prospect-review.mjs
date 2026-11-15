import pool from '../../data/reviewed-prospects.json' with {type:'json'};
import {commentaryIssues} from '../../research/evidence.mjs';
export const PROSPECT_VERSION='prospect-v1';
export function prospectState(row){try{const s=JSON.parse(row.review_json);return s.version===PROSPECT_VERSION?s:null;}catch{return null;}}
export function freshProspects(){
 if(pool.length!==8||new Set(pool.map(c=>c.id)).size!==8||pool.some(c=>c.quality<6||!c.sources.length))throw new Error('Reviewed source pool is unavailable.');
 return {version:PROSPECT_VERSION,status:'ready',items:pool.map(({hypothesis,evidence_test,review_limits,quality,...c})=>c),reviews:{},batch_ids:[],job_ids:[],job_id:null,error:null};
}
export function prospectEvidence(state,ids){return JSON.stringify({candidates:ids.map(id=>{const c=state.items.find(c=>c.id===id);return {id:c.id,name:c.name,sector:c.sector,sources:c.sources.map(s=>({id:c.id+'/'+s.id,claim:s.facts.join('\n')+' [Source: '+s.url+'; retrieved '+s.retrieved_at+']'})),missing_evidence:c.missing_evidence,sale_status:c.sale_status,ownership_status:c.ownership_status};})});}
export function validateProspectOutput(output,evidence){
 const invalid=()=>{throw new Error('Invalid fresh prospect review. No shortlist released; retry explicitly.');};
 let data,source;try{data=JSON.parse(output);source=JSON.parse(evidence);}catch{invalid();}
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!exact(data,['reviews'])||!Array.isArray(data.reviews)||!Array.isArray(source?.candidates)||source.candidates.length!==4||data.reviews.length!==4)invalid();
 const byId=new Map(source.candidates.map(c=>[c.id,c])),seen=new Set();if(byId.size!==4)invalid();
 for(const r of data.reviews){
  if(!exact(r,['candidate_id','relevance_grade','decision','reason','hypothesis','falsifier','unknowns','evidence_ids'])||!byId.has(r.candidate_id)||seen.has(r.candidate_id)||!Number.isInteger(r.relevance_grade)||r.relevance_grade<0||r.relevance_grade>3||!['investigate','defer','excluded'].includes(r.decision))invalid();seen.add(r.candidate_id);
  for(const [k,max] of [['reason',500],['hypothesis',400],['falsifier',400]])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>max||r[k].includes('\0'))invalid();
  if(!Array.isArray(r.unknowns)||r.unknowns.length>6||r.unknowns.some(v=>typeof v!=='string'||!v.trim()||v.length>200||v.includes('\0')))invalid();
  const allowed=new Set(byId.get(r.candidate_id).sources.map(s=>s.id));
  if(!Array.isArray(r.evidence_ids)||r.evidence_ids.length>5||new Set(r.evidence_ids).size!==r.evidence_ids.length||r.evidence_ids.some(id=>!allowed.has(id))||(r.decision==='excluded'||r.decision==='investigate'&&r.relevance_grade>=2)&&!r.evidence_ids.length)invalid();
  // Conservative guard against explicit certification. All model prose remains unverified.
  if(commentaryIssues([r.reason,r.hypothesis].join(' ')).length)invalid();
  if(/\b(?:pilot|intervention|automation|ai)\s+(?:reduces?|lowers?|saves?|improves?)\b/i.test(r.falsifier)&&!/\b(?:fail|not|without|no|less than|below|insufficient|cannot|doesn't|does not)\b/i.test(r.falsifier))invalid();
  if(/\b(?:verified|confirmed|proven|guaranteed)\s+(?:net\s+)?(?:savings|profit|revenue|ebitda|economics|sale availability|seller willingness)\b/i.test([r.reason,r.hypothesis].join(' ')))invalid();
 }
 return data.reviews;
}
export function prospectView(row){const s=prospectState(row),done=s.status==='completed';const items=s.items.map(c=>({...c,fresh_review:s.reviews[c.id]}));const accepts=c=>c.fresh_review?.relevance_grade>=2&&c.fresh_review?.decision==='investigate';return {id:row.id,thesis:JSON.parse(row.request_json).thesis,status:s.status==='ready'?'queued':s.status,created_at:new Date(row.created_at).toISOString(),completed:Object.keys(s.reviews).length,total:s.items.length,error:s.error,retryable:s.status==='failed',results:done?items.filter(accepts).sort((a,b)=>b.fresh_review.relevance_grade-a.fresh_review.relevance_grade):[],rejected:done?items.filter(c=>!accepts(c)):[],job_ids:s.job_ids};}
