import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MODELS,EXPECTED_DIGESTS} from './models.mjs';
import {AIRLLM_CANDIDATES} from './airllm-provider.mjs';
import {NATIVE_CANDIDATES} from './native-provider.mjs';
import {peerVqaMethodSchema,validatePeerVqaMethod} from './peer-vqa-method.mjs';
export const LARGER_PEER_PINS=Object.freeze(Object.fromEntries(Object.entries(AIRLLM_CANDIDATES).map(([key,p])=>['airllm:'+key,Object.freeze({repo:p.repo,revision:p.revision,source_ref_sha256:createHash('sha256').update(p.repo+'@'+p.revision).digest('hex')})])));
export const NATIVE_PEER_PINS=Object.freeze(Object.fromEntries(Object.entries(NATIVE_CANDIDATES).map(([key,p])=>['native:'+key,p])));
export const PEER_VQA_VERSION='modified-vqa-cross-grade-2';
export const DIMENSIONS=['relevance','accuracy','evidence_support','unknowns_conflicts','ranking','decision_usefulness'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function identity(model,digest){if(MODELS.includes(model)&&EXPECTED_DIGESTS[model]===digest)return {model,digest};const p=LARGER_PEER_PINS[model];if(p&&p.source_ref_sha256===digest)return {model,digest,identity_kind:'hf_immutable_source_ref_sha256_not_weight_hash',repo:p.repo,revision:p.revision,semantic_quality:'not_independently_qualified'};const n=NATIVE_PEER_PINS[model];if(n&&n.sha256===digest)return {model,digest,identity_kind:'gguf_weight_sha256',repo:n.repo,revision:n.revision,independence_key:n.independence_key,semantic_quality:'not_independently_qualified'};throw Error('Peer VQA requires an approved pinned checkpoint identity.');}
// Derive from the closed registry, never a caller-supplied lineage label.
function independence(author){const a=identity(author.model,author.digest);return NATIVE_PEER_PINS[a.model]?.independence_key??LARGER_PEER_PINS[a.model]?.repo??a.model;}
export function analystSkill(model){
 const folder=model==='deepseek-r1:8b'?'deepseek-peer-vqa':model==='gemma4:12b'?'gemma-peer-vqa':model==='airllm:qwen32'||model==='native:qwen32'?'qwen32-peer-vqa':model==='airllm:deepseek32'?'deepseek32-peer-vqa':model==='native:qwen14'?'qwen14-peer-vqa':model==='native:deepseek14'?'deepseek14-peer-vqa':null;
 if(!folder)throw Error('No peer VQA skill is approved for this checkpoint.');
 const shared=readFileSync(new URL('./analyst-skills/peer-vqa-contract.md',import.meta.url),'utf8');
 const role=readFileSync(new URL(`./analyst-skills/${folder}/SKILL.md`,import.meta.url),'utf8');
 const text=shared+'\n'+role;return {id:folder,version:PEER_VQA_VERSION,text,sha256:createHash('sha256').update(text).digest('hex')};
}
export function sealSubmission({author_model,author_digest,input_sha256,value,source_receipts=[],execution_context}){
 const author=identity(author_model,author_digest);
 if(!/^[a-f0-9]{64}$/.test(input_sha256)||!value||typeof value!=='object'||!Array.isArray(source_receipts))throw Error('A submission needs its input hash, actual authored work and server-owned source receipts.');
 const body=structuredClone({author,author_skill_sha256:analystSkill(author.model).sha256,input_sha256,value,source_receipts,...(execution_context?{execution_context}:{})});
 return freeze({...body,submission_hash:hash(body),sealed_at:new Date().toISOString()});
}
export function verifySubmission(s){
 if(!s?.author)throw Error('Missing sealed author submission.');identity(s.author.model,s.author.digest);
 if(s.submission_hash!==hash({author:s.author,author_skill_sha256:s.author_skill_sha256,input_sha256:s.input_sha256,value:s.value,source_receipts:s.source_receipts,...(s.execution_context?{execution_context:s.execution_context}:{})}))throw Error('The author submission changed after it was sealed.');
 return s;
}
export function assignPeer({reviewer_model,reviewer_digest,submission}){
 const reviewer=identity(reviewer_model,reviewer_digest);verifySubmission(submission);
 if(reviewer.digest===submission.author.digest||independence(reviewer)===independence(submission.author))throw Error('No grading your own homework: author and reviewer must be different checkpoints.');
 return freeze({reviewer,author:submission.author,submission_hash:submission.submission_hash,submission});
}
export function crossAssignments(submissions){
 if(!Array.isArray(submissions)||submissions.length!==2)throw Error('Seal both independent submissions before peer exchange.');
 submissions.forEach(verifySubmission);
 if(submissions[0].input_sha256!==submissions[1].input_sha256)throw Error('Both authors must receive the identical frozen input before exchange.');
 if(submissions[0].author.digest===submissions[1].author.digest)throw Error('Two role labels on one checkpoint do not establish independent peer grading.');
 return submissions.map((s,i)=>assignPeer({reviewer_model:s.author.model,reviewer_digest:s.author.digest,submission:submissions[1-i]}));
}
const bounded=max=>({type:'string',maxLength:max,minLength:1});
const rubricItem={type:'object',additionalProperties:false,required:['verdict','reason'],properties:{verdict:{type:'string',enum:['pass','fail','not_assessable','not_applicable']},reason:bounded(260)}};
export function peerSchema(assignment,packet){
 const ids=packet.ledger.map(s=>s.id);
 return {type:'object',additionalProperties:false,required:['submission_hash','verdict','rubric','claim_checks','vqa','next_action'],properties:{
  submission_hash:{type:'string',const:assignment.submission_hash},
  verdict:{type:'string',enum:['pass','fail','needs_evidence']},
  rubric:{type:'object',additionalProperties:false,required:DIMENSIONS,properties:Object.fromEntries(DIMENSIONS.map(k=>[k,rubricItem]))},
  claim_checks:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['claim','status','source_id','quote','reason'],properties:{claim:bounded(300),status:{type:'string',enum:['supported','contradicted','not_addressed','conflicting']},source_id:{anyOf:[{type:'null'},...(ids.length?[{type:'string',enum:ids}]:[])]},quote:{type:'string',maxLength:500},reason:bounded(260)}}},
  vqa:peerVqaMethodSchema,
  next_action:bounded(500)
 }};
}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const string=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&!v.includes('\0')&&(empty||v.trim().length>0);
export function recordPeerGrade(assignment,value,packet){
 assignPeer({reviewer_model:assignment.reviewer.model,reviewer_digest:assignment.reviewer.digest,submission:assignment.submission});
 if(assignment.submission_hash!==assignment.submission.submission_hash||assignment.author.digest!==assignment.submission.author.digest||assignment.author.model!==assignment.submission.author.model)throw Error('The peer assignment no longer matches its sealed author.');
 if(!exact(value,['submission_hash','verdict','rubric','claim_checks','vqa','next_action'])||value.submission_hash!==assignment.submission_hash||!['pass','fail','needs_evidence'].includes(value.verdict)||!string(value.next_action,500))throw Error('Peer grade is incomplete or refers to a different submission.');
 if(!exact(value.rubric,DIMENSIONS)||DIMENSIONS.some(k=>!exact(value.rubric[k],['verdict','reason'])||!['pass','fail','not_assessable','not_applicable'].includes(value.rubric[k].verdict)||!string(value.rubric[k].reason,260)))throw Error('Peer grade omitted a required independent quality dimension.');
 if(DIMENSIONS.some(k=>value.rubric[k].verdict==='not_applicable'&&(k!=='ranking'||!['known_deal','value_creation'].includes(assignment.submission.value.workflow_intent))))throw Error('Only single-opportunity ranking may be not applicable.');

 if(value.verdict==='fail'&&!DIMENSIONS.some(k=>value.rubric[k].verdict==='fail')&&value.vqa?.finding!=='defect')throw Error('A failed peer verdict needs an actionable failed dimension or defect.');
 if(DIMENSIONS.some(k=>value.rubric[k].verdict==='fail')&&value.verdict!=='fail')throw Error('A failed quality dimension cannot be averaged into acceptance.');
 if(DIMENSIONS.some(k=>value.rubric[k].verdict==='not_assessable')&&value.verdict==='pass')throw Error('Unassessed work cannot receive a complete passing grade.');
 validatePeerVqaMethod(value.vqa,assignment.submission.value);
 if(value.vqa.finding==='defect'&&value.verdict!=='fail')throw Error('An established VQA defect must fail the peer grade.');
 if(value.vqa.finding==='unknown'&&value.verdict==='pass')throw Error('A material VQA unknown cannot receive a complete passing grade.');
 if(!Array.isArray(value.claim_checks)||value.claim_checks.length>6)throw Error('Invalid peer claim audit.');
 if(value.verdict==='needs_evidence'&&!DIMENSIONS.some(k=>value.rubric[k].verdict==='not_assessable')&&value.vqa?.finding!=='unknown')throw Error('Needs evidence requires an explicit unassessed dimension or material unknown.');
 const quote_receipts=[];
 for(const c of value.claim_checks){
  if(!exact(c,['claim','status','source_id','quote','reason'])||!string(c.claim,300)||!string(c.reason,260)||!string(c.quote,500,true)||!['supported','contradicted','not_addressed','conflicting'].includes(c.status))throw Error('Invalid peer claim check.');
  const source=packet.ledger.find(s=>s.id===c.source_id);
  if(c.source_id!==null&&!source)throw Error('Peer cited an unavailable source.');
  const excerpt=source?.passage.includes(c.quote),snapshot_note=source?.facts?.some(text=>text.includes(c.quote));
  if(c.quote&&(!source||!excerpt&&!snapshot_note))throw Error('Peer quote does not occur in the cited passage or supplied snapshot notes.');
  if(c.quote)quote_receipts.push({source_id:c.source_id,quote:c.quote,text_kind:excerpt?'stored_source_excerpt':'reviewed_snapshot_paraphrase',original_website_quote_verified:false});
  if(['supported','contradicted'].includes(c.status)&&(!source||!c.quote))throw Error('A proposed supported/contradicted label needs its exact source passage.');
 }
 if(value.verdict==='pass'&&value.claim_checks.some(c=>c.status!=='supported'))throw Error('A disputed claim cannot receive a complete passing grade; retain the failed or unresolved assessment.');
 return freeze({reviewer:assignment.reviewer,author:assignment.author,submission_hash:assignment.submission_hash,skill:analystSkill(assignment.reviewer.model).id,skill_sha256:analystSkill(assignment.reviewer.model).sha256,value:structuredClone(value),quote_receipts,verification:'Quote-span checks only against stored excerpt or labeled snapshot paraphrase; semantic labels and peer grades remain unverified model judgments. No original website quote was verified by this call.',status:'peer_assessment_unverified'});
}
