import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=new URL('../skill-library/skills/',import.meta.url);
export const LIBRARY_SHA256='b131bfd991316da2c5f7094a65119c1b554e5216c5827a6145a0ba39cf3d7476';
const mapping={thesis:'geez-thesis',access:'geez-source-access',identity:'geez-entity-resolution',evidence:'geez-evidence',ranking:'geez-screening',economics:'geez-economics',diligence:'geez-diligence','investor-history':'geez-investor-history','adversarial-qa':'geez-qa-vqa','business-router':'geez-business-acquisition',pe:'geez-pe-platform-addon','search-fund':'geez-search-fund','small-business':'geez-small-business',healthcare:'geez-healthcare',software:'geez-saas','industrial-business':'geez-business-services','government-contracting':'geez-business-services',residential:'geez-residential-investment',multifamily:'geez-multifamily',office:'geez-office',retail:'geez-retail','industrial-property':'geez-industrial-logistics',hospitality:'geez-hospitality','self-storage':'geez-self-storage','mixed-use':'geez-mixed-use',land:'geez-land-development'};
function section(text,heading){return text.split('## '+heading+'\n')[1]?.split('\n## ')[0]?.trim()||'';}
export function libraryInstruction(id){
 const folder=id==='commercial-base'?'geez-commercial-real-estate':mapping[id];if(!folder)return null;
 const file=new URL(folder+'/SKILL.md',base);if(!existsSync(file))return null;
 const text=readFileSync(file,'utf8'),steps=section(text,'Execution workflow').split('\n').filter(x=>/^\d+\./.test(x));
 // Preserve decision tests/cash-realization steps formerly lost after step two.
 return {folder,sha256:createHash('sha256').update(text).digest('hex'),guidance:steps.join(' ').slice(0,2400),checks:section(text,'Screening and diligence checks').slice(0,600),full_text:text};
}
export function libraryInventory(){return existsSync(base)?readdirSync(base).filter(n=>existsSync(new URL(n+'/SKILL.md',base))).map(folder=>({folder,bytes:Buffer.byteLength(readFileSync(new URL(folder+'/SKILL.md',base)))})):[];}
