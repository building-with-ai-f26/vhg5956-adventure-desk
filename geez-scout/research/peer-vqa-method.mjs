// Direct observations about a sealed answer are separate from proposed causal experiments.
const text=max=>({type:'string',minLength:1,maxLength:max});
const nullable={anyOf:[text(380),{type:'null'}]};
export const peerVqaMethodSchema={type:'object',additionalProperties:false,required:['review_subject','method','finding','defect','inspection','hypothesis','prediction','test','reject_if','executed'],properties:{
 review_subject:{type:'string',const:'sealed_author_work'},method:{type:'string',enum:['artifact_inspection','causal_proposal','no_material_issue']},finding:{type:'string',enum:['defect','unknown','no_material_issue']},defect:text(380),
 inspection:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['work_quote','criterion','observation','critique_rejected_by'],properties:{work_quote:text(500),criterion:text(380),observation:text(380),critique_rejected_by:text(380)}}]},
 hypothesis:nullable,prediction:nullable,test:nullable,reject_if:nullable,executed:{type:'boolean',const:false}
}};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const valid=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\0');
const strings=v=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
export function validatePeerVqaMethod(v,authoredWork){
 if(!exact(v,peerVqaMethodSchema.required)||v.review_subject!=='sealed_author_work'||!['artifact_inspection','causal_proposal','no_material_issue'].includes(v.method)||!['defect','unknown','no_material_issue'].includes(v.finding)||!valid(v.defect,380)||v.executed!==false)throw Error('Peer VQA must distinguish a proposed discriminating test from executed work and identify the sealed review subject.');
 const causal=['hypothesis','prediction','test','reject_if'];
 if(v.method==='no_material_issue'){
  if(v.finding!=='no_material_issue'||v.inspection!==null||causal.some(k=>v[k]!==null))throw Error('Do not invent a VQA defect to fill a required field; no-material-issue tests must be null.');
 }else if(v.method==='artifact_inspection'){
  if(v.finding==='no_material_issue'||causal.some(k=>v[k]!==null)||!exact(v.inspection,['work_quote','criterion','observation','critique_rejected_by'])||!valid(v.inspection.work_quote,500)||['criterion','observation','critique_rejected_by'].some(k=>!valid(v.inspection[k],380)))throw Error('Artifact inspection needs direct quoted observations and a critique rejection condition, with causal experiment fields null.');
  if(!strings(authoredWork).some(s=>s.includes(v.inspection.work_quote)))throw Error('Artifact inspection quote is absent from the sealed author work.');
 }else if(v.finding==='no_material_issue'||v.inspection!==null||causal.some(k=>!valid(v[k],380)))throw Error('A causal proposal needs a linked hypothesis, prediction, test and rejection condition; do not invent a clean-work defect.');
 return v;
}
