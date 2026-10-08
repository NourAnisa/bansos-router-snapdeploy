import { getSession, addMessage, resetSession, cleanResponse } from './nadia-session.mjs';
import { businessFAQ, systemPrompt } from './nadia-business.mjs';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'node:fs/promises';

const enabled = process.env.WA_ENABLED === 'true';
if (!enabled) { console.log('[WA] Disabled. Set WA_ENABLED=true after configuring access.'); process.exit(0); }
const authDir = process.env.WA_AUTH_DIR || '/home/node/.wa_auth';
const baseURL = process.env.WA_AI_BASE_URL || 'http://127.0.0.1:17070/v1';
const apiURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
const apiKey = process.env.WA_AI_API_KEY || '';
const configuredModel = (process.env.WA_MODEL || 'auto').trim();
let modelCache = { ids: [], expires: 0 };
async function chooseModels() {
  if (configuredModel && configuredModel.toLowerCase() !== 'auto' && !configuredModel.startsWith('ID model')) return [configuredModel];
  if (Date.now() < modelCache.expires) return modelCache.ids;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let response;
    try { response = await fetch(apiURL + '/models', { headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {}, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error('Models HTTP ' + response.status);
    const data = await response.json();
    const ids = [...new Set((Array.isArray(data.data) ? data.data : []).map(m => m?.id).filter(id => typeof id === 'string' && id.length < 200))];
    modelCache = { ids, expires: Date.now() + (ids.length ? 10 * 60_000 : 60_000) };
    console.log('[WA] Auto model catalog:', ids.length, 'model IDs cached');
    return ids;
  } catch (error) {
    console.warn('[WA] Auto model lookup unavailable:', error.message);
    modelCache.expires = Date.now() + 60_000;
    return modelCache.ids;
  }
}
const localFAQ = new Map([
  ['halo', 'Halo! Ada yang bisa saya bantu?'],
  ['hai', 'Halo! Ada yang bisa saya bantu?'],
  ['menu', 'Silakan tulis pertanyaan atau produk yang ingin ditanyakan.']
]);
const logger = pino({ level: 'warn' });
const messageSeen = new Map();
const userLast = new Map();
let globalRequests = [];
let reconnectCount = 0;
let socket;
let reconnectTimer;
const minUserInterval = Math.max(3000, Number(process.env.WA_USER_COOLDOWN_MS || 15000));
const maxPerMinute = Math.min(60, Math.max(1, Number(process.env.WA_AI_MAX_PER_MINUTE || 30)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function cleanup(now) {
  for (const [id, when] of messageSeen) if (now - when > 10 * 60_000) messageSeen.delete(id);
  globalRequests = globalRequests.filter(t => now - t < 60_000);
  for (const [id, when] of userLast) if (now - when > 60 * 60_000) userLast.delete(id);
}
async function answerAI(text, jid) {
  const models = await chooseModels();
  if (!models.length) return 'Terima kasih. Saat ini layanan AI belum tersedia. Mohon tunggu admin.';
  for (let attempt = 0; attempt < Math.min(models.length, 2); attempt++) {
    const selectedModel = models[attempt];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      let response;
      try {
        response = await fetch(apiURL + '/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
          body: JSON.stringify({ model: selectedModel, stream: false, max_tokens: 250, messages: [
            { role: 'system', content: process.env.WA_SYSTEM_PROMPT || systemPrompt },
            ...getSession(jid).history.slice(-6),
            { role: 'user', content: text }
          ] }),
          signal: controller.signal
        });
      } finally { clearTimeout(timer); }
      if (response.ok) {
        const data = await response.json();
        const answer = cleanResponse(String(data.choices?.[0]?.message?.content || '')).slice(0, 3500);
        if (answer) return answer;
      }
      if (response.status === 429) {
        console.warn('[WA] Rate-limited by AI endpoint. No immediate retry.');
        break;
      }
      console.warn('[WA] Model failed:', selectedModel, 'HTTP', response.status);
    } catch (err) { console.warn('[WA] AI unavailable:', err.message); break; }
  }
  return 'Terima kasih. Saat ini asisten AI sedang sibuk. Silakan coba lagi nanti atau tunggu admin.';
}
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  socket = makeWASocket({ version, auth: state, logger, printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false });
  socket.ev.on('creds.update', saveCreds);
  const phone = String(process.env.WA_PHONE_NUMBER || '').replace(/[^0-9]/g, '');
  if (!state.creds.registered && phone) {
    setTimeout(async () => {
      try {
        const code = await socket.requestPairingCode(phone);
        console.log('[WA] Pairing code (do not share publicly):', code);
        console.log('[WA] On WhatsApp: Linked devices > Link with phone number instead.');
      } catch (err) { console.warn('[WA] Pairing failed:', err.message); }
    }, 3000);
  }
  socket.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) console.log('[WA] QR pairing baru tersedia. Untuk keamanan, tidak ditampilkan melalui endpoint publik. Gunakan alur pairing lokal atau panel privat.');
    if (connection === 'open') { reconnectCount = 0; console.log('[WA] WhatsApp connected'); }
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.error('[WA] Logged out. Re-pairing required; restore or remove stale auth data manually.');
        return;
      }
      reconnectCount++;
      const backoff = Math.min(300000, 5000 * Math.pow(2, Math.min(reconnectCount, 6)));
      console.warn('[WA] Connection closed; reconnecting with backoff (ms):', backoff);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(start, backoff);
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages || []) {
      try {
        const jid = msg.key?.remoteJid || '';
        if (!jid.endsWith('@s.whatsapp.net') || msg.key?.fromMe) continue;
        const id = jid + ':' + (msg.key?.id || '');
        const now = Date.now();
        cleanup(now);
        if (!msg.key?.id || messageSeen.has(id)) continue;
        messageSeen.set(id, now);
        const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
        if (!body) continue;
        const text = body.slice(0, 1500);
        if (/^\/(reset|hapus|mulaiulang)$/i.test(text)) {
          resetSession(jid);
          await socket.sendMessage(jid, {text:'Riwayat percakapan Nadia sudah direset, kak.'});
          continue;
        }
        if (/^(\/qris|qris|qr code|barcode pembayaran|bayar qris)$/i.test(text) || /(?:minta|kirim|lihat|mau|bayar).*qris/i.test(text)) {
          const qrURL = process.env.WA_QRIS_IMAGE_URL || 'https://raw.githubusercontent.com/NourAnisa/bansos-router-snapdeploy/main/qris_bit_bean.png';
          try {
            await socket.sendMessage(jid, {image:{url:qrURL}, caption:'QRIS Bit & Bean (NMID: ID1025428743757). Setelah membayar, kirim bukti agar admin dapat memverifikasi. Pembayaran tidak diverifikasi otomatis.'});
          } catch (err) {
            console.warn('[WA] QRIS image failed:',err.message);
            await socket.sendMessage(jid,{text:'QRIS Bit & Bean: '+qrURL+'\nSilakan konfirmasi pembayaran kepada admin.'});
          }
          continue;
        }
        if (/^\/rekening$|\b(rekening|norek|nomor rekening|transfer bank)\b/i.test(text)) {
          await socket.sendMessage(jid,{text:'Pembayaran transfer bank untuk tiga usaha perlu diverifikasi admin. Hubungi admin sebelum transfer untuk memastikan nomor rekening tujuan yang berlaku.'});
          continue;
        }
        const business = businessFAQ(text, jid);
        const faq = business?.reply || localFAQ.get(text.toLowerCase());
        let reply = faq;
        if (!reply) {
          if (now - (userLast.get(jid) || 0) < minUserInterval) continue;
          if (globalRequests.length >= maxPerMinute) {
            reply = 'Pesan sedang ramai. Silakan tunggu sebentar dan kirim kembali nanti.';
          } else {
            userLast.set(jid, now);
            globalRequests.push(now);
            reply = await answerAI(text, jid);
          }
        }
        if (reply) { addMessage(jid,'user',text); addMessage(jid,'assistant',reply); await socket.sendMessage(jid, { text: reply }); }
      } catch (err) { console.warn('[WA] Message handler error:', err.message); }
    }
  });
}
await fs.mkdir(authDir, { recursive: true });
start().catch(err => { console.error('[WA] Startup failed:', err.message); process.exitCode = 1; });
