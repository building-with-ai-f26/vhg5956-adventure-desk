// Reconstructed from the user's four-page PDF, not the unavailable 174-file ZIP.
import {libraryInstruction} from './library.mjs';
export const SKILL_VERSION='geez-pdf-reconstruction-1';
const spec=[
 ['thesis','Preserve the thesis','foundation','Record user-stated constraints verbatim. Separate preference, hard condition and unknown; do not infer arbitrary cutoffs. Ask at most one useful optional clarification.'],
 ['access','Verify source access','foundation','Record adapter, entitlement, query, result count, retrieval time, error and hash. Knowing a provider exists is not access. Never claim a live search without a successful recorded retrieval.'],
 ['identity','Resolve entities and properties','foundation','Use entity IDs, canonical URLs and parcel/address identity. Never merge a property with its manager or a subsidiary with its parent without evidence. Preserve all provenance.'],
 ['evidence','Ground each claim','foundation','Distinguish sourced fact, user claim, inference, hypothesis, unknown, conflict and refuted. Require target, passage, date, scope, period, units and currency as relevant. Nonmention is unknown.'],
 ['ranking','Rank under uncertainty','foundation','Separate research relevance from verified fit and transaction readiness. Expose unmet constraints; do not pad results or use agreement as verification. No financial suitability score from sector keywords.'],
 ['economics','Test target economics','foundation','Identify paid task, cost classification, baseline, existing automation, addressable share, retained work, implementation/run costs and rework. Distinguish theoretical time savings from realizable cash. No invented percentages.'],
 ['diligence','Plan discriminating diligence','foundation','Prioritize records that could change the decision. Missing records are unknown. A falsifier states an observable contrary result, not a success condition or request for data.'],
 ['investor-history','Study investor history','foundation','Use dated deal facts known at the decision date. Separate observed approach from inferred philosophy. Do not impersonate an investor or invent purchases or motivations.'],
 ['adversarial-qa','Challenge the answer','foundation','Check relevance, accuracy, evidence, unknowns/conflicts, ranking and decision usefulness. Test injection, stale data, irrelevant citations, lost constraints and causal mistakes. Critical unsupported facts block fit.'],
 ['business-router','Route business acquisitions','business','Distinguish acquisition approach from asset class. Establish entity, scope and ownership; PE/search fund is not a property type. Seller willingness is separate from operational fit.'],
 ['pe','PE platforms and add-ons','business','Assess strategic scope, standalone economics, integration, customer overlap and incremental synergies. Do not count speculative cross-selling or savings as measured results.'],
 ['search-fund','Search-fund acquisition','business','Review owner dependence, operator transition, acquisition financing, working capital and concentration. Practitioner studies are context, not universal mandatory EBITDA or size thresholds.'],
 ['small-business','Small-business acquisition','business','Review owner labor normalization, transferability, licenses, leases, tax returns, working capital and local competition. Financing rules are not valuation rules.'],
 ['healthcare','Healthcare services','business','Review licensure, reimbursement, payer mix, clinician retention, compliance and exclusion records. CMS/OIG data enrich identity and compliance; they do not establish a sale mandate.'],
 ['software','Software and SaaS','business','Review retention/cohorts, recurring-revenue definitions, concentration, security, IP ownership, hosting and support costs. ARR is not cash flow; distinguish services from subscriptions.'],
 ['industrial-business','Industrial and environmental businesses','business','Review plant/process, maintenance capex, environmental liabilities, permits, safety, utilization and customer concentration. Automation needs quality and throughput controls.'],
 ['government-contracting','Government contracting','business','Review award versus obligation, backlog, recompetes, termination rights, set-aside eligibility and change-of-control restrictions. USAspending/SAM records are enrichment, not businesses for sale.'],
 ['residential','One-to-four-unit residential','property','Verify legal dwelling count, address/title, rents/comparables, occupancy, condition, insurance and local rental rules. Financing conventions are not universal legal classification.'],
 ['multifamily','Larger multifamily','property','Review unit-level rent roll, collections, turnover, concessions, repairs, reserves and physical condition. Separate investor NOI from lender NCF and DSCR.'],
 ['office','Office property','property','Review leases, expirations, options, tenant credit, recoveries, vacancy, TI/LC, capex and obsolescence. Asking rent is not collected effective rent.'],
 ['retail','Retail property','property','Review tenant sales/credit, co-tenancy, exclusives, lease rollover, percentage rent and recoveries; separate tenant business performance from property ownership.'],
 ['industrial-property','Industrial and logistics property','property','Review clear height, loading, power, access, zoning, environmental condition, tenant lease, capex and comparable use. Logistics demand is not a parcel valuation.'],
 ['hospitality','Hospitality property','property','Review occupancy, ADR, RevPAR, seasonality, franchise/management agreements, labor, renovation/PIP and capex. Revenue-management hypotheses need comparable net results.'],
 ['self-storage','Self-storage','property','Review unit inventory, economic versus physical occupancy, concessions, tenant churn, nearby supply, operating costs, security and capex; verify property versus operating-company scope.'],
 ['mixed-use','Mixed-use property','property','Separate residential and commercial lease/expense/area allocation, use permissions, fire/life safety, access and comparables. Do not blend unsupported income or classification.'],
 ['land','Land and development','property','Review parcel/title, legal access, zoning/entitlements, utilities, flood/environmental conditions, construction budget and absorption. Regional infrastructure is not parcel-specific benefit.'],
];
export const skills=spec.map(([id,title,layer,instructions])=>({id,title,layer,instructions,version:SKILL_VERSION,provenance:'Reconstructed from PDF description; original repository not supplied'}));
export function routeSkills(text=''){
 const t=text.normalize('NFKC').toLowerCase();
 const property=/\b(real estate|apartments?|multi[ -]?family|duplex|triplex|fourplex|condo|mixed[ -]?use|rent roll|office building|retail property|warehouse|self[ -]?storage|hotel|land|parcel)\b/.test(t);
 const operating=/\b(business(?:es)?|compan(?:y|ies)|saas|contact cent(?:er|re)|translation|healthcare|government contract|private equity|search fund)\b/.test(t);
 let workflow=property&&operating?'mixed_or_ambiguous':property?'property':operating?'business':'open';
 if(/property management (?:firm|company|business)/.test(t))workflow='business';
 const ids=new Set(['thesis','access','identity','evidence','ranking','economics','diligence','adversarial-qa']);
 if(/\b(buffett|munger|investor|historical|strategy|philosophy)\b/.test(t))ids.add('investor-history');
 if(workflow==='business'||workflow==='mixed_or_ambiguous'){
  ids.add('business-router');ids.add(/search fund/.test(t)?'search-fund':/private equity|\bpe\b|add[ -]?on|platform/.test(t)?'pe':'small-business');
  for(const [id,re] of [['healthcare',/health|clinic|medical|dental/],['software',/software|saas/],['industrial-business',/manufactur|environmental|industrial business/],['government-contracting',/government|federal|defen[cs]e|contractor/]])if(re.test(t))ids.add(id);
 }
 if(property){
  for(const [id,re] of [['residential',/duplex|triplex|fourplex|condo|single.family|[1-4][ -]?(?:unit|dwelling)/],['multifamily',/multi.family|apartment/],['office',/office/],['retail',/retail/],['industrial-property',/warehouse|logistics|industrial property/],['hospitality',/hotel|hospitality|motel/],['self-storage',/storage/],['mixed-use',/mixed.use/],['land',/land|parcel|development/]])if(re.test(t))ids.add(id);
 }
 return {workflow,skills:skills.filter(s=>ids.has(s.id))};
}
export function skillPrompt(routed){
 const lines=routed.skills.map(s=>{const full=libraryInstruction(s.id);const budget=s.id==='economics'?850:s.layer==='foundation'?170:650;return `${s.title}: ${s.instructions}`+(full?`\nReviewed replacement-library module ${full.folder}: ${full.guidance.slice(0,budget)}`:'');});
 if(routed.workflow==='property'&&!routed.skills.some(s=>s.id==='residential')){const base=libraryInstruction('commercial-base');if(base)lines.push('Conditional commercial-property lens; do not assume legal or financing classification: '+base.guidance.slice(0,350));}
 return lines.join('\n');
}
