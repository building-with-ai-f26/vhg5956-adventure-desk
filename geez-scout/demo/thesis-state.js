// State/handoff only: every thesis and criterion is authored by a local model or
// entered by the investor. This module does not invent investment strategy.
export function clearThesisProposal(state){state.pending=null;state.accepted=null;}
export function thesisConversationMessages(messages){
 return messages.map(m=>({role:m.role,content:m.content,...(m.role==='assistant'&&m.draft?{assistant_proposed_draft:m.draft}:{})}));
}
export function acceptThesisProposal(state){
 if(!state.pending?.draft)throw Error('Choose a completed thesis proposal first.');
 state.draft=state.pending.draft;
 state.accepted={draft:state.draft,originalNotes:state.notes,category:state.category};
 // Explicit acceptance folds prior notes into the self-contained AI brief.
 // Keeping superseded notes as active filters could reverse a user correction.
 // Original notes remain in the saved model job and this accepted-state receipt.
 state.notes='';
 state.pending=null;
}
export function thesisResearchRequest(state){
 const notes=state.notes||'';
 if(notes.length>10000)throw Error('The complete criteria and notes exceed the local request limit. Shorten the notes or edit the working thesis; nothing was discarded.');
 return {query:state.draft||'',notes,category:state.category||''};
}
