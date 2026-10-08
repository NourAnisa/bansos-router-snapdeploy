const sessions=new Map();
const TTL=45*60_000;
export function getSession(id){const s=sessions.get(id);if(!s||Date.now()-s.at>TTL){const n={history:[],at:Date.now()};sessions.set(id,n);return n;}s.at=Date.now();return s;}
export function addMessage(id,role,content){const s=getSession(id);s.history.push({role,content:String(content).slice(0,1200)});s.history=s.history.slice(-12);}
export function resetSession(id){sessions.delete(id);}
export function cleanResponse(s){return s.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();}
