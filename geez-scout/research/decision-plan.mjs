// Authored research procedures, not model findings or evidence of target fit.
// A plan must name the asset's mechanism and the observation that changes a decision.
export function decisionPlan(packet,review=null){
 const t=packet.query.toLowerCase();
 const selected=packet.candidates.filter(c=>review?.candidate_ids?.includes(c.id));
 const names=selected.map(c=>c.name).join(', ')||'the admitted company references';
 if(/contact cent|call cent|answering|reception|customer support|\bbpo\b/.test(t)&&/\b(ai|cost|costs|automation|improve|savings)\b/.test(t))return {
  skill:'contact-center-economics',
  evidence_ids:selected.flatMap(c=>c.sources.map(s=>s.id)),
  summary:`${selected.length?names+' was proposed for research, not as a verified match.':'No verified target match is established.'} Compare every admitted reference below against your exact thesis. The snapshot notes describe different workflows and tools; they do not establish the requested operating location, unused automation upside or seller willingness. A local-company search was not executed.`,
  hypothesis:`For ${names}, incremental changes to the current human/tool routing or documentation workflow could reduce paid delivery cost per resolved contact without worsening quality. Existing automation must be in the baseline; this is untested.`,
  falsifier:{observation:'Compare a matched queue or staged pilot against its baseline: paid handling and wrap-up minutes per resolved contact, repeat contacts, escalation, quality scores, staffing coverage and total implementation/run cost.',reject_if:'Reject the proposed cash-cost case if quality deteriorates or paid staffing/vendor spend cannot be reduced or avoided after retained supervision, rework and AI costs. Time released with unchanged spend is capacity, not direct cash savings.'},
  next_steps:[
   'First resolve the operating-location requirement against a facility/address record and the acquisition entity. A broad service footprint does not satisfy a city requirement. Check owner willingness separately; no sale mandate is presumed.',
   'Request one comparable queue-period extract: contact volumes, handle/wrap-up time, paid agent hours, loaded delivery cost, existing automation and quality/repeat-contact measures. Identify one workflow such as post-call documentation; retain service-level and privacy controls.',
   'Before a pilot, agree the quality floor and materiality criterion with the user. Compare incremental paid cost per resolved contact, subtract retained review/rework, software and amortized implementation; document avoided hiring, vendor reduction or feasible staffing changes. Report capacity separately when no cash mechanism exists.'
  ],
  clarification:'Should the requested location mean a staffed operating facility, headquarters, or customers served?',
 };
 return null;
}

export function decisionPrompt(packet){
 const plan=decisionPlan(packet);return plan?`\nTASK-SPECIFIC EXECUTION SKILL (${plan.skill}):\n${JSON.stringify(plan)}\nThis is a proposed research procedure, not a finding. Preserve the exact user's geography and acquisition scope. Do not replace the user's operating-cost question with a search for sale listings. Never infer a company is outside a city from nonmention. A cautious generic answer fails. Explain the decision-changing test; do not assert it has been executed.\n`:'';
}
