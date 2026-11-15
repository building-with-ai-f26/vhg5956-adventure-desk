// Only repeats reads of an already accepted request. Never submits or retries inference.
export function startStatusPoll(read, {onValue,onRetry,onPause}, {delay=3000,maxFailures=3,schedule=setTimeout,cancel=clearTimeout}={}) {
 let stopped=false,timer,failures=0;
 async function tick(){
  if(stopped)return;
  try{const value=await read();if(stopped)return;failures=0;if(onValue(value)===false)return;timer=schedule(tick,delay);}
  catch(error){if(stopped)return;failures++;if(error?.retryable===false||failures>=maxFailures){onPause(error);return;}onRetry(failures);timer=schedule(tick,Math.min(30000,delay*2**failures));}
 }
 timer=schedule(tick,delay);return()=>{stopped=true;cancel(timer);};
}
