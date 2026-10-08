// Telegram bot from app.py, opt-in. Bot token stays in environment variables.
import { businessFAQ, systemPrompt } from './nadia-business.mjs';
import { getSession, addMessage, resetSession } from './nadia-session.mjs';
const token=process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.log('[TG] Disabled (no TELEGRAM_BOT_TOKEN)'); process.exit(0); }
const endpoint='https://api.telegram.org/bot'+token+'/';
const origin=(process.env.WA_AI_BASE_URL||'http://127.0.0.1:17070/v1').replace(/\/$/,'');
const key=process.env.WA_AI_API_KEY||'';
const requestHeaders={'content-type':'application/json',...(key?{Authorization:'Bearer '+key}:{})};
let offset=0;
let modelIds=[],modelsAt=0;
const modes=new Map(), selections=new Map(),lastUser=new Map();
async function telegram(method,body) {
 const c=new AbortController(),t=setTimeout(()=>c.abort(),30000);
 try {const r=await fetch(endpoint+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:c.signal});const j=await r.json();if(!j.ok)throw Error('Telegram '+r.status+': '+j.description);return j.result;}
 finally {clearTimeout(t);}
}
async function send(id,text){ const chunks=String(text).match(/[\s\S]{1,3800}/g)||[''];for(const chunk of chunks)await telegram('sendMessage',{chat_id:id,text:chunk});}
async function catalog(){
 if(Date.now()<modelsAt)return modelIds;
 const c=new AbortController(),t=setTimeout(()=>c.abort(),6500);
 try {const r=await fetch(origin+'/models',{headers:requestHeaders,signal:c.signal});if(!r.ok)throw Error('models '+r.status);const j=await r.json();modelIds=(j.data||[]).map(x=>x.id).filter(x=>typeof x==='string');modelsAt=Date.now()+600000;}catch(e){console.warn('[TG] catalog:',e.message);modelsAt=Date.now()+60000;}finally{clearTimeout(t);}
 return modelIds;
}
async function ai(id,prompt){
 const models=await catalog();
 const model=selections.get(id)||models[0];
 if(!model)return 'AI belum siap, silakan hubungi admin.';
 const history=getSession('tg:'+id).history;
 const mode=modes.get(id)||'standard';
 const prefix=mode==='hermes'?'Jawab sebagai asisten riset dan teknis yang terstruktur dan hati-hati. ':'';
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),25000);
 try {
 const r=await fetch(origin+'/chat/completions',{method:'POST',headers:requestHeaders,body:JSON.stringify({model,stream:false,max_tokens:450,messages:[{role:'system',content:prefix+systemPrompt},...history.slice(-6),{role:'user',content:prompt}]}),signal:c.signal});
 if(r.status===429)return 'Sedang terlalu banyak permintaan. Coba beberapa menit lagi.';
 if(!r.ok)throw Error('AI '+r.status);
 const j=await r.json(),reply=String(j.choices?.[0]?.message?.content||'').slice(0,3500)||'Belum ada respons.';
 addMessage('tg:'+id,'user',prompt);addMessage('tg:'+id,'assistant',reply);return reply;
 }catch(e){console.warn('[TG] AI:',e.message);return 'AI sedang tidak tersedia. Silakan hubungi admin.';}finally{clearTimeout(timer);}
}
async function handle(msg){
 const id=msg.chat?.id,txt=msg.text?.trim();
 if(!id||!txt)return;
 const cmd=txt.split(' ')[0].split('@')[0].toLowerCase(),arg=txt.slice(txt.indexOf(' ')+1).trim();
 if(cmd==='/start'||cmd==='/help')return send(id,'Halo, saya Nadia. Layanan: Gas Refill, Noura Studio, Bit & Bean.\nPerintah: /qris, /rekening, /wa, /9router, /models, /model ID, /mode standard|hermes, /hermes pertanyaan, /reset, /ping');
 if(cmd==='/ping')return send(id,'Bot Telegram aktif.');
 if(cmd==='/wa'||cmd==='/whatsapp')return send(id,'WhatsApp Nadia menggunakan koneksi privat di container. Status pairing tidak diumumkan melalui Telegram demi keamanan.');
 if(cmd==='/qris'){
   const image=process.env.WA_QRIS_IMAGE_URL||'https://raw.githubusercontent.com/NourAnisa/bansos-router-snapdeploy/main/qris_bit_bean.png';
   try {return await telegram('sendPhoto',{chat_id:id,photo:image,caption:'QRIS Bit & Bean. Pembayaran diverifikasi manual oleh admin.'});}
   catch(e){return send(id,'Gambar QRIS dapat dilihat: '+image);}
 }
 if(cmd==='/rekening')return send(id,'Untuk keamanan, konfirmasi rekening tujuan pembayaran terbaru kepada admin sebelum transfer.');
 if(cmd==='/9router')return send(id,process.env.NINEROUTER_BASE_URL?'Gateway 9Router dikonfigurasi (belum diverifikasi sehat): '+process.env.NINEROUTER_BASE_URL:'Gateway 9Router belum dikonfigurasi di SnapDeploy.');
 if(cmd==='/models')return send(id,(await catalog()).slice(0,40).join('\n')||'Belum ada model.');
 if(cmd==='/model'){
   if(!txt.includes(' '))return send(id,'Format: /model ID_MODEL');
   const idModel=arg;
   if(!(await catalog()).includes(idModel))return send(id,'Model tidak ditemukan di katalog.');
   selections.set(id,idModel);return send(id,'Model dipilih: '+idModel);
 }
 if(cmd==='/mode'){
   const mode=arg.toLowerCase();
   if(!['hermes','standard'].includes(mode))return send(id,'Gunakan /mode hermes atau /mode standard.');
   modes.set(id,mode);return send(id,'Mode: '+mode);
 }
 if(cmd==='/reset'){resetSession('tg:'+id);return send(id,'Riwayat chat dihapus dari memori sementara.');}
 const now=Date.now();if(now-(lastUser.get(id)||0)<10000)return;lastUser.set(id,now);
 const question=cmd==='/hermes'&&txt.includes(' ')?arg:txt;
 if(cmd==='/hermes'){modes.set(id,'hermes');return send(id,await ai(id,question));}
 const faq=businessFAQ(question,'tg:'+id);
 if(faq)return send(id,faq.reply);
 return send(id,await ai(id,question));
}
async function loop(){
 console.log('[TG] Polling started');
 while(true){
  try{
   const updates=await telegram('getUpdates',{offset,timeout:20,allowed_updates:['message'],limit:25});
   for(const u of updates){offset=Math.max(offset,u.update_id+1);try{await handle(u.message||{});}catch(e){console.warn('[TG] Update:',e.message);}}
  }catch(e){console.warn('[TG] Poll error:',e.message);await new Promise(r=>setTimeout(r,7000));}
 }
}
loop();
