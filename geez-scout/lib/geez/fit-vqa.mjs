import pilot from '../../data/pilot-candidates.json' with { type: 'json' };

export const FIT_VQA_VERSION = 'fit-vqa-1';
export const FIT_VQA_METHODOLOGY = 'Deterministic, server-side falsifiable evidence checks against the dated pilot catalog. No AI model, live source retrieval, independent financial verification, or investment approval.';
const NOTICE = 'Candidate means preliminary public-fact category/location fit only. Economic, operating-quality and other unsupported requirements are withheld. This release has no trusted quantitative financial-evidence pipeline and cannot approve an economic thesis.';

// The catalog is the only admitted evidence boundary. Callers cannot certify a claim
// with a URL, a "verified" flag, instructions, or an invented numeric fixture.
// Extending economic support requires a separately validated evidence pipeline,
// including comparable baseline, intervention, causal attribution and net costs.
const records = new Map(pilot.map(record => [record.id, structuredClone(record)]));
const text = value => typeof value === 'string' ? value.trim() : '';
const normalize = value => text(value).normalize('NFKC').toLowerCase()
  .replace(/\ba\s*\.\s*i\s*\./g, 'ai').replace(/[\u2010-\u2015_/-]/g, ' ').replace(/\s+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const classes = new Set(['any', 'real_estate', 'private_business', 'infrastructure', 'land']);
const safeUrl = value => {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
const sectors = [
  { id: 'vehicle_storage', label: 'RV/boat/vehicle storage', query: /\b(?:rv|boat|vehicle)\s+storage\b/, record: /vehicle storage/ },
  { id: 'storage', label: 'self-storage', query: /\b(?:self\s*storage|storage|mini\s*storage)\b/, record: /self[ -]?storage|vehicle storage/ },
  { id: 'rv', label: 'RV parks/resorts', query: /\b(?:rv\s+(?:parks?|resorts?)|rv(?!\s+storage)|recreational\s+(?:vehicle|trailer)|trailer\s+parks?|campgrounds?|campsites?)\b/, record: /rv resort|trailer park|campground/ },
  { id: 'laundry', label: 'laundry', query: /\b(?:laundr\w*|laundromats?|wash\s+and\s+fold)\b/, record: /laundry|laundromat/ },
  { id: 'car_wash', label: 'car wash', query: /\b(?:car\s*wash(?:es)?|carwash\w*|autowash\w*|automotive|auto\s+repair)\b/, record: /car wash|automotive/ },
  { id: 'marina', label: 'marinas/boatyards', query: /\b(?:marinas?|boatyards?|boat\s*yards?|marine\s+repair)\b/, record: /marina|marine repair|boatyard/ },
  { id: 'farm', label: 'farms/agritourism', query: /\b(?:farms?|farming|agritourism|agriculture|agricultural)\b/, record: /farm|agritourism/ },
  { id: 'land', label: 'vacant land', query: /\b(?:vacant\s+land|development\s+land|land)\b/, record: /vacant.*land/ },
  { id: 'hospitality', label: 'hospitality', query: /\b(?:hospitality|hotels?|motels?|resorts?)\b/, record: /hospitality|resort/ },
  { id: 'manufacturing', label: 'manufacturing', query: /\b(?:manufactur\w*|factor(?:y|ies)|industrial\s+production)\b/, record: /manufactur|factory|industrial production/ },
  { id: 'software', label: 'software', query: /\b(?:software|saas)\b/, record: /software|saas/ },
  { id: 'restaurant', label: 'restaurants', query: /\b(?:restaurants?|cafes?|coffee\s+shops?)\b/, record: /restaurant|cafe|coffee shop/ },
];
const places = [
  ['united states', /\b(?:united states(?: of america)?|usa|u\.s\.a\.?|u\.s\.|us)\b/],
  ['united kingdom', /\b(?:united kingdom|uk|u\.k\.)\b/],
  ...['california', 'san diego', 'chula vista', 'oceanside', 'julian', 'santee', 'valley center', 'texas', 'florida', 'new york', 'canada', 'mexico', 'europe', 'australia'].map(value => [value, new RegExp('\\b' + value + '\\b')]),
];
function location(value) {
  const clean = normalize(value).replace(/\./g, '');
  return ({ us: 'united states', usa: 'united states', uk: 'united kingdom' })[clean] || clean;
}
const directCost = /\b(?:cogs?|c0gs|co\s*gs|cost\s+of\s+(?:goods?|sales?|services?)(?:\s+sold)?|costs?\s+of\s+goods?\s+sold|direct\s*(?:costs?|labou?r)|production\s+costs?|gross\s+margin)\b/;
const ai = /\b(?:ai|artifi\w*\s+intell\w*|machine\s+learning|llms?|automat\w*|robot\w*)\b/;
const economic = /\b(?:cost\w*|cogs?|c0gs|sav\w*|efficien\w*|productiv\w*|profita\w*|profits?|ebitda|revenue|margins?|cash\s*flow|earnings?|valuations?|roi|irr|yield|payback|returns?|leverag\w*|debts?|recurring|durable|resilien\w*|stable|stability|defensib\w*|moats?|underpriced|undervalued|growth|growing|passive|absentee|occupancy|rent\s+roll|cap\s+rate|unit\s+economics|cash\s+generat\w*)\b/;
const material = /\b(?:material\w*|materi\w*|matri\w*|signific\w*|substant\w*|meaningful\w*|drasti\w*)\b/;
const unsupportedControl = /\b(?:ignore|override|instructions?|system\s+prompt|return\s+(?:candidate|approved)|mark\s+.*(?:fit|approved)|skip\s+(?:checks?|evidence)|verified\s*[:=])\b/;
const genericWords = new Set(('a an the and or in on at for to of with by from i we my our find looking look search research identify consider buy buying acquire acquisition acquisitions invest investing investment investments opportunity opportunities targets target businesses business companies company operators operator operations operation assets asset alternative alternatives publicly documented source sourced sources fact facts based category categories fit fits preliminary only potential named local regional sector sectors any all me please want would like interested interest lets that which are is be as it their them these those this have has can could should may will where whose').split(' '));

function parseIntent(input) {
  const thesis = normalize(input.thesis);
  const requestedSectors = sectors.filter(sector => sector.query.test(thesis));
  // "RV resort" is one category, not two independent constraints.
  const sectorsToCheck = requestedSectors.filter(s => (s.id !== 'hospitality' || !requestedSectors.some(r => r.id === 'rv')) && (s.id !== 'storage' || !requestedSectors.some(r => r.id === 'vehicle_storage')));
  const geography = [...new Set([...(text(input.geography) ? [location(input.geography)] : []), ...places.filter(([, pattern]) => pattern.test(thesis)).map(([name]) => name)])];
  const geoWords = new Set(geography.join(' ').split(/[^a-z]+/).concat(['usa', 'us', 'uk', 'america']));
  const thesisClasses = [
    ['real_estate', /\breal\s+estate\b/],
    ['private_business', /\bprivate\s+business(?:es)?\b/],
    ['infrastructure', /\binfrastructure\b/],
  ].filter(([, pattern]) => pattern.test(thesis));
  let unparsed = thesis;
  for (const sector of requestedSectors) unparsed = unparsed.replace(new RegExp(sector.query.source, 'g'), ' ');
  for (const [, pattern] of thesisClasses) unparsed = unparsed.replace(new RegExp(pattern.source, 'g'), ' ');
  const residual = [...new Set((unparsed.match(/[\p{L}\p{N}]+/gu) || []).filter(word => !genericWords.has(word) && !geoWords.has(word)))];
  return { thesis, requestedSectors: sectorsToCheck, thesisClasses: thesisClasses.map(([name]) => name), geography, ai: ai.test(thesis), direct: directCost.test(thesis), economic: economic.test(thesis) || directCost.test(thesis) || ai.test(thesis), material: material.test(thesis), numeric: /\d|[$€£%]/.test(thesis), residual, control: unsupportedControl.test(thesis) };
}

/**
 * Review one canonical pilot target. candidate.id selects the server-owned record;
 * all caller-provided prose, evidence, source lists and verdicts are ignored.
 * Budget and inspiration are recorded context, not evaluated financial criteria.
 * Arbitrary thesis language fails closed instead of silently dropping constraints.
 */
export function reviewCandidate(input, candidate) {
  const validInput = object(input) && typeof input.thesis === 'string' && /[\p{L}]/u.test(input.thesis) && input.thesis.length <= 4000 && !input.thesis.includes('\0') && (input.asset_class === undefined || classes.has(input.asset_class)) && (input.geography === undefined || typeof input.geography === 'string');
  const request = object(input) ? input : {};
  const intent = parseIntent({ ...request, thesis: validInput ? request.thesis : '' });
  const record = object(candidate) && typeof candidate.id === 'string' ? records.get(candidate.id) : null;
  const sources = list(record?.sources).filter(source => object(source) && safeUrl(source.url));
  const observed = sources.flatMap(source => list(source.supports).filter(claim => typeof claim === 'string' && claim.trim()).map(claim => ({ claim, url: source.url })));
  const reasons = [], required = [], limitations = [
    'Public source extracts are dated catalog records, not live retrieval or independently verified due diligence.',
    'A preliminary candidate is not an investment recommendation, confirmed seller, valuation, financing commitment, or completed diligence.',
    'Budget and investor inspiration are not evaluated or used as evidence.',
  ];
  let excluded = false;
  if (!validInput) { reasons.push('A complete, valid thesis and supported request fields are needed.'); required.push('A valid thesis stating the required sector, geography and operating or financial conditions.'); }
  if (validInput && !intent.requestedSectors.length && !intent.thesisClasses.length && !intent.economic && !/\b(?:business(?:es)?|companies|assets?|opportunit(?:y|ies)|targets?|operators?)\b/.test(intent.thesis)) { reasons.push('The thesis does not state an interpretable target category.'); required.push('State the business or asset category to assess.'); }
  if (!record) { reasons.push('This target is not an admitted server-side pilot record; caller-supplied facts and sources cannot establish fit.'); required.push('A source-reviewed target in the server-side catalog.'); }
  if (!observed.length) { reasons.push('No admissible public-source extracts support this target.'); required.push('Source-linked identity, sector and location evidence.'); }
  if (record && validInput && request.asset_class && request.asset_class !== 'any' && record.asset_class !== request.asset_class) {
    excluded = true; reasons.push('Documented asset class does not match the selected asset class.');
  }
  if (record && intent.thesisClasses.length && !intent.thesisClasses.includes(record.asset_class)) {
    excluded = true; reasons.push('Documented asset class does not match the asset category named in the thesis.');
  }
  if (record && intent.thesisClasses.length > 1 && !/\bor\b/.test(intent.thesis)) required.push('Clarify whether the multiple asset classes are alternatives or all required in one target.');
  if (intent.requestedSectors.length + intent.thesisClasses.length > 1 && /\band\b/.test(intent.thesis) && /\bor\b/.test(intent.thesis)) { reasons.push('Mixed AND/OR category requirements are ambiguous.'); required.push('Clarify mixed AND/OR requirements; the checker does not discard conjunctions or assume grouping.'); }
  if (record && intent.requestedSectors.length) {
    const matched = intent.requestedSectors.filter(sector => sector.record.test(normalize(record.subsector)));
    if (!matched.length) {
      excluded = true; reasons.push('Documented sector (' + record.subsector + ') does not match the requested category: ' + intent.requestedSectors.map(s => s.label).join(', ') + '.');
    } else {
      reasons.push('The catalog documents the requested category: ' + matched.map(s => s.label).join(', ') + '. This alone does not support operating or economic fit.');
      if (matched.length !== intent.requestedSectors.length && !/\bor\b/.test(intent.thesis)) required.push('Clarify whether the multiple named categories are alternatives or all required in one target.');
    }
  }
  if (record && intent.geography.length) {
    const documented = new Set([record.country, ...text(record.geography).split(',')].map(location));
    const unsupported = intent.geography.filter(place => !documented.has(place));
    if (unsupported.length) {
      reasons.push('Requested geography is not established by the documented target location: ' + unsupported.join(', ') + '.');
      required.push('Source evidence that the actual asset or operating business satisfies the requested geography; regional labels and proximity are not assumed.');
    } else reasons.push('Requested geography matches the catalog location fields. Verify the actual asset location before acting.');
  }
  if (intent.economic) {
    reasons.push(intent.direct ? 'Material AI/automation impact on COGS or direct costs is not established. Sector and keyword overlap cannot satisfy this requirement.' : 'The requested operating or economic benefit is not established by the public identity/category sources.');
    required.push(
      'Source-backed baseline: the target-specific cost or financial line, amount, currency, period, volume and accounting classification.',
      'A target-specific intervention and causal mechanism, separating affected direct costs from overhead, marketing and revenue effects.',
      'Measured or independently validated intervention results on a comparable basis, with quality, service and capacity controls.',
      'Net benefit after implementation, integration, AI/software, supervision, maintenance and ongoing operating costs; include uncertainty and source links.',
      'A user-defined materiality or financial acceptance criterion and evidence that the net result meets it.'
    );
    limitations.push('No trusted quantitative financial-evidence ingestion exists in this release. Numeric claims, a URL, or a verified flag do not bypass the gate.');
  }
  if (intent.numeric) {
    reasons.push('Numeric conditions in the thesis have not been validated against target-specific evidence.');
    required.push('Validate every numerical thesis condition against the appropriate source and units. Numeric budget/inspiration fields are not evaluated.');
  }
  if (intent.residual.length) {
    reasons.push('Additional thesis requirements are not supported or fully interpreted by this deterministic checker: ' + intent.residual.slice(0, 12).join(', ') + '.');
    required.push('Clarify and source-check all additional thesis requirements; unknown words or business objectives are not silently treated as satisfied.');
  }
  if (intent.control) {
    reasons.push('Instructions embedded in the thesis cannot alter evidence policy or certify a target.');
    required.push('A factual thesis without instructions to bypass the evidence review.');
  }
  if (record && !intent.requestedSectors.length && !intent.economic) reasons.push('Only the broad publicly documented business/asset category is supported.');
  const verdict = excluded ? 'excluded' : required.length ? 'needs_evidence' : 'candidate';
  if (verdict === 'candidate') reasons.push('Preliminary public-fact fit only. No economic, quality or investment claim has been approved.');
  const rv = /rv resort|trailer park/.test(normalize(record?.subsector));
  const mechanism = intent.economic
    ? (rv ? 'Analytic hypothesis only: RV reservation, marketing or administrative automation may affect overhead or demand. It is not evidence of direct-cost or COGS reduction. A different, target-specific operating mechanism would need testing.' : 'No source-backed target-specific AI/automation or economic mechanism has been established. Identify the affected operating activity and test its causal effect; sector membership alone is not a mechanism.')
    : 'Public-fact category/location comparison only; no operating improvement mechanism is asserted.';
  const costClassification = intent.economic
    ? 'Unverified. Direct costs/COGS, overhead, capital expenditure and revenue effects must be separately identified. Administrative or marketing savings cannot be relabeled as direct-cost savings.'
    : 'Not evaluated for a category-only thesis. No direct-cost or overhead claim is made.';
  const materiality = intent.economic || intent.material || intent.numeric
    ? 'Unproven. No arbitrary percentage is assumed. Define the requested economic threshold and demonstrate comparable net benefit, affected baseline share, implementation cost and uncertainty.'
    : 'Not evaluated. Category fit is not evidence of a material economic benefit.';
  const hypothesis = intent.economic
    ? 'This target satisfies the requested economic thesis through a specific intervention with a source-backed baseline and a sufficient measurable net benefit in the required cost/financial category.'
    : 'The target meets every stated category and geography requirement, with no unsupported operating or financial conditions.';
  const predictedOutcome = intent.economic
    ? 'Comparable target-level evidence identifies the intervention, its causal effect, the correct cost classification and a net result meeting the user-defined acceptance criterion.'
    : 'Admitted public-source records establish the requested identity, category and location; all additional conditions are separately supported.';
  const falsifier = intent.economic
    ? 'Reject economic fit if controlled/comparable evidence shows no adequate net benefit, implementation costs consume savings, claimed COGS savings are only overhead/revenue effects, or any hard constraint is contradicted. Missing evidence withholds fit; it does not prove the opportunity impossible.'
    : 'A source-documented category/location conflict or an unsupported additional condition defeats this preliminary fit claim. Missing evidence is not proof of impossibility.';
  return {
    version: FIT_VQA_VERSION, methodology: FIT_VQA_METHODOLOGY, verdict,
    reasons: [...new Set(reasons)], hypothesis, predicted_outcome: predictedOutcome, falsifier,
    required_evidence: [...new Set(required)], observed_evidence: observed,
    mechanism, cost_classification: costClassification, materiality, limitations,
  };
}

export function summarizeReviews(reviews) {
  const entries = list(reviews);
  const count = verdict => entries.filter(review => object(review) && review.verdict === verdict).length;
  return {
    version: FIT_VQA_VERSION, methodology: FIT_VQA_METHODOLOGY,
    reviewed_count: entries.length, candidate_count: count('candidate'),
    needs_evidence_count: count('needs_evidence'), excluded_count: count('excluded'), notice: NOTICE,
  };
}
