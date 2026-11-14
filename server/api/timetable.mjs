import {createTimetableGateway} from '../timetable-gateway.mjs';
const handle=createTimetableGateway({key:process.env.TAGO_SERVICE_KEY,allowedOrigins:(process.env.TRIPFLOW_ALLOWED_ORIGINS||'https://queninkim.github.io').split(',').map(s=>s.trim())});
export async function POST(request){return handle(request);}
export async function OPTIONS(request){return handle(request);}
export default handle;
