import {mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uuid=/^[a-f0-9-]{36}$/i,hex=/^[a-f0-9]{64}$/;
export async function recordFailedExperiment(stateRoot,{run_id,session_id,input,error,code='unclassified_execution_failure'}){
 if(!uuid.test(run_id)||!uuid.test(session_id))throw Error('Invalid private experiment identity');const folder=resolve(stateRoot,'experiments');await mkdir(folder,{recursive:true});const record={schema:'geez-experiment-v1',run_id,session_id,observed_at:new Date().toISOString(),input_sha256:hash(input),outcome:'execution_failed',observed_error:String(error).slice(0,1000),error_code:code,cause_verified:false,proposed_rule:null,promotion_status:'not_proposed',notice:'An execution failure is not evidence that the investment or model reasoning failed. No rule is inferred automatically.'};await writeFile(resolve(folder,run_id+'.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return {run_id,input_sha256:record.input_sha256,promotion_status:record.promotion_status};
}
export function lessonCandidate({origin_run_id,origin_input_sha256,author_digest,rule,scope}){
 if(!uuid.test(origin_run_id)||!hex.test(origin_input_sha256)||!hex.test(author_digest)||typeof rule!=='string'||!rule.trim()||rule.length>2000||rule.includes('\0'))throw Error('Invalid candidate lesson');
 if(!scope||!Array.isArray(scope.intents)||!scope.intents.length||scope.intents.some(x=>!['sourcing','known_deal','value_creation','thesis_builder'].includes(x))||!Array.isArray(scope.categories)||!scope.categories.length||scope.categories.some(x=>typeof x!=='string'||!x.trim()||x==='*')||typeof scope.section!=='string'||!scope.section.trim())throw Error('Candidate needs explicit applicability; no implicit global rule');
 const content={origin_run_id,origin_input_sha256,author_digest,rule,scope};return {...content,candidate_sha256:hash(content),status:'candidate_not_policy'};
}
// Called only by a trusted local qualification runner, never by a public HTTP payload.
// Registry entries must come from actual independently verified local runs, not model-authored assertions.
export function assessLesson(candidate,evidence,registry={models:{},runs:{}}){
 const {candidate_sha256,status,...content}=candidate,reasons=[];if(hash(content)!==candidate_sha256)reasons.push('candidate_changed');
 const review=registry.runs[evidence?.peer_review_run_id],reviewer=review&&registry.models[review.reviewer_digest];
 if(!review||!reviewer?.semantic_qualified||!['owned_ollama','airllm'].includes(reviewer.provider))reasons.push('independent_local_reviewer_unqualified');
 if(review?.reviewer_digest===candidate.author_digest)reasons.push('self_grading_forbidden');
 if(review?.candidate_sha256!==candidate_sha256||review?.verdict!=='pass')reasons.push('missing_current_peer_approval');
 const fix=registry.runs[evidence?.origin_replay_run_id];if(!fix||fix.before!=='fail'||fix.after!=='pass'||fix.input_sha256!==candidate.origin_input_sha256||fix.candidate_sha256!==candidate_sha256)reasons.push('origin_remedy_unverified');
 const controls=(evidence?.negative_control_run_ids||[]).map(id=>registry.runs[id]);if(controls.length<3||new Set(controls.map(r=>r?.input_sha256)).size!==controls.length||controls.some(r=>!r||r.before!=='pass'||r.after!=='pass'||r.input_sha256===candidate.origin_input_sha256||r.candidate_sha256!==candidate_sha256))reasons.push('unrelated_negative_controls_missing_or_regressed');
 const excepted=registry.runs[evidence?.must_not_fire_run_id];if(!excepted||excepted.rule_applied!==false||excepted.after!=='pass'||excepted.candidate_sha256!==candidate_sha256)reasons.push('scope_exception_not_verified');
 const ablation=registry.runs[evidence?.ablation_run_id];if(!ablation||ablation.full_frozen_dev_set!==true||ablation.no_regression!==true||ablation.candidate_sha256!==candidate_sha256)reasons.push('full_dev_ablation_not_verified');
 return {candidate_sha256,eligible_for_scoped_promotion:reasons.length===0,reasons,applied_to_model_context:false,notice:'Receipt consistency is not factual or semantic verification. Only independently qualified local execution records may populate the trusted registry.'};
}
