// Validates the bounded JSON-schema subset used by local scouting after unconstrained thinking.
export function validateScoutJson(value,schema,path='$'){
 const fail=message=>{throw Error('Local answer '+path+': '+message);};
 if(schema.anyOf){for(const s of schema.anyOf){try{validateScoutJson(value,s,path);return value;}catch{}}fail('does not match an allowed value');}
 if(Object.hasOwn(schema,'const')&&JSON.stringify(value)!==JSON.stringify(schema.const))fail('changed a required reference');
 if(schema.enum&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))fail('uses an unavailable choice');
 if(schema.type==='null'){if(value!==null)fail('must be null');return value;}
 if(schema.type==='object'){if(!value||typeof value!=='object'||Array.isArray(value))fail('must be an object');for(const k of schema.required||[])if(!Object.hasOwn(value,k))fail('missing '+k);for(const [k,v] of Object.entries(value)){if(!Object.hasOwn(schema.properties||{},k)){if(schema.additionalProperties===false)fail('unexpected '+k);}else validateScoutJson(v,schema.properties[k],path+'.'+k);}}
 if(schema.type==='string'){if(typeof value!=='string'||value.includes('\0'))fail('must be text');if(value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity))fail('text length outside limits');}
 if(schema.type==='boolean'&&typeof value!=='boolean')fail('must be boolean');
 if(schema.type==='array'){if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))fail('array outside limits');if(schema.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)fail('duplicate selections');for(const [i,v] of value.entries())validateScoutJson(v,schema.items,path+'['+i+']');}
 return value;
}
