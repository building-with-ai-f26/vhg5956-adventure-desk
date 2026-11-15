// A refused request may expand once only after verified cleanup, with exact input hashes retained.
export function contextExpansionPlan(receipt,{enabled=false,profile,pin,context,predict,maxContext=32768}){
 if(typeof enabled!=='boolean')throw Error('Context expansion needs an explicit boolean choice');
 if(!enabled)return null;
 if(!Number.isInteger(context)||context<1024||!Number.isInteger(predict)||predict<1||!Number.isInteger(maxContext)||maxContext<context||maxContext>32768)throw Error('Invalid closed context expansion limits');
 const r=receipt;
 if(!r||r.success!==false||r.returned_final_answer!==false||r.code!=='context_capacity'||r.model_request_attempted!==false||r.owned_processes_zero!==true||r.private_port_closed!==true||r.profile!==profile||r.checkpoint?.sha256!==pin.sha256||r.checkpoint?.revision!==pin.revision||r.context_capacity!==context||r.output_reserve!==predict)return null;
 if(!Number.isInteger(r.prompt_tokens_preflight)||r.prompt_tokens_preflight<1||![r.rendered_prompt_sha256,r.input_ids_sha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))return null;
 const required=r.prompt_tokens_preflight+predict,next=Math.ceil(required/256)*256;
 if(required<=context||next>maxContext)return null;
 return {context:next,expected_prompt_sha256:r.rendered_prompt_sha256,expected_input_ids_sha256:r.input_ids_sha256,prior:{profile:r.profile,context,predict,prompt_tokens:r.prompt_tokens_preflight,model_request_attempted:false,owned_processes_zero:true,private_port_closed:true,audit_path:r.audit_path,rendered_prompt_sha256:r.rendered_prompt_sha256,input_ids_sha256:r.input_ids_sha256}};
}
