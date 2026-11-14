import {mixedData} from './mixed-core.js?v=web-17';
import {calculateTransitMovement} from './transit-refresh-core.js?v=web-17';
export function runTransitRefreshGroup(message,report){
  const {requestId,network,times,bus,movements}=message,data=mixedData(network,times,bus);
  for(const m of movements){let result;try{result={...calculateTransitMovement(data,m.from,m.to),index:m.index};}catch(error){result={id:m.to.id,from:m.from.id,index:m.index,error:error.message};}report({requestId,type:'result',result});}
  report({requestId,type:'done'});
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.addEventListener('message',e=>{try{runTransitRefreshGroup(e.data,message=>self.postMessage(message));}catch(error){self.postMessage({requestId:e.data.requestId,type:'error',error:error.message});}});
