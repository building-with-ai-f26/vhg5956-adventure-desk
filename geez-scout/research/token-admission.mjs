import {createHash} from 'node:crypto';
export class AdmissionError extends Error {constructor(code,message){super(message);this.code=code;}}
export function promptAdmission({model,prompt,count,context,output_reserve,template_sha256,tokenizer_sha256,checkpoint_digest,expected_digest}){
 if(typeof prompt!=='string'||!Number.isSafeInteger(context)||context<1||!Number.isSafeInteger(output_reserve)||output_reserve<1)throw new AdmissionError('invalid_budget','Invalid final prompt budget');
 if(checkpoint_digest!==expected_digest||!checkpoint_digest)throw new AdmissionError('identity_mismatch','Checkpoint identity mismatch');
 if(!count||count.model!==model||count.exact!==true||count.prompt_sha256!==createHash('sha256').update(prompt).digest('hex')||count.tokenizer_sha256!==tokenizer_sha256||count.template_sha256!==template_sha256||!/^[a-f0-9]{64}$/.test(tokenizer_sha256||'')||!/^[a-f0-9]{64}$/.test(template_sha256||'')||!Number.isSafeInteger(count.tokens)||count.tokens<1)throw new AdmissionError('tokenizer_unqualified','Exact final-prompt tokenization for this checkpoint/template is unavailable. No model loaded.');
 if(count.tokens+output_reserve>context)throw new AdmissionError('context_overflow','The complete evidence and output reserve exceed this checkpoint context. Input preserved; nothing was truncated or loaded.');
 return {model,prompt_sha256:count.prompt_sha256,prompt_tokens:count.tokens,context,output_reserve,tokenizer_sha256,template_sha256,checkpoint_digest,admitted:true};
}
