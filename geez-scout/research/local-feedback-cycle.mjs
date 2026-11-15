// One writer, one critic, one revision. Feedback addresses the initial version;
// the revised result is an editable proposal, not an independently approved one.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {SCOUT_LOCAL_PINS,scoutLocalCall} from './scout-local-models.mjs';
import {validateScoutJson} from './scout-schema.mjs';
export const LOCAL_WRITER='scout:deepseek14',LOCAL_CRITIC='scout:gemma12';
export const LOCAL_CRITIC_PREDICT=6144;
export const feedbackHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const writerVqa=readFileSync(new URL('./analyst-skills/deepseek-self-vqa/SKILL.md',import.meta.url),'utf8');
const criticVqa=readFileSync(new URL('./analyst-skills/gemma-local-vqa/SKILL.md',import.meta.url),'utf8');
export const LOCAL_VQA_SKILLS={writer:{text:writerVqa,sha256:createHash('sha256').update(writerVqa).digest('hex')},critic:{text:criticVqa,sha256:createHash('sha256').update(criticVqa).digest('hex')}};
export function buildInitialTask({input,instructions,schema}){return {prompt:instructions+'\nReturn the requested JSON object.\nINPUT:\n'+JSON.stringify(input),schema};}
export function formatLocalFeedback(value){return typeof value==='string'?value:'Requirement tested: '+value.claim_tested+'\nCounterexample: '+value.counterexample+'\nCountercheck: '+value.countercheck;}
export function buildRevisionTask({input,instructions,schema,initial,feedback}){return {prompt:instructions+'\nImprove your initial work using the feedback. The investor’s latest intent takes precedence over feedback. Preserve what is already correct; fix omissions, unsupported claims and weak wording. Do not score or approve your own work. Return only the requested final JSON object.\n'+JSON.stringify({original:input,initial_work:initial,gemma_feedback:formatLocalFeedback(feedback)}),schema};}
export function buildFeedbackTask({input,initial,instructions,feedbackInstructions}){
 const detail={type:'object',additionalProperties:false,required:['claim_tested','counterexample','countercheck'],properties:{claim_tested:{type:'string',minLength:20,maxLength:1200},counterexample:{type:'string',minLength:20,maxLength:1200},countercheck:{type:'string',minLength:20,maxLength:1200}}};
 return {schema:{type:'object',additionalProperties:false,required:['feedback'],properties:{feedback:detail}},prompt:feedbackInstructions+'\nTry to falsify the claim that the OTHER model’s work satisfies this actual user/task. Return exactly {"feedback":{"claim_tested":"text","counterexample":"text","countercheck":"text"}}. All three fields always appear. Diagnose actual supplied evidence; DeepSeek alone writes the revision. No imagined permissions, replacement reply, alternative billing-plan list, score or manufactured faults.\n'+JSON.stringify({task_instructions:instructions,original:input,initial_hash:feedbackHash(initial),other_model_work:initial})};
}
export async function localTask(model,prompt,schema,{caller=scoutLocalCall,signal,predict=3072,stage='local_work'}={}){
 const method=model===LOCAL_WRITER?LOCAL_VQA_SKILLS.writer:LOCAL_VQA_SKILLS.critic;
 prompt=method.text+'\nTASK:\n'+prompt;
 const need=Buffer.byteLength(prompt)+predict+1024,context=[4096,6144,8192,12288,16384,24576,32768].find(n=>n>=need);
 if(!context)throw Error('The complete input is too large for this local run. Your text is preserved.');
 signal?.throwIfAborted();
 try{
  const r=await caller(model,prompt,schema,{predict,context,signal});validateScoutJson(r.value,schema);
  if(caller===scoutLocalCall&&(!r.trace?.local_only||r.trace.digest!==SCOUT_LOCAL_PINS[model]?.digest||!r.trace.thinking_characters))throw Error('Pinned local execution was not verified.');
  return {value:structuredClone(r.value),trace:{stage,model,local_vqa_skill_sha256:method.sha256,prompt_sha256:feedbackHash(prompt),schema_sha256:feedbackHash(schema),prompt,schema:structuredClone(schema),context,predict,...r.trace}};
 }catch(error){error.failed_call={model,stage,prompt,schema,context,predict,...(error.sampling?{sampling:error.sampling}:{})};throw error;}
}
export async function localFeedbackCycle({input,schema,instructions,feedbackInstructions,validate=()=>{},progress=()=>{}},{caller=scoutLocalCall,signal,checkpoint}={}){
 const actual=caller===scoutLocalCall,traces=[],checkpoints=[];let initial,feedback,final,initialHash;
 if(SCOUT_LOCAL_PINS[LOCAL_WRITER].independence_key===SCOUT_LOCAL_PINS[LOCAL_CRITIC].independence_key)throw Error('The writer cannot critique its own work.');
 try{
  progress({message:'DeepSeek is doing the work',phase:'work',completed_steps:0,total_steps:3});
  const initialTask=buildInitialTask({input,instructions,schema});
  const first=await localTask(LOCAL_WRITER,initialTask.prompt,initialTask.schema,{caller,signal,stage:'deepseek_work'});initial=first.value;traces.push(first.trace);initialHash=feedbackHash(initial);
  const snapshot={input,writer:LOCAL_WRITER,writer_digest:SCOUT_LOCAL_PINS[LOCAL_WRITER].digest,initial,initial_hash:initialHash};
  if(checkpoint)await checkpoint(structuredClone(snapshot));
  else if(actual){const dir=new URL('../.baseline-artifacts/',import.meta.url);await mkdir(dir,{recursive:true});const file=new URL(randomUUID()+'.feedback-initial.json',dir),raw=JSON.stringify(snapshot,null,2);await writeFile(file,raw,{flag:'wx'});checkpoints.push({file:file.href,sha256:createHash('sha256').update(raw).digest('hex'),phase:'initial_before_feedback'});}
  progress({message:'Gemma is giving focused feedback',phase:'feedback',completed_steps:1,total_steps:3});
  const critiqueTask=buildFeedbackTask({input,initial,instructions,feedbackInstructions});
  const critique=await localTask(LOCAL_CRITIC,critiqueTask.prompt,critiqueTask.schema,{caller,signal,predict:LOCAL_CRITIC_PREDICT,stage:'gemma_feedback'});feedback=formatLocalFeedback(critique.value.feedback);traces.push(critique.trace);
  if(feedbackHash(initial)!==initialHash)throw Error('The initial work changed during feedback.');
  progress({message:'DeepSeek is improving the answer from Gemma’s feedback',phase:'revise',completed_steps:2,total_steps:3});
  const revisionTask=buildRevisionTask({input,instructions,schema,initial,feedback});
  const revised=await localTask(LOCAL_WRITER,revisionTask.prompt,revisionTask.schema,{caller,signal,stage:'deepseek_revision'});final=revised.value;traces.push(revised.trace);validate(final);
  return {value:final,feedback,model_calls:3,test_only:!actual,process:{writer:LOCAL_WRITER,critic:LOCAL_CRITIC,writer_vqa_sha256:LOCAL_VQA_SKILLS.writer.sha256,critic_vqa_sha256:LOCAL_VQA_SKILLS.critic.sha256,feedback_on_hash:initialHash,final_hash:feedbackHash(final),approval:false,final_independently_rechecked:false},audit:{input,initial,initial_hash:initialHash,feedback,final,traces,checkpoints}};
 }catch(error){error.audit={input,initial,initial_hash:initialHash,feedback,final,traces,checkpoints,failed_call:error.failed_call,failure:{message:error.message,raw:error.raw},test_only:!actual};throw error;}
}
