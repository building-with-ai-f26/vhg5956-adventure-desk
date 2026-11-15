import test from 'node:test';
import assert from 'node:assert/strict';
import {thesisConversationMessages,thesisResearchRequest} from '../demo/thesis-state.js';
import {thesisInput} from '../research/thesis.mjs';
test('refining receives the exact prior AI proposal without applying it as the investor working thesis',()=>{
 const state={draft:'Investor working thesis',notes:'Investor notes',category:'Search fund',messages:[{role:'user',content:'My interests remain open.'},{role:'assistant',content:'An optional follow-up.',draft:'The exact prior proposed brief.'},{role:'user',content:'Change its last line.'}]};
 const before=structuredClone(state),messages=thesisConversationMessages(state.messages);
 assert.deepEqual(state,before);assert.equal(thesisResearchRequest(state).query,before.draft);
 assert.equal(messages[1].role,'assistant');assert.equal(messages[1].assistant_proposed_draft,state.messages[1].draft);assert.equal(messages[1].content,state.messages[1].content);assert.equal(messages[2].content,'Change its last line.');
 assert.deepEqual(thesisInput({...state,messages}).messages,messages);
});
test('the full AI reply and separate proposal fit without raising message limits or admitting user-authored proposal metadata',()=>{
 const messages=thesisConversationMessages([{role:'assistant',content:'r'.repeat(700),draft:'d'.repeat(1600)}]);
 assert.equal(messages[0].assistant_proposed_draft,'d'.repeat(1600));assert.doesNotThrow(()=>thesisInput({messages}));
 assert.throws(()=>thesisInput({messages:[{role:'user',content:'u'.repeat(2001)}]}));
 assert.throws(()=>thesisInput({messages:[{role:'assistant',content:'a'.repeat(2001)}]}));
 assert.throws(()=>thesisInput({messages:[{role:'assistant',content:'A reply',assistant_proposed_draft:'d'.repeat(1601)}]}));
 assert.throws(()=>thesisInput({messages:[{role:'user',content:'My request',assistant_proposed_draft:'A user string is not assistant metadata.'}]}));
});
