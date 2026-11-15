import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SCOUT_LOCAL_PINS} from './scout-local-models.mjs';
import {validateScoutJson} from './scout-schema.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const skill=readFileSync(new URL('./analyst-skills/component-source-probe/SKILL.md',import.meta.url),'utf8');
const text=max=>({type:'string',minLength:1,maxLength:max});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const strings=x=>typeof x==='string'?[x]:x&&typeof x==='object'?Object.values(x).flatMap(strings):[];
export function sealComponentProbe(generation,receiptSha,criteria){
  const pin=SCOUT_LOCAL_PINS[generation.trace?.model];
  if(!pin||generation.trace.digest!==pin.digest||generation.trace.weight_sha256!==pin.weight_sha256||!generation.trace.local_only||!generation.value||!/^[a-f0-9]{64}$/.test(receiptSha))throw Error('Unverified component author or receipt');
  const inputText=JSON.stringify(generation.input);
  if(typeof generation.prompt!=='string'||!generation.prompt.endsWith(inputText))throw Error('Exact original author instructions are unavailable');
  const body={author:generation.trace.model,author_digest:pin.digest,independence_key:pin.independence_key,generation_receipt_sha256:receiptSha,original_author_instructions:generation.prompt.slice(0,-inputText.length),original_input:structuredClone(generation.input),author_work:structuredClone(generation.value),criteria:structuredClone(criteria)};
  return {...body,submission_hash:hash(body)};
}
export function componentProbeTask(reviewer,sealed){
  const {submission_hash,...body}=sealed;
  const author=SCOUT_LOCAL_PINS[sealed.author],pin=SCOUT_LOCAL_PINS[reviewer];
  if(!author||!pin||author.digest!==sealed.author_digest||author.independence_key!==sealed.independence_key||hash(body)!==submission_hash||typeof sealed.original_author_instructions!=='string')throw Error('Changed component, incomplete original assignment or unregistered identity');
  if(author.independence_key===pin.independence_key)throw Error('No grading your own homework');
  const sources=sealed.original_input.broker_sentences||sealed.original_input.evidence||[];
  const ids=sources.map(e=>e.id);
  const quotable=[...new Set([...strings(sealed.author_work),JSON.stringify(sealed.author_work)])].filter(s=>s.length<=1000);
  const common={submission_hash:{type:'string',const:submission_hash},evidence_id:nullable({type:'string',enum:ids}),reason:{type:'string',minLength:20,maxLength:500}};
  const branch=(status,quote,critique)=>({type:'object',additionalProperties:false,required:['submission_hash','factual_support','work_quote','evidence_id','reason','evidence_that_would_disprove_finding'],properties:{...common,factual_support:{type:'string',const:status},work_quote:quote,evidence_that_would_disprove_finding:critique}});
  const actualQuote={type:'string',enum:quotable};
  const falsifier={type:'string',minLength:30,maxLength:400};
  const schema={anyOf:[branch('unsupported',actualQuote,falsifier),branch('supported',{type:'null'},{type:'null'}),branch('not_assessable',nullable(actualQuote),falsifier)]};
  // Confidence, expected verdicts, filenames and the author's self-assessment stay out.
  const packet={submission_hash,original_author_instructions:sealed.original_author_instructions,original_author_task_input:sealed.original_input,other_model_work:sealed.author_work,criteria:sealed.criteria};
  return {prompt:skill+'\nInspect only factual support in this other model work. Do not invent citation-format or other requirements absent from the exact original assignment. Return the requested JSON. Use null for work_quote and evidence_that_would_disprove_finding when no defect is established.\n'+JSON.stringify(packet),schema,version:'evidence-support-v4',skill_sha256:createHash('sha256').update(skill).digest('hex'),skill_documents_loaded:1};
}
export function recordComponentProbe(reviewer,sealed,value){
  const task=componentProbeTask(reviewer,sealed);
  const falsifier=value?.evidence_that_would_disprove_finding;
  if(value?.factual_support==='unsupported'&&(!value.work_quote||typeof falsifier!=='string'||falsifier.trim().length<30||/^(?:null|none|n\/?a|not applicable|unknown)[.!\s]*$/i.test(falsifier)))throw Error('Unsupported finding needs exact work and rejection condition');
  validateScoutJson(value,task.schema);
  if(value.work_quote&&!strings(sealed.author_work).some(s=>s.includes(value.work_quote))&&!JSON.stringify(sealed.author_work).includes(value.work_quote))throw Error('Probe quote is not in sealed work');
  return {reviewer,reviewer_digest:SCOUT_LOCAL_PINS[reviewer].digest,author:sealed.author,submission_hash:sealed.submission_hash,...value,version:task.version,scope:'evidence_support_probe_only',unassessed_dimensions:['relevance','accuracy_beyond_served_sources','unknown_conflicts_beyond_this_probe','ranking','decision_usefulness'],approval:false,external_test_executed:false,skill_sha256:task.skill_sha256};
}
