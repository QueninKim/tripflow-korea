import {mixedData} from './mixed-core.js?v=web-11';
import {recommendAutoRoutes} from './auto-core.js?v=web-11';
export function runAutoJob(message){const {network,times,bus,query,requestId}=message;try{return {requestId,result:recommendAutoRoutes(mixedData(network,times,bus),query)};}catch(error){return {requestId,error:error.message};}}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.addEventListener('message',e=>self.postMessage(runAutoJob(e.data)));
