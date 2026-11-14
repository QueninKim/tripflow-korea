let configuration;
export async function lookupRailAPI({from,to,date,signal}){
 if(configuration===undefined){try{const r=await fetch('./intercity-config.json?v=web-21');configuration=r.ok?(await r.json()).timetableEndpoint:null;}catch{configuration=null;}}
 if(!configuration)return null;const endpoint=new URL(configuration);if(endpoint.protocol!=='https:')throw Error('intercity-api');
 const abort=new AbortController(),relay=()=>abort.abort(),timer=setTimeout(()=>abort.abort(),20000);if(signal?.aborted)abort.abort();signal?.addEventListener('abort',relay,{once:true});try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'trains',from,to,date}),credentials:'omit',signal:abort.signal});if(!r.ok)throw Error('intercity-api');const body=await r.json();if(body.v!==1||!Array.isArray(body.services))throw Error('intercity-api');return body.services;}finally{clearTimeout(timer);signal?.removeEventListener('abort',relay);}
}
