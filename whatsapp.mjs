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
const model = process.env.WA_MODEL || '';
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
async function answerAI(text) {
  if (!model) return 'Terima kasih! Pesan diterima. Admin akan segera membantu.';
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      try {
        response = await fetch(apiURL + '/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
          body: JSON.stringify({ model, stream: false, max_tokens: 250, messages: [
            { role: 'system', content: process.env.WA_SYSTEM_PROMPT || systemPrompt },
            { role: 'user', content: text }
          ] }),
          signal: controller.signal
        });
      } finally { clearTimeout(timer); }
      if (response.ok) {
        const data = await response.json();
        return String(data.choices?.[0]?.message?.content || '').trim().slice(0, 3500) || 'Terima kasih, pesanmu kami terima.';
      }
      if (response.status === 429 && attempt === 0) {
        const raw = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(raw) && raw > 0 ? Math.min(raw * 1000, 15000) : 5000);
        continue;
      }
      console.warn('[WA] AI HTTP status', response.status);
    } catch (err) { console.warn('[WA] AI unavailable:', err.message); }
    break;
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
            reply = await answerAI(text);
          }
        }
        if (reply) await socket.sendMessage(jid, { text: reply });
      } catch (err) { console.warn('[WA] Message handler error:', err.message); }
    }
  });
}
await fs.mkdir(authDir, { recursive: true });
start().catch(err => { console.error('[WA] Startup failed:', err.message); process.exitCode = 1; });
