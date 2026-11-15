// Deterministic topic matching over reviewed source facts; never investment scoring.
export const THRESHOLD = 60;
export function rankPreliminary(pool, thesis) {
 const text=thesis.toLowerCase().trim();
 if(/\b(exclud(?:e|es|ed|ing)|avoid|not|without|no)\b/.test(text))return [];
 const contact=/\b(contact[ -]?cent(?:er|re)s?|call[ -]?cent(?:er|re)s?|answering|receptionists?|customer support|customer service|bpo)\b/.test(text);
 const language=/\b(translat(?:ion|ions|ing)|locali[sz]ation|interpreting|linguistic|language services)\b/.test(text);
 if(contact&&language&&!/\b(or|either)\b/.test(text))return [];
 const broad=/\b(ai|artificial intelligence|automati(?:on|ng))\b/.test(text)&&/\b(costs?|cogs|delivery|labor|labour|services?|workflow)\b/.test(text);
 const other=/\b(real estate|land|apartments?|restaurants?|solar|manufactur(?:ing|ers?)|mining|farms?)\b/.test(text);
 return pool.map(c=>{
  const isLanguage=/translation|localization/i.test(c.sector);
  const named=text.includes(c.name.toLowerCase());
  const sectorMatch=isLanguage?language:contact;
  const score=named?100:sectorMatch?85:!contact&&!language&&!other&&broad?60:0;
  const basis=named?'Company name explicitly matched':sectorMatch?'Requested sector matches sourced service category':score?'Broad AI delivery-cost research topic matches this reviewed service workflow':'No supported topic match in this limited pool';
  return {...c,topic_score:score,match_reason:basis};
 }).filter(c=>c.topic_score>=THRESHOLD).sort((a,b)=>b.topic_score-a.topic_score||b.assessed_at.localeCompare(a.assessed_at));
}
export function researchRequest(candidate, thesis) {
 const evidence=JSON.stringify({company:candidate.name,prior_assessment_at:candidate.assessed_at,sources:candidate.sources,known_gaps:candidate.missing_evidence,ownership:candidate.ownership_status,sale:candidate.sale_status});
 if(evidence.length>20000)throw new Error('Source packet exceeds the supported review size.');
 return {mode:'diligence',question:('Assess '+candidate.name+' against this thesis: '+thesis+'. Use only supplied source facts. Identify one residual task beyond existing tools; separate source facts, assumptions, unknowns and conflicting evidence. Test incremental net paid-cost benefit including retained work, recurring costs, staffing and pricing. Give specific records and a falsifier. Do not imply current sale availability, verified savings, live browsing or completed investment diligence.').slice(0,2000),evidence};
}
