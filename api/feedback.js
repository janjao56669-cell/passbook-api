// Vercel serverless function: api/feedback.js
// Receives a feedback message from the app and forwards it to the owner's Telegram chat.
// The bot token and chat id live ONLY in Vercel environment variables:
//   TELEGRAM_BOT_TOKEN  – token from @BotFather
//   TELEGRAM_CHAT_ID    – the owner's chat id
// Nothing is stored here: the message is forwarded and forgotten.

const ALLOWED_ORIGIN = 'https://janjao56669-cell.github.io';
const MAX_TEXT = 1000;
const MAX_NAME = 40;
const TYPES = ['💡 อยากได้ระบบเพิ่ม', '🐞 พบปัญหา', '💬 อื่นๆ', '🧪 ทดสอบ'];
const PLATFORMS = { ios: 'iPhone/iPad', android: 'Android', desktop: 'คอมพิวเตอร์', other: 'ไม่ทราบ' };
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Best-effort rate limit (memory is per server instance, resets on cold start).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_IP = 5;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX_PER_IP) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) {                       // keep the map small
    for (const [k, v] of hits) if (!v.some(t => now - t < RATE_WINDOW_MS)) hits.delete(k);
  }
  return false;
}

const clean = (s, max) =>
  String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

function thaiNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);   // UTC+7 (Thailand)
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${THAI_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} น.`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Health check: tells whether the two settings exist, never reveals them.
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, configured: Boolean(token && chatId) });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }

  // Only accept calls that come from the app's own web page.
  if (origin !== ALLOWED_ORIGIN) { res.status(403).json({ error: 'forbidden' }); return; }

  if (!token || !chatId) {
    res.status(500).json({ error: 'not_configured', hint: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID ใน Vercel' });
    return;
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // Honeypot: real users never fill this hidden field; bots often do.
    if (body.website) { res.status(200).json({ ok: true }); return; }

    const text = clean(body.text, MAX_TEXT);
    if (text.length < 3) { res.status(400).json({ error: 'too_short', hint: 'ข้อความสั้นเกินไป' }); return; }

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (tooMany(ip)) { res.status(429).json({ error: 'rate_limited', hint: 'ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่' }); return; }

    const type = TYPES.includes(body.type) ? body.type : '💬 อื่นๆ';
    const name = clean(body.name, MAX_NAME) || '(ไม่ระบุชื่อ)';
    const platform = PLATFORMS[body.platform] || PLATFORMS.other;
    const appVersion = clean(body.appVersion, 12) || '?';

    const message =
      `📬 ความคิดเห็นใหม่ — บัญชีต้อการช่าง ${appVersion}\n` +
      `ประเภท: ${type}\n` +
      `จาก: ${name}\n` +
      `เครื่อง: ${platform}\n` +
      `เวลา: ${thaiNow()}\n\n` +
      text;

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
    });
    const data = await tg.json().catch(() => ({}));

    if (!tg.ok || !data.ok) {
      console.error('Telegram error:', tg.status, data.description || '');
      res.status(502).json({ error: 'telegram_error', hint: data.description || 'ส่งเข้า Telegram ไม่สำเร็จ' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('feedback error:', err && err.message);
    res.status(500).json({ error: 'server_error' });
  }
}
