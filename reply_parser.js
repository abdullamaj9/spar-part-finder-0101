// محلّل ردود الموردين: يستخرج التوفر والسعر من نص حر (عربي/إنجليزي)
// يُستخدم بعد ضغط زر "متوفر" (الرسالة سعر متوقّع) أو لتحليل رد نصي حر

// تحويل الأرقام العربية/الفارسية إلى لاتينية
function normalizeDigits(str) {
  const map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  return str.replace(/[٠-٩۰-۹]/g, d => map[d] || d);
}

// كلمات عدم التوفر (عربي + إنجليزي)
const UNAVAILABLE = [
  'غير متوفر','مو متوفر','ما متوفر','مامتوفر','ماعندي','ما عندي','مو موجود','غير موجود',
  'مب موجود','نفذ','خلص','مايوجد','لا يوجد','مافي','ما في',
  'not available','unavailable','out of stock','no stock','none','sold out',"don't have",'dont have','no'
];

// تحليل رد المورد
function parseReply(text) {
  if (!text || !text.trim()) return { ok: false, reason: 'فارغ' };
  const raw = text.trim();
  const lower = normalizeDigits(raw.toLowerCase());

  // 1) فحص عدم التوفر أولًا
  // حالة خاصة: السطر كله "لا" أو "no" أو "x" (رد مختصر شائع لعدم التوفر)
  const compact = lower.replace(/[\s.!،,-]/g, '');
  if (['لا','no','x','✗','✘','×','-'].includes(compact)) {
    return { ok: true, available: false, price: null };
  }
  for (const kw of UNAVAILABLE) {
    if (lower.includes(kw)) return { ok: true, available: false, price: null };
  }

  // 2) استخراج السعر: أول رقم معقول (يدعم فواصل الآلاف والكسور)
  const cleaned = normalizeDigits(raw).replace(/[,،](?=\d{3})/g, ''); // إزالة فواصل الآلاف
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) {
    return { ok: false, reason: 'لم يُعثر على سعر', available: null, price: null };
  }

  // اختيار أكبر رقم معقول كسعر (يتجاهل أرقامًا صغيرة مثل "كمية 2")
  const nums = matches.map(Number).filter(n => n > 0 && n < 1000000);
  if (!nums.length) return { ok: false, reason: 'رقم غير منطقي' };
  const price = Math.max(...nums);

  return { ok: true, available: true, price };
}

// تحليل رد متعدّد: يدعم صيغتين
//  (أ) مربوط بالرقم:  "15=220" أو "15 : 220" أو "15-220"  (الأدقّ)
//  (ب) أسطر بالترتيب: كل سطر سعر/رد واحد، يُوزَّع على القطع بترتيب البث
// يرجّع: { keyed: [{item_id, ...parsed}], ordered: [parsed, parsed, ...] }
function parseMultiReply(text) {
  if (!text || !text.trim()) return { keyed: [], ordered: [] };
  const lines = normalizeDigits(text).split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const keyed = [];
  const ordered = [];
  for (const line of lines) {
    // صيغة "رقم = سعر" أو "رقم: سعر" أو "[رقم] سعر"
    const m = line.match(/^\[?(\d{1,7})\]?\s*[=:\-،,]\s*(.+)$/);
    if (m) {
      const itemId = parseInt(m[1], 10);
      const parsed = parseReply(m[2]);
      if (parsed.ok) keyed.push({ item_id: itemId, ...parsed });
      continue;
    }
    // سطر عادي (سعر أو "لا") — للتوزيع بالترتيب
    const parsed = parseReply(line);
    if (parsed.ok) ordered.push(parsed);
  }
  return { keyed, ordered };
}

module.exports = { parseReply, parseMultiReply, normalizeDigits };
