// Atomic development tasks. Qualification is recorded in the experiment log;
// exporting a task does not qualify a checkpoint or the full scout workflow.
import {scoutLocalCall} from './scout-local-models.mjs';

export async function runTransitionRisk(model,evidenceRecord,{caller=scoutLocalCall,context=4096,predict=1536,signal}={}) {
  const task=transitionRiskTask(evidenceRecord);
  const result=await caller(model,task.prompt,task.schema,{context,predict,signal});
  return {...result,test_only:caller!==scoutLocalCall};
}
export function transitionRiskTask(evidenceRecord) {
  if(!Array.isArray(evidenceRecord?.broker_sentences)||!evidenceRecord.broker_sentences.length)throw Object.assign(Error('Risk generation requires source evidence.'),{code:'NO_SOURCE_EVIDENCE'});
  const selected=evidenceRecord.broker_sentences.find(e=>typeof e?.id==='string'&&e.id===evidenceRecord.selected_dependency_evidence_id);
  if(typeof selected?.quote!=='string'||!selected.quote.trim())throw Object.assign(Error('Risk generation requires a selected sentence from this source packet.'),{code:'NO_SELECTED_EVIDENCE'});
  return {
    component:'one_transition_risk', revision:'conditional-v3', input:evidenceRecord,
    prompt:'First decide whether the supplied evidence supports a specific ownership-transition concern. If not, return {"risk":null}. Otherwise write one concrete conditional risk sentence grounded in the stated facts; do not strengthen them or invent financial estimates. Unproven transfer is unknown, not failure. Return JSON with risk as a string or null.\n'+JSON.stringify(evidenceRecord),
    schema:{type:'object',additionalProperties:false,required:['risk'],properties:{risk:{anyOf:[{type:'string',minLength:30,maxLength:500},{type:'null'}]}}}
  };
}
export function dependencyEvidenceTask(question, brokerSentences) {
  const input = {question, evidence: brokerSentences};
  return {
    component: 'dependency_evidence', revision: 'select-v2', input,
    prompt: 'Read these source sentences. Select the evidence_id that directly answers the question. Select only an explicit statement, not a related topic or implication. If none answers it, return null. Return only JSON with the single key evidence_id.\n' + JSON.stringify(input),
    schema: {type:'object', additionalProperties:false, required:['evidence_id'], properties:{evidence_id:{anyOf:[{type:'string',enum:brokerSentences.map(e=>e.id)},{type:'null'}]}}}
  };
}
export function thesisMatchTask(investorIdea, brokerSentences, {specific = false, compact = false, decision = false, structured = true, sourceContext} = {}) {
  const input = {investor_idea: investorIdea, broker_sentences: brokerSentences};
  if(sourceContext)input.source_context=structuredClone(sourceContext);
  if (structured) return {
    component: 'exact_thesis_match', revision: 'match-flag-v7', input,
    prompt: 'Does the broker’s description support this investor request? Set supported to true only when the described features match the request, otherwise false. Explain the match or evidence gap in one concrete sentence. Preserve the investor’s exact requirements; do not add or change them. Unstated features are unknown. Return JSON with boolean supported and string assessment.\n' + JSON.stringify(input),
    schema: {type:'object', additionalProperties:false, required:['supported','assessment'], properties:{supported:{type:'boolean'},assessment:{type:'string',minLength:20,maxLength:500}}}
  };
  return {
    component: 'exact_thesis_match',
    revision: decision ? 'compact-decision-v5' : compact ? 'compact-v4' : specific ? 'neutral-specific-v3' : 'neutral-v1',
    input,
    prompt: (decision ? 'Does the broker’s description support this investor request? Explicitly state whether supported, then give one concrete reason in one sentence. Treat unstated features as unknown. Return JSON with one string field assessment.\n' : compact ? 'Does the broker’s description support this investor request? Give one concrete sentence explaining the match or missing evidence. Treat unstated features as unknown. Return JSON with one string field assessment.\n' : 'Compare the investor’s EXACT request with the broker’s actual description. State whether the evidence supports that request. Do not replace the investor’s goals with different ones. If a required feature is absent from the evidence, fit is not established. Give a specific one-sentence assessment based only on these excerpts. ' + (specific ? 'Name the actual business activity and revenue mechanism when explaining support; merely restating the request or saying it fully aligns is insufficient. An unmentioned feature is NOT established, not proved absent from the actual business; state the evidence gap without asserting real-world absence. ' : '') + 'Return JSON with one string field assessment.\n') + JSON.stringify(input),
    schema: {type: 'object', additionalProperties: false, required: ['assessment'], properties: {assessment: {type: 'string', minLength: 20, maxLength: 500}}}
  };
}
