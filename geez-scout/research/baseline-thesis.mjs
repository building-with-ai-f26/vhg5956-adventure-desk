// Small local-only thesis component. These are editable investor-intent drafts,
// not research findings or independently approved investment recommendations.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {exclusive} from './models.mjs';
import {thesisInput} from './thesis.mjs';
import {SCOUT_LOCAL_PINS,scoutLocalCall} from './scout-local-models.mjs';
import {validateScoutJson} from './scout-schema.mjs';
export const THESIS_AUTHOR='scout:deepseek14',THESIS_REVIEWER='scout:gemma12';
const modelName=model=>model==='scout:gemma12'?'Gemma':'DeepSeek';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const text=max=>({type:'string',maxLength:max});
const draftText={type:'string',minLength:20,maxLength:1600};
export const baselineThesisSchema=object({draft:draftText,reply:{type:'string',minLength:20,maxLength:700}});
export const thesisFidelitySchema=object({faithful:{type:'boolean'},reason:{type:'string',minLength:20,maxLength:400}});
export function baselineThesisInput(input={}){
 const data=thesisInput(input),notes=input.notes??'';
 if(typeof notes!=='string'||notes.length>10000||notes.includes('\0'))throw Error('Keep optional notes under 10,000 characters.');
 return {...data,notes};
}
export function baselineThesisTask(input){
 const data=baselineThesisInput(input);
 return {input:data,schema:object({draft:draftText}),prompt:'Restate ONLY this investor’s chosen intent as a short, self-contained search brief for local research AIs. Return JSON with ONE field: draft. Use four labeled lines: Approach; Interests/preferences; Hard conditions/exclusions; Open.\nPreserve selected category and explicit exclusions in the draft itself. "I like" means preference, not must-have. Flexible location/size stays open. Never add a mandatory choice, target sector, amount, financing or improvement strategy. Experience is not automatically a required target industry. Latest user corrections replace earlier choices; assistant messages are suggestions, not investor decisions. Include all remaining chosen constraints. No investment benefits, claims, advice or questions in this task: just the investor’s intent. Unspecified dimensions stay open; no required profile.\nINPUT:\n'+JSON.stringify(data)};
}
export function baselineThesisReplyTask(input,draft){
 return {schema:object({reply:{type:'string',minLength:20,maxLength:700}}),prompt:'Write the next helpful thesis-development CHAT REPLY. Return a JSON OBJECT with ONE string field named reply.\nAnswer the latest user clarification or acknowledge their correction first. For vague recurring-revenue interest, offer two distinct business models described neutrally by activity and how revenue is earned. Ask at most one optional next question; if already ready, say they can research now. Preserve chosen constraints and open choices. No invented target facts, financial/quality/risk benefits or mandatory profile, budget or geography. No targets have been researched yet.\nINPUT:\n'+JSON.stringify({original:input,current_brief:draft})};
}
export function sealThesis(input,proposal,author=THESIS_AUTHOR){
 const pin=SCOUT_LOCAL_PINS[author];if(!pin)throw Error('Unregistered thesis author.');
 validateScoutJson(proposal,baselineThesisSchema);
 const body={input:structuredClone(input),author,author_digest:pin.digest,proposal:structuredClone(proposal)};
 return {...body,submission_hash:hash(body)};
}
export function thesisFidelityTask(sealed,reviewer=THESIS_REVIEWER){
 const {submission_hash,...body}=sealed,author=SCOUT_LOCAL_PINS[sealed.author],peer=SCOUT_LOCAL_PINS[reviewer];
 if(!author||!peer||sealed.author_digest!==author.digest||author.independence_key===peer.independence_key||hash(body)!==submission_hash)throw Error('Self-review, changed thesis or unpinned author refused.');
 return thesisFidelityAssessmentTask(sealed.input,sealed.proposal,submission_hash);
}
// Shared blind assessment content also permits clearly recorded development
// controls; production identity and exact-artifact guards live above.
export function thesisFidelityAssessmentTask(input,proposal,submissionHash){
 return {schema:thesisFidelitySchema,prompt:'Review ONLY this other author’s search brief AND chat reply against the exact investor input. Return faithful and one concrete diagnostic reason; never write or grade your own replacement content.\nReject lost exclusions/corrections, changed approach, invented choices/benefits, or preferences made mandatory. The brief must preserve chosen intent; flexible location/size stays open. Latest user corrections supersede older draft/notes. The reply should answer the latest clarification or acknowledge correction, not only repeat a question. Requested plain-English explanations of business-model concepts are allowed; do not require the investor to have supplied their definitions. Optional business-model alternatives are allowed, but no unrequested profit/margin/risk/quality assumptions. For vague recurring-revenue interest, require distinct models rather than overlapping pricing tiers or a generic checklist. Suggested options must not be adopted into the brief until chosen. At most one optional question; no required profile/budget/geography or invented completed research. Do not invent extra citation/format requirements.\nORIGINAL INPUT AND OTHER-AUTHOR PROPOSAL:\n'+JSON.stringify({submission_hash:submissionHash,original:input,proposal})};
}
export async function baselineThesis(input,progress=()=>{},{caller=scoutLocalCall,checkpoint,signal}={}){
 const data=baselineThesisInput(input);
 if(!data.draft.trim()&&!data.notes.trim()&&!data.messages.some(m=>m.role==='user'&&m.content.trim()))return {kind:'baseline_thesis',onboarding:true,model_calls:0};
 return exclusive(async()=>{
  const actual=caller===scoutLocalCall,traces=[],checkpoints=[];let sealed,pendingCall,review;
  async function invoke(model,task,stage){
   signal?.throwIfAborted();const predict=stage==='thesis_reply'?3072:2048,need=Buffer.byteLength(task.prompt)+predict+1024,context=[4096,6144,8192,12288,16384,24576,32768].find(n=>n>=need);
   if(!context)throw Error('This complete conversation is too long for the local thesis turn. Your text is saved.');
   pendingCall={model,stage,...task,context,predict};
   const result=await caller(model,task.prompt,task.schema,{context,predict,signal});
   validateScoutJson(result.value,task.schema);
   if(actual&&(!result.trace?.local_only||result.trace.digest!==SCOUT_LOCAL_PINS[model].digest||!result.trace.thinking_characters))throw Error('Pinned local thesis execution was not verified.');
   traces.push({stage,model,prompt_sha256:hash(task.prompt),schema_sha256:hash(task.schema),context,predict,...result.trace});pendingCall=null;return result.value;
  }
  try{
   progress({message:modelName(THESIS_AUTHOR)+' is developing your thesis and research criteria',completed_steps:0,total_steps:3});
   const draft=await invoke(THESIS_AUTHOR,baselineThesisTask(data),'thesis_author');
   progress({message:modelName(THESIS_AUTHOR)+' is responding to your latest idea or question',completed_steps:1,total_steps:3});
   const reply=await invoke(THESIS_AUTHOR,baselineThesisReplyTask(data,draft.draft),'thesis_reply');
   sealed=sealThesis(data,{...draft,...reply});
   if(checkpoint)await checkpoint(structuredClone(sealed));
   else if(actual){const dir=new URL('../.baseline-artifacts/',import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(randomUUID()+'.thesis.json',dir),raw=JSON.stringify(sealed,null,2);await writeFile(file,raw,{flag:'wx'});checkpoints.push({file:file.href,sha256:createHash('sha256').update(raw).digest('hex'),phase:'author_before_peer'});}
   progress({message:modelName(THESIS_REVIEWER)+' is checking the thesis and reply against your choices',completed_steps:2,total_steps:3});
   review=await invoke(THESIS_REVIEWER,thesisFidelityTask(sealed),'thesis_fidelity');
   thesisFidelityTask(sealed); // Refuse changed work after the review too.
   if(!review.faithful)throw Error('The thesis needs a revision: '+review.reason);
   return {kind:'baseline_thesis',...sealed.proposal,model_calls:traces.length,test_only:!actual,review:{author:THESIS_AUTHOR,reviewer:THESIS_REVIEWER,submission_hash:sealed.submission_hash,scope:'investor_intent_and_reply_fidelity_only',approval:false,...review},notice:'An editable proposal. No target research has run; you choose whether to use or change it.',audit:{input:data,sealed,review,traces,checkpoints}};
  }catch(error){error.audit={input:data,sealed,review,traces,checkpoints,failed_call:pendingCall,failure:{message:error.message,raw:error.raw},test_only:!actual};throw error;}
 });
}
