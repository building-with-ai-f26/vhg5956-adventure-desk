import http from 'node:http';
// Local inference can spend minutes thinking before sending headers. Use one explicit deadline.
export function localJsonHttp(path,{body,signal,timeoutMs=3600000,origin='http://127.0.0.1:11434',maxBytes=5*1024**2}={}){
 const url=new URL(path,origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||!path.startsWith('/api/')||url.origin!==new URL(origin).origin)throw Error('Only the local model API is permitted');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>7200000)throw Error('Invalid local API deadline');signal?.throwIfAborted();
 const data=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{let finished=false,timer;const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
 const req=http.request(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(data)},signal},res=>{let size=0,chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){const limitError=Object.assign(Error('Local response exceeds the complete-response limit'),{code:'LOCAL_RESPONSE_LIMIT'});finish(limitError);req.destroy(limitError);return;}chunks.push(chunk);});res.on('error',error=>finish(error));res.on('aborted',()=>finish(Object.assign(Error('Local response ended before completion'),{code:'LOCAL_RESPONSE_ABORTED'})));res.on('end',()=>{if(finished)return;const raw=Buffer.concat(chunks).toString('utf8');if(res.statusCode<200||res.statusCode>=300){finish(Object.assign(Error('Local API HTTP '+res.statusCode),{code:'LOCAL_API_HTTP',status:res.statusCode,body:raw.slice(0,1000)}));return;}try{finish(null,JSON.parse(raw));}catch{finish(Object.assign(Error('Local API returned invalid JSON'),{code:'LOCAL_API_JSON'}));}});});
 req.on('error',error=>finish(error));timer=setTimeout(()=>req.destroy(Object.assign(Error('Local model request reached its explicit deadline'),{code:'LOCAL_API_TIMEOUT'})),timeoutMs);req.end(data);
 });
}
