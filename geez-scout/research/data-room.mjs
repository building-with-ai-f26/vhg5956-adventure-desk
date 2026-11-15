export const ROOMS=['seller_materials','buyer_diligence','post_close_operations'];
export const DOCUMENT_STATES=['not_supplied','received_unreviewed','reviewed','conflicting','unknown_applicability','not_applicable'];
const nonblank=s=>typeof s==='string'&&s.trim().length>0&&!s.includes('\0');
export function dataRoom(items=[]){
 if(!Array.isArray(items)||items.length>300)throw Error('A data room needs a bounded list of document requirements.');
 const seen=new Set();const rows=items.map(item=>{
  if(!item||!nonblank(item.id)||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id)||seen.has(item.id)||!ROOMS.includes(item.room)||!nonblank(item.title)||item.title.length>250||!DOCUMENT_STATES.includes(item.status)||typeof item.critical!=='boolean'||!Array.isArray(item.evidence_refs)||item.evidence_refs.some(r=>!nonblank(r)))throw Error('Invalid or duplicate data-room requirement.');
  seen.add(item.id);
  if(['received_unreviewed','reviewed','conflicting'].includes(item.status)&&!item.evidence_refs.length)throw Error('A received/reviewed/conflicting item needs an actual supplied evidence receipt.');
  if(item.status==='not_applicable'&&!nonblank(item.applicability_reason))throw Error('Not-applicable needs a recorded basis; silence is not an exemption.');
  return {id:item.id,room:item.room,title:item.title,status:item.status,critical:item.critical,evidence_refs:[...new Set(item.evidence_refs)],applicability_reason:item.applicability_reason||'',owner:item.owner||'Unassigned',review_note:item.review_note||'',planned_folder:item.room+'/'+item.id+'/'};
 });
 const applicable=rows.filter(r=>!['unknown_applicability','not_applicable'].includes(r.status)),received=applicable.filter(r=>['received_unreviewed','reviewed','conflicting'].includes(r.status));
 return {provisioned:false,document_contents_included:false,rooms:ROOMS,items:rows,progress:{known_applicable:applicable.length,received:received.length,received_fraction:applicable.length?received.length/applicable.length:null,unknown_applicability:rows.filter(r=>r.status==='unknown_applicability').length,critical_unresolved:rows.filter(r=>r.critical&&r.status!=='reviewed'&&r.status!=='not_applicable').map(r=>r.id)},transaction_gate:'not_assessed',notice:'Local document-request and review tracker only. Receipt is not validation, reviewed is a declared review state, and completeness never authorizes a deal or proves signing/closing readiness. No external VDR or document has been created.'};
}
function csv(value){let v=String(value??'');if(/^[\s]*[=+@-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
export function dataRoomFiles(room,context={}){
 const checked=dataRoom(room.items),header=['room','id','title','status','critical','review_note','owner','applicability_reason','evidence_refs','planned_folder'];
 const index=[header.map(csv).join(','),...checked.items.map(r=>header.map(k=>csv(k==='evidence_refs'?r[k].join(' | '):r[k])).join(','))].join('\r\n');
 const files={'data-room.json':JSON.stringify({context,...checked},null,2),'document-register.csv':index,'READ-ME.txt':checked.notice+'\n\nFolders in this plan represent requested materials, not received documents. Keep seller materials, buyer work product and post-close operations separate. Access control, professional review and external provisioning are separate tasks.\n'};
 for(const roomName of ROOMS){files[roomName+'/DOCUMENT-REQUESTS.csv']=[header.map(csv).join(','),...checked.items.filter(r=>r.room===roomName).map(r=>header.map(k=>csv(k==='evidence_refs'?r[k].join(' | '):r[k])).join(','))].join('\r\n');files[roomName+'/READ-ME.txt']='Planned '+roomName+' materials only. This folder contains requests, not original documents or proof of ownership/access. Preserve provenance and obtain authorization before adding sensitive materials.\n';}
 return files;
}
