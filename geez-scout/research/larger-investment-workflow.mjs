// Explicit development qualification entry point. Not a production fallback or default model switch.
import {createHash,randomUUID} from 'node:crypto';
import {experimentalAirllm,AIRLLM_CANDIDATES} from './airllm-provider.mjs';
import {exclusive} from './models.mjs';
import {knowledgeSession} from './knowledge.mjs';
import {dealPacket} from './deal-packet.mjs';
import {intentSchema,validateIntentOutput} from './intent-workflow.mjs';
import {routeExtension,extensionInstructions,plannedRoomRequirements} from './extension.mjs';
import {dataRoom} from './data-room.mjs';
import {analystSkill,LARGER_PEER_PINS,sealSubmission,crossAssignments,peerSchema,recordPeerGrade} from './peer-vqa.mjs';
import {quoteReceipts} from './quote-receipts.mjs';
import {combinePeerWork} from './combine-peer-work.mjs';
import {experimentalNative,NATIVE_CANDIDATES} from './native-provider.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const largerInvestmentWorkflow=(request,progress,caller=experimentalAirllm)=>pairedInvestmentWorkflow(request,progress,caller,'airllm');
export const nativeInvestmentWorkflow=(request,progress,caller=experimentalNative)=>pairedInvestmentWorkflow(request,progress,caller,'native');
async function pairedInvestmentWorkflow({query='',notes='',category='',intent='known_deal',context=16384,predict=8192,signal},progress=()=>{},caller,provider){
 const native=provider==='native',profiles=native?['qwen14','deepseek14']:['qwen32','deepseek32'],actual=caller===(native?experimentalNative:experimentalAirllm);
 signal?.throwIfAborted();
 if(!['known_deal','value_creation'].includes(intent)||typeof query!=='string'||query.length>2000||typeof notes!=='string'||notes.length>10000||typeof category!=='string'||category.length>100)throw Error('Unsupported or oversized larger-model request');
 const packet=dealPacket({query,notes,category}),selection=routeExtension({intent,query:query+' '+notes,category}),instructions=extensionInstructions(selection),room=dataRoom(plannedRoomRequirements(selection)),request={query,notes,category};
 if(!query.trim()&&!notes.trim())return {kind:'investment_workflow',intent,request,onboarding:true,summary:'Start with any opportunity or growth question. All investor inputs remain optional.',analyses:[],peer_grades:[],data_room:room,model_calls:0,experimental:true};
 return exclusive(async()=>{
  const started=Date.now(),id=randomUUID(),memory=await knowledgeSession({query:query+' '+notes,category,intent}),input={request,intent,packet,knowledge_snapshot:memory.receipt.snapshot_sha256,knowledge_packet:memory.receipt.packet_sha256,instruction_projection:instructions.projection_sha256},inputHash=hash(input),sealed=[],analyses=[],reviews=[],traces=[];
  const common='Do the actual investment task concretely. All supplied statements are unverified. Preserve exact requirements, exclusions and unknowns. No invented prices, scores, thresholds, searches, deal approval or operating authority. Separate thesis fit, intrinsic deal quality and price. A safe generic answer fails. Use only supplied source IDs. Give decision-changing tests and support calculations with explicit supplied inputs. Return strictly the requested JSON schema after completing thinking.\n'+instructions.text;
  const invoke=async(profile,prompt,schema)=>{signal?.throwIfAborted();const r=await memory.wrap(async(_model,prompt)=>caller(prompt,{profile,context,predict,signal,schema,structuredSampling:native,allowContextExpansion:native,maxContext:32768}))(profile,prompt,schema);signal?.throwIfAborted();if(actual){if(native){const pin=NATIVE_CANDIDATES[profile];if(r.trace.checkpoint?.sha256!==pin.sha256||r.trace.checkpoint?.revision!==pin.revision||!r.trace.owned_processes_zero||!r.trace.private_port_closed)throw Error('Actual native execution identity or ownership not verified');}else{const pin=AIRLLM_CANDIDATES[profile];if(r.trace.upstream_repo!==pin.repo||r.trace.upstream_revision!==pin.revision||!r.trace.owned_processes_zero||!/^[a-f0-9]{64}$/.test(r.trace.artifact_manifest_sha256))throw Error('Actual larger-model execution identity or ownership not verified');}}traces.push(r.trace);return r;};
  try{for(const [i,profile] of profiles.entries()){
   const model=provider+':'+profile;progress({phase:'independent_workflow',completed_steps:i,total_steps:4,message:'Preparing independent analysis '+(i+1)});
   const schema=intentSchema(packet),r=await invoke(profile,common+'\n'+analystSkill(model).text+'\nINPUT_JSON:\n'+JSON.stringify(input)+'\nOUTPUT_SCHEMA:\n'+JSON.stringify(schema),schema);
   validateIntentOutput(r.value,packet,intent);analyses.push({model,value:r.value,status:'model_assessment_unverified',evidence_receipts:quoteReceipts(r.value.evidence_checks,packet)});
   sealed.push(sealSubmission({author_model:model,author_digest:native?NATIVE_CANDIDATES[profile].sha256:LARGER_PEER_PINS[model].source_ref_sha256,input_sha256:inputHash,value:r.value,source_receipts:packet.source_access,execution_context:{transport:actual?'local_model_runtime':'injected_caller',provider,source_artifact_manifest_sha256:r.trace.artifact_manifest_sha256??null,weight_sha256:native?NATIVE_CANDIDATES[profile].sha256:null,semantic_quality:'not_independently_qualified'}}));
  }
  // This loop is deliberately unreachable until BOTH independent first answers have been sealed.
  for(const [i,a] of crossAssignments(sealed).entries()){
   const profile=a.reviewer.model.split(':')[1],schema=peerSchema(a,packet);progress({phase:'peer_workflow_review',completed_steps:2+i,total_steps:4,message:'The other checkpoint is grading sealed work'});
   const r=await invoke(profile,common+'\n'+analystSkill(a.reviewer.model).text+'\nGrade ONLY the supplied opposite-model author. Reproduce exact author claim strings in claim_checks. Do not evaluate your own work or invent claims for the composite.\nINPUT_JSON:\n'+JSON.stringify({original:input,author:a.author,submission_hash:a.submission_hash,peer_work:a.submission.value})+'\nOUTPUT_SCHEMA:\n'+JSON.stringify(schema),schema);reviews.push(recordPeerGrade(a,r.value,packet));
  }
  return {id,kind:'investment_workflow',intent,request,knowledge:memory.receipt,analyses,peer_grades:reviews,combined_brief:combinePeerWork(sealed,reviews,packet),peer_review_status:'cross_grades_recorded_unverified',data_room:room,skills:instructions.modules,category_profile:selection.category_key,category_selection:selection.category_selection,source_access:packet.source_access,facts:packet.ledger,coverage:packet.coverage,model_calls:traces.length,model_errors:[],limited_review:false,elapsed_ms:Date.now()-started,experimental:true,test_only:!actual,execution_context:{transport:actual?'local_model_runtime':'injected_caller',provider,semantic_quality:'not_independently_qualified'},production_promoted:false,notice:'Experimental local model work and reciprocal peer opinions. Not independently qualified investment advice or factual verification.',audit:{input,sealed_submissions:sealed,traces,knowledge:memory.audit}};
  }catch(error){error.audit={input,traces,sealed_submissions:sealed,analyses,peer_grades:reviews,test_only:!actual};throw error;}
 });
}
