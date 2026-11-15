import {verifySubmission,crossAssignments,recordPeerGrade} from './peer-vqa.mjs';
const strings=v=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
export function combinePeerWork(submissions,reviews,packet){
 if(!Array.isArray(reviews)||reviews.length!==2||new Set(reviews.map(r=>r.submission_hash)).size!==2)throw Error('Two current opposite-checkpoint reviews are required before combining');
 const assignments=crossAssignments(submissions),findings=[],conditional=[],disagreements=[],withheld=[],sections=[];
 for(const assignment of assignments){
  const raw=reviews.find(r=>r.submission_hash===assignment.submission_hash);
  if(!raw||raw.reviewer.digest!==assignment.reviewer.digest||raw.reviewer.model!==assignment.reviewer.model||raw.author.digest!==assignment.author.digest||raw.author.model!==assignment.author.model)throw Error('A review cannot approve its own author or another submission');
  const review=recordPeerGrade(assignment,raw.value,packet);verifySubmission(assignment.submission);
  if(review.value.verdict!=='fail'&&review.value.rubric.decision_usefulness.verdict==='pass')for(const section of assignment.submission.value.sections||[]){
   if(typeof section.heading!=='string'||typeof section.text!=='string')continue;
   // A disputed claim must not reappear through the broader reasoning section.
   const objections=review.value.claim_checks.filter(c=>c.status!=='supported'&&section.text.includes(c.claim));
   if(objections.length){withheld.push({author:assignment.author.model,reviewer:assignment.reviewer.model,submission_hash:assignment.submission_hash,heading:section.heading,reason:'Reasoning section contains a claim disputed by its peer'});continue;}
   sections.push({...section,author:assignment.author.model,reviewer:assignment.reviewer.model,submission_hash:assignment.submission_hash,conditional:review.value.verdict!=='pass',status:'peer_reviewed_reasoning_unverified'});
  }
  for(const claim of review.value.claim_checks){
   const lineage={author:assignment.author.model,reviewer:assignment.reviewer.model,submission_hash:assignment.submission_hash,source_id:claim.source_id};
   if(!strings(assignment.submission.value).some(s=>s.includes(claim.claim))){withheld.push({...lineage,claim:claim.claim,reason:'Peer wording was not in the sealed author work'});continue;}
   const source=packet.ledger.find(s=>s.id===claim.source_id),entry={...lineage,text:claim.claim,quote:claim.quote,enclosing_passage:source?.passage??null,peer_reason:claim.reason,status:'peer_supported_unverified_not_investment_approval'};
   if(claim.status!=='supported'){disagreements.push({...entry,peer_status:claim.status});continue;}
   if(review.value.verdict==='fail'){withheld.push({...entry,reason:'Author submission failed independent review'});continue;}
   (review.value.verdict==='pass'?findings:conditional).push(entry);
  }
 }
 const grouped=new Map();for(const f of findings){const key=JSON.stringify([f.text,f.source_id,f.quote,f.enclosing_passage]),contribution={author:f.author,reviewer:f.reviewer,submission_hash:f.submission_hash};if(grouped.has(key))grouped.get(key).contributions.push(contribution);else grouped.set(key,{...f,contributions:[contribution]});}
 const sectionGroups=new Map();for(const s of sections){const key=JSON.stringify([s.heading,s.text,s.conditional]),contribution={author:s.author,reviewer:s.reviewer,submission_hash:s.submission_hash};if(sectionGroups.has(key))sectionGroups.get(key).contributions.push(contribution);else sectionGroups.set(key,{...s,contributions:[contribution]});}
 return {schema:'geez-combined-peer-brief-v1',analysis_sections:[...sectionGroups.values()],findings:[...grouped.values()],conditional_findings:conditional,disagreements,withheld,next_tests:reviews.map(r=>({reviewer:r.reviewer.model,author:r.author.model,text:r.value.next_action})),independently_verified:false,notice:'Combined from two sealed first passes and opposite-model reviews. Findings remain unverified model interpretations; exact source occurrence and peer agreement do not establish factual truth. Failed work is not averaged into acceptance. No model independently approved its own contribution or this composite.'};
}
