// لوحة المورد: OTP عبر الواتساب + جلسات + بيانات اللوحة
const crypto = require('node:crypto');
const { db, getSetting, logEvent } = require('./db');
const { sendText } = require('./whatsapp');

// توليد رمز OTP وإرساله عبر الواتساب
async function requestOtp(whatsapp) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE whatsapp = ?').get(whatsapp);
  if (!supplier) return { error: 'هذا الرقم غير مسجّل كمورد' };

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 أرقام
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 دقائق
  db.prepare('INSERT INTO otp_codes (whatsapp, code, expires_at) VALUES (?, ?, ?)').run(whatsapp, code, expires);

  await sendText(whatsapp, `رمز الدخول للوحة كارلي: ${code}\nصالح لمدة 10 دقائق.`);
  logEvent('otp_sent', { supplier_id: supplier.id });
  return { ok: true, sent_to: whatsapp };
}

// التحقق من OTP وإنشاء جلسة
function verifyOtp(whatsapp, code) {
  const row = db.prepare(`
    SELECT * FROM otp_codes WHERE whatsapp = ? AND code = ? AND used = 0
    AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1
  `).get(whatsapp, code);
  if (!row) return { error: 'رمز خاطئ أو منتهي' };

  const supplier = db.prepare('SELECT * FROM suppliers WHERE whatsapp = ?').get(whatsapp);
  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);

  // جلسة صالحة 7 أيام
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO supplier_sessions (token, supplier_id, expires_at) VALUES (?, ?, ?)')
    .run(token, supplier.id, expires);
  logEvent('login', { supplier_id: supplier.id });
  return { token, supplier_id: supplier.id };
}

// التحقق من جلسة
function supplierFromToken(token) {
  const sess = db.prepare(`
    SELECT * FROM supplier_sessions WHERE token = ? AND expires_at > datetime('now')
  `).get(token);
  if (!sess) return null;
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sess.supplier_id);
}

// بيانات لوحة المورد: رصيد، فوز، مجانية، سجل الصفقات (سطر لكل صفقة)
function dashboardData(supplierId) {
  const s = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  const fl = parseInt(getSetting('free_leads'), 10);
  const freeLeads = Number.isNaN(fl) ? 2 : fl;

  // الصفقات الفائزة: مجمّعة حسب الصفقة (request) — سطر واحد لكل صفقة
  const deals = db.prepare(`
    SELECT
      r.id AS request_id, r.brand, r.model, r.year, r.created_at,
      COUNT(ri.id) AS items_count,
      COALESCE((SELECT t.amount FROM transactions t
                WHERE t.request_id = r.id AND t.supplier_id = ? ORDER BY t.id DESC LIMIT 1), 0) AS charged
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    WHERE ri.winner_supplier_id = ?
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(supplierId, supplierId);

  return {
    name: s.name,
    balance: s.balance,
    is_debt: s.balance < 0,
    won_count: s.won_count,
    free_remaining: Math.max(0, freeLeads - s.won_count),
    score: s.score,
    avg_rating: s.avg_rating,
    deals,
  };
}

module.exports = { requestOtp, verifyOtp, supplierFromToken, dashboardData };
