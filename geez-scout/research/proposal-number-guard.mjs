// Literal origin checks in two high-risk proposal fields, not entailment or arithmetic verification.
// Qualitative estimates, verbal quantities and guesses elsewhere still require semantic review.
const normalized=s=>String(s??'').normalize('NFKC');
const money=()=>/\b(USD|EUR|GBP|CAD|AUD|NZD|JPY|CNY|CHF|INR|SGD|HKD|MXN|BRL|AED|SAR|ZAR|SEK|NOK|DKK|KRW|PLN)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|k|m|bn)\b)?|([$€£¥₹])\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|k|m|bn)\b)?/gi;
const scale={thousand:1e3,k:1e3,million:1e6,m:1e6,billion:1e9,bn:1e9};
function amounts(s){return [...normalized(s).matchAll(money())].map(m=>{const currency=(m[1]||m[4]).toUpperCase(),n=Number((m[2]||m[5]).replaceAll(',',''))*(scale[(m[3]||m[6]||'').toLowerCase()]||1);return currency+':'+n;});}
const percentages=s=>[...normalized(s).matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1]));
export function checkProposalNumbers(value,packet){
 // Only current admitted request/material passages count. Library examples are not deal inputs.
 const input=(packet.ledger||[]).map(s=>s.passage||'').join('\n'),admittedMoney=new Set(amounts(input)),admittedPercent=new Set(percentages(input));
 for(const [i,initiative] of (value.initiatives||[]).entries()){
  for(const amount of amounts(initiative.costs))if(!admittedMoney.has(amount))throw Error('Unsupported proposed cost in initiatives['+i+'].costs. Use supplied currency/units or name cost drivers with amount unknown; no new monetary estimate.');
  for(const percent of percentages(initiative.stop_test)){
   // Zero incremental net contribution is a mathematical break-even relation, not an investor return target.
   const zeroBound=percent===0&&/\b(?:incremental|net)\b/i.test(initiative.stop_test)&&/\b(?:contribution|benefit|cash)\b/i.test(initiative.stop_test)&&!/\b(?:IRR|yield|required return|target return)\b/i.test(initiative.stop_test);
   if(!admittedPercent.has(percent)&&!zeroBound)throw Error('Unsupported percentage cutoff in initiatives['+i+'].stop_test. Use a directional economic test; no new numerical investment threshold.');
  }
 }
 return value;
}
