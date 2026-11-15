import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isPublicCompanyAddress,publicCompanyUrl,publicCompanyPage,parseCompanySearch,parseCompanyDetail,companySearch} from '../research/public-company-sources.mjs';
import {parseScoutDetail,reportedBrokerFinancials} from '../research/scout-sources.mjs';
test('company passages preserve U.S. abbreviations instead of presenting broken fragments',()=>{
 const quote='WDS Trading is a U.S.-based wholesale distribution company focused on the electronics sector.';
 const c=parseCompanyDetail({html:'<title>Protocol fixture</title><main><p>'+quote+'</p></main>',url:'https://example.org',accessed_at:'2026-11-15',sha256:'fixture',bytes:150},{id:'company-fixture',title:'Protocol fixture'});
 assert.equal(c.evidence[0].quote,quote);
});
test('public-page reads reject local, reserved, credential and non-HTTPS destinations before connecting',async()=>{
 for(const url of ['http://example.org','https://127.1','https://2130706433','https://[::1]','https://localhost','https://foo.local','https://u:p@example.org','https://example.org:8443','https://example.org/file.pdf'])assert.throws(()=>publicCompanyUrl(url));
 for(const ip of ['127.0.0.1','10.1.2.3','172.20.0.1','192.168.0.1','169.254.169.254','100.64.1.2','198.18.0.1','203.0.113.1','::1'])assert.equal(isPublicCompanyAddress(ip),false);
 assert.equal(isPublicCompanyAddress('8.8.8.8'),true);
 await assert.rejects(publicCompanyPage('https://example.org',{resolveHost:async()=>[{address:'127.0.0.1',family:4}]}),/private|reserved/);
 await assert.rejects(publicCompanyPage('https://example.org',{resolveHost:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/private|reserved/);
});
test('search links are decoded/deduplicated and directories/challenges do not become evidence',()=>{
 const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fabout">Primary company page</a><a class="result__a" href="https://www.example.org/about">Duplicate primary site</a><a class="result__a" href="https://linkedin.com/company/control">Directory profile</a><a class="result__a" href="https://127.0.0.1">Private endpoint</a>';
 const rows=parseCompanySearch(html);assert.equal(rows.length,1);assert.equal(rows[0].url,'https://example.org/about');assert.equal(rows[0].kind,'company_prospect');assert.ok(!('evidence'in rows[0]));
 assert.throws(()=>parseCompanySearch('<form id="challenge-form">Human check</form>'),/human/);
});
test('a fetched company page supplies exact operating quotes, never guessed revenue or sale status',()=>{
 const html='<html><title>Parser-only control company</title><body><main><p>Our distribution business supplies electronic components to professional resellers and integrators.</p><p>Our 15-person operations team handles inventory and shipping from a 25000 square foot warehouse.</p><p>Estimated revenue is USD 4000000 according to an unnamed source.</p></main></body></html>';
 const capture={html,url:'https://example.org',sha256:'synthetic_parser_fixture_not_live',accessed_at:'fixture',bytes:html.length},c=parseCompanyDetail(capture,{id:'company-control',title:'Control',url:capture.url});
 assert.equal(c.status,'sale_status_unknown');assert.deepEqual(c.reported_financials,{revenue:null,mrr:null});assert.equal(c.evidence.length,2);assert.ok(c.evidence.some(e=>e.quote.includes('25000 square foot')));assert.ok(c.evidence.every(e=>!e.quote.includes('4000000')));assert.ok(c.evidence.every(e=>html.includes(e.quote)));assert.ok(c.unknowns.some(s=>s.includes('not known to be for sale')));
 assert.throws(()=>parseCompanyDetail({...capture,html:html.replace('Our distribution','Fictional company. Our distribution')},{id:'company-control',url:capture.url}),/Demonstration/);
});
test('public search refuses private contact/financial/raw-URL queries before network I/O',async()=>{
 let calls=0;for(const query of ['owner@example.org','https://example.org/private','company revenue $5000000','owner phone 212-555-0199'])await assert.rejects(companySearch(query,{fetcher:async()=>{calls++;}}));assert.equal(calls,0);
});
test('real captured broker gross revenue stays source-reported with unknown period; never becomes MRR',()=>{
 const html=readFileSync(new URL('./fixtures/northstar-technology-2026-11-14.html',import.meta.url),'utf8');const c=parseScoutDetail({html,accessed_at:'fixture',sha256:'real_html_parser_control',bytes:html.length},{id:'listing-control',title:'Technology',url:'https://listing.tworldnorthstar.com/technology-advisory-firm-recurring-revenue'});
 assert.equal(c.reported_financials.revenue.value_text,'$138,891');assert.equal(c.reported_financials.revenue.label,'Gross Revenue');assert.equal(c.reported_financials.revenue.period,'Not stated');assert.equal(c.reported_financials.mrr,null);assert.ok(c.operating_evidence.some(e=>e.quote.includes('Total: 0')));assert.ok(c.evidence.every(e=>!/[\d$%]/.test(e.quote)));
 assert.equal(reportedBrokerFinancials('<li>Gross Revenue: Not disclosed</li>').revenue,null);
 const annual=reportedBrokerFinancials('<li>Annual Revenue: $240000</li>');assert.equal(annual.revenue.period,'Annual; year not stated');assert.equal(annual.mrr,null);
});
