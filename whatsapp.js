// طبقة إرسال واتساب مجرّدة
// تدعم: WhatsApp Business API الرسمي (عبر مزوّد) + وضع محاكاة للاختبار المحلي
// تربط مفاتيحك عبر متغيرات البيئة دون تغيير أي منطق

const PROVIDER = (process.env.WA_PROVIDER || 'mock').trim(); // mock | meta
// trim() يزيل أي مسافة/سطر جديد خفي قد يسبب "invalid header value"
const META_TOKEN = (process.env.WA_META_TOKEN || '').trim();
const META_PHONE_ID = (process.env.WA_META_PHONE_ID || '').trim();

// إرسال قالب معتمد (للاختبار: hello_world) — يثبت أن الإرسال يعمل
async function sendTemplate(toWhatsapp, templateName = 'hello_world', lang = 'en_US') {
  if (PROVIDER === 'mock') {
    console.log(`[WA mock] → ${toWhatsapp}: [template ${templateName}]`);
    return { ok: true, mock: true };
  }
  if (PROVIDER === 'meta') {
    const url = `https://graph.facebook.com/v21.0/${META_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWhatsapp,
        type: 'template',
        template: { name: templateName, language: { code: lang } },
      }),
    });
    return await res.json();
  }
  throw new Error('مزوّد واتساب غير معروف: ' + PROVIDER);
}

// إرسال طلب للمورد عبر القالب المعتمد part_request (المتغيرات الأربعة)
// car=السيارة، part=القطعة، type=النوع، vin=الشاسيه (أو "Not provided")
async function sendTemplateRequest(toWhatsapp, { car, part, type, vin }) {
  const vinValue = (vin && vin.trim()) ? vin.trim() : 'Not provided';
  if (PROVIDER === 'mock') {
    console.log(`[WA mock] → ${toWhatsapp}: [template part_request] ${car} | ${part} | ${type} | ${vinValue}`);
    return { ok: true, mock: true };
  }
  if (PROVIDER === 'meta') {
    const url = `https://graph.facebook.com/v21.0/${META_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWhatsapp,
        type: 'template',
        template: {
          name: 'part_request',
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: car },
              { type: 'text', text: part },
              { type: 'text', text: type },
              { type: 'text', text: vinValue },
            ],
          }],
        },
      }),
    });
    const data = await res.json();
    // فحص نجاح Meta — عند الفشل نرمي خطأ نظيفًا (سبب Meta فقط، لا التوكن)
    if (!res.ok || data.error) {
      const reason = data.error ? `${data.error.code}: ${data.error.message}` : `HTTP ${res.status}`;
      throw new Error('WhatsApp send failed — ' + reason);
    }
    return data;
  }
  throw new Error('مزوّد واتساب غير معروف: ' + PROVIDER);
}

async function sendText(toWhatsapp, text) {
  if (PROVIDER === 'mock') {
    console.log(`[WA mock] → ${toWhatsapp}: ${text.slice(0, 60)}...`);
    return { ok: true, mock: true };
  }
  if (PROVIDER === 'meta') {
    const url = `https://graph.facebook.com/v21.0/${META_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWhatsapp,
        type: 'text',
        text: { body: text },
      }),
    });
    return await res.json();
  }
  throw new Error('مزوّد واتساب غير معروف: ' + PROVIDER);
}

// رسالة طلب للمورد مع أزرار تفاعلية (عربي + إنجليزي معًا)
// تُرسل عبر Meta interactive buttons عند تفعيل API الرسمي
function buildSupplierMessage({ requestId, itemId, brand, model, year, partName, condition }) {
  return `📌 طلب جديد / New Request #${requestId}-${itemId}\n\n` +
    `السيارة / Car: ${brand} ${model} ${year || ''}\n` +
    `القطعة / Part: ${partName}\n` +
    `النوع / Type: ${condition}\n\n` +
    `هل القطعة متوفرة؟ / Is it available?`;
}

// بنية الأزرار التفاعلية (Meta interactive format)
function buildSupplierButtons({ requestId, itemId, brand, model, year, partName, condition }) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: buildSupplierMessage({ requestId, itemId, brand, model, year, partName, condition }) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `avail_${itemId}`, title: 'متوفر / Available' } },
          { type: 'reply', reply: { id: `unavail_${itemId}`, title: 'غير متوفر / Not avail.' } },
        ],
      },
    },
  };
}

// رسالة طلب السعر بعد ضغط "متوفر"
function buildPriceRequest() {
  return 'ممتاز! أرسل السعر بالدرهم (رقم فقط)\nGreat! Send the price in AED (number only)';
}

// رسالة إشعار الفوز (عربي + إنجليزي)
function buildWinnerNotice({ brand, model, itemsCount, charged, balance }) {
  const fee = charged > 0 ? `خُصم ${charged} درهم / ${charged} AED charged` : 'مجاني / Free';
  return `✅ فزت بصفقة! / You won a deal!\n\n` +
    `${brand} ${model} — ${itemsCount} قطعة / parts\n${fee}\n` +
    `رصيدك / Balance: ${balance} درهم\n\n` +
    `للتفاصيل / Details: [رابط لوحتك]`;
}

// إرسال طلب للمورد: أزرار تفاعلية عبر Meta، أو نص في mock
async function sendSupplierRequest(toWhatsapp, itemData, fallbackText) {
  if (PROVIDER === 'mock') {
    console.log(`[WA mock] → ${toWhatsapp}: [أزرار] ${fallbackText.slice(0, 50)}...`);
    return { ok: true, mock: true };
  }
  if (PROVIDER === 'meta') {
    const url = `https://graph.facebook.com/v21.0/${META_PHONE_ID}/messages`;
    const payload = buildSupplierButtons(itemData);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWhatsapp,
        ...payload,
      }),
    });
    return await res.json();
  }
  throw new Error('مزوّد واتساب غير معروف: ' + PROVIDER);
}

module.exports = { sendText, sendTemplateRequest, sendSupplierRequest, buildSupplierMessage, buildSupplierButtons, buildPriceRequest, buildWinnerNotice, PROVIDER };
