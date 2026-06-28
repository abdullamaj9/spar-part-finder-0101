// الخادم الرئيسي
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');

const { db, getSetting, setSetting } = require('./db');
const suppliersLib = require('./suppliers');
const requestsLib = require('./requests');
const { sendText, sendTemplateRequest, sendDealWon, sendSupplierRequest, buildSupplierMessage } = require('./whatsapp');
const { BRANDS, ORIGINS, CONDITIONS } = require('./brands');
const { PART_CATEGORIES, CATEGORY_NAMES } = require('./parts');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// كلمة مرور الإدارة من متغير بيئة (لا في الكود)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'carly2025';
const tokens = new Set();

function makeToken() {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.add(t);
  return t;
}

function requireAdmin(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (tokens.has(t)) return next();
  return res.status(401).json({ error: 'غير مصرّح' });
}

// ===== المصادقة =====
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    return res.json({ token: makeToken() });
  }
  res.status(401).json({ error: 'كلمة المرور خاطئة' });
});

// ===== بيانات مرجعية =====
app.get('/api/meta', (req, res) => {
  // الماركات مجمّعة حسب المنشأ (لمربعات الاختيار في الكنترول)
  const byOrigin = {};
  for (const [brand, info] of Object.entries(BRANDS)) {
    if (!byOrigin[info.origin]) byOrigin[info.origin] = [];
    byOrigin[info.origin].push(brand);
  }
  res.json({
    brands: Object.keys(BRANDS),
    brandModels: Object.fromEntries(Object.entries(BRANDS).map(([k, v]) => [k, v.models])),
    brandsByOrigin: byOrigin,
    origins: ORIGINS,
    conditions: CONDITIONS,
    partCategories: PART_CATEGORIES,
    categoryNames: CATEGORY_NAMES,
    countdown: parseInt(getSetting('countdown_seconds'), 10),
  });
});

// ===== الموردون (إدارة) =====
app.get('/api/admin/suppliers', requireAdmin, (req, res) => {
  res.json(suppliersLib.listSuppliers(req.query.status ? { status: req.query.status } : {}));
});

app.post('/api/admin/suppliers', requireAdmin, (req, res) => {
  try {
    const s = suppliersLib.addSupplier(req.body);
    res.json(s);
  } catch (e) {
    console.error('خطأ في حفظ المورد:', e.message);
    res.status(400).json({ error: 'تعذّر حفظ المورد، تحقّق من البيانات' });
  }
});

app.put('/api/admin/suppliers/:id', requireAdmin, (req, res) => {
  const s = suppliersLib.updateSupplier(parseInt(req.params.id, 10), req.body);
  if (!s) return res.status(404).json({ error: 'غير موجود' });
  res.json(s);
});

app.delete('/api/admin/suppliers/:id', requireAdmin, (req, res) => {
  suppliersLib.deleteSupplier(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// مؤشر تشبّع الماركات
app.get('/api/admin/brand-saturation', requireAdmin, (req, res) => {
  const active = suppliersLib.listSuppliers({ status: 'active' });
  const count = {};
  for (const s of active) {
    for (const b of suppliersLib.csvClean(s.brands)) count[b] = (count[b] || 0) + 1;
  }
  const max = parseInt(getSetting('max_suppliers_per_brand'), 10);
  res.json({ counts: count, max });
});

// ===== الإعدادات =====
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  for (const [k, v] of Object.entries(req.body)) setSetting(k, v);
  res.json({ ok: true });
});

// ===== الطلبات (العميل) =====
app.post('/api/requests', async (req, res) => {
  try {
    const { whatsapp, name, is_workshop, brand, model, year, vin, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'لا توجد قطع' });

    // إنشاء/جلب العميل
    let cust = db.prepare('SELECT * FROM customers WHERE whatsapp = ?').get(whatsapp);
    if (!cust) {
      const info = db.prepare('INSERT INTO customers (whatsapp, name, is_workshop) VALUES (?, ?, ?)')
        .run(whatsapp, name || '', is_workshop ? 1 : 0);
      cust = { id: info.lastInsertRowid };
    }

    const { requestId, itemIds } = requestsLib.createRequest({
      customer_id: cust.id, brand, model, year, vin, items,
    });

    // البث للموردين المؤهلين عبر القالب المعتمد part_request
    const targets = requestsLib.broadcastTargets(requestId);
    let sent = 0;
    const sentCounts = {}; // item_id -> عدد الموردين الذين وصلهم الطلب فعليًا
    const recordBroadcast = db.prepare('INSERT INTO broadcasts (item_id, supplier_id) VALUES (?, ?)');
    const carDesc = `${brand} ${model || ''} ${year || ''}`.trim();
    for (const t of targets) {
      sentCounts[t.item.id] = 0;
      for (const sup of t.suppliers) {
        // عزل كل إرسال: فشل مورد لا يُفشل الطلب كله ولا يسرّب أي تفاصيل
        try {
          await sendTemplateRequest(sup.whatsapp, {
            car: carDesc,
            part: `[${t.item.id}] ` + (t.item.note ? `${t.item.part_name} (${t.item.note})` : t.item.part_name),
            type: t.item.part_condition,
            vin: vin,
          });
          recordBroadcast.run(t.item.id, sup.id);
          sentCounts[t.item.id]++;
          sent++;
        } catch (sendErr) {
          // نسجّل في الخادم فقط (لا يصل للمتصفح أبدًا) — دون كشف التوكن
          console.error(`فشل إرسال لمورد ${sup.id}:`, String(sendErr.message || sendErr).slice(0, 200));
        }
      }
    }

    // بدء التايمر المتدرّج: يضبط لكل قطعة موعد الانتهاء وعدد الموردين المتوقَّع
    const timer = requestsLib.startTimers(requestId, itemIds, sentCounts);

    res.json({ requestId, itemIds, suppliers_notified: sent,
      deadline: timer.deadline, countdown_seconds: timer.seconds });
  } catch (e) {
    // رسالة عامة للمتصفح، والتفاصيل في سجل الخادم فقط
    console.error('خطأ في إنشاء الطلب:', e.message);
    res.status(400).json({ error: 'تعذّر إنشاء الطلب، حاول مجددًا' });
  }
});

// عروض قطعة (للعرض على العميل)
app.get('/api/items/:id/offers', (req, res) => {
  res.json(requestsLib.offersForItem(parseInt(req.params.id, 10)));
});

// حالة السلة: هل النتائج جاهزة؟ كم الوقت المتبقي؟ (يستخدمها العميل للعداد التنازلي)
// ready=true يعني: ردّ كل الموردين أو انتهت المهلة — العروض جاهزة للاختيار.
app.get('/api/requests/:id/status', (req, res) => {
  res.json(requestsLib.requestStatus(parseInt(req.params.id, 10)));
});

// نقطة فحص مؤقتة: آخر طلب بالنظام + حالة التايمر كاملة (للاختبار)
app.get('/api/debug/last-request', (req, res) => {
  const last = db.prepare('SELECT * FROM requests ORDER BY id DESC LIMIT 1').get();
  if (!last) return res.json({ message: 'لا يوجد أي طلب بعد' });
  const items = db.prepare('SELECT id, part_name, status, deadline, expected_count FROM request_items WHERE request_id = ?').all(last.id);
  const status = requestsLib.requestStatus(last.id);
  // نضيف العروض الواصلة لكل قطعة (لتشخيص هل سُجّلت الردود)
  const withOffers = items.map(it => ({
    ...it,
    offers: requestsLib.offersForItem(it.id),
  }));
  res.json({ request: last, items: withOffers, timer_status: status });
});

// تشخيص: عرض الموردين المسجّلين بأرقامهم المطبّعة (لمطابقة رقم الرد)
app.get('/api/debug/suppliers', (req, res) => {
  const sups = db.prepare('SELECT id, name, whatsapp, brands, conditions FROM suppliers').all();
  res.json({ count: sups.length, suppliers: sups });
});

// تشخيص: تسجيل مورد اختبار برقم اختبار Meta (لتجربة دورة الرد كاملة)
// استخدم: /api/debug/add-test-supplier?phone=15556716249&brands=تويوتا&conditions=جديد أصلي
app.get('/api/debug/add-test-supplier', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'أضف ?phone=الرقم' });
  const brands = req.query.brands || 'تويوتا';
  const conditions = req.query.conditions || 'جديد أصلي،جديد تجاري،مستعمل';
  const norm = normalizePhone(phone);
  const existing = db.prepare('SELECT * FROM suppliers WHERE whatsapp = ?').get(norm);
  if (existing) return res.json({ message: 'المورد مسجّل مسبقًا', supplier: existing });
  const sup = suppliersLib.addSupplier({ name: 'مورد اختبار', whatsapp: norm, brands, conditions });
  res.json({ message: 'تم تسجيل مورد اختبار', supplier: sup });
});

// العميل يختار فائزين لقطعة أو أكثر دفعة واحدة (الصفقة)
// body: { choices: [{ item_id, offer_id }, ...] }
app.post('/api/requests/choose', async (req, res) => {
  const r = requestsLib.chooseWinners(req.body.choices || []);
  if (r.error) return res.status(400).json(r);

  // إشعار كل مورد فائز عبر قالب deal_won (مع رقم العميل ليتواصل معه)
  if (r.winners && r.winners.length) {
    for (const w of r.winners) {
      try {
        const reqRow = db.prepare('SELECT r.*, c.whatsapp AS cust_whatsapp FROM requests r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?').get(w.request_id);
        if (reqRow) {
          const carDesc = `${reqRow.brand} ${reqRow.model || ''} ${reqRow.year || ''}`.trim();
          await sendDealWon(w.whatsapp, {
            car: carDesc,
            part: `${w.items_won} قطعة`,
            customerContact: reqRow.cust_whatsapp,
          });
        }
      } catch (e) {
        console.error(`فشل إشعار الفائز ${w.supplier_id}:`, String(e.message || e).slice(0, 150));
      }
    }
  }
  res.json(r);
});

// عرض ملخص "السلة لكل مورد": كم قطعة يغطي كل مورد ومجموع أسعاره
app.get('/api/requests/:id/supplier-baskets', (req, res) => {
  res.json(requestsLib.supplierBaskets(parseInt(req.params.id, 10)));
});

// ===== لوحة المورد (OTP + جلسة) =====
const portal = require('./supplier_portal');

app.post('/api/supplier/request-otp', async (req, res) => {
  const r = await portal.requestOtp((req.body.whatsapp || '').trim());
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.post('/api/supplier/verify-otp', (req, res) => {
  const r = portal.verifyOtp((req.body.whatsapp || '').trim(), (req.body.code || '').trim());
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

function requireSupplier(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const sup = portal.supplierFromToken(t);
  if (!sup) return res.status(401).json({ error: 'الجلسة منتهية، سجّل دخولك مجددًا' });
  req.supplier = sup;
  next();
}

app.get('/api/supplier/dashboard', requireSupplier, (req, res) => {
  res.json(portal.dashboardData(req.supplier.id));
});

// ===== التقارير (إدارة) =====
const reports = require('./reports');

app.get('/api/admin/reports/:type', requireAdmin, (req, res) => {
  const f = { from: req.query.from, to: req.query.to, brand: req.query.brand, condition: req.query.condition };
  let data;
  switch (req.params.type) {
    case 'brands': data = reports.topBrands(f); break;
    case 'parts': data = reports.topParts(f); break;
    case 'conditions': data = reports.conditionBreakdown(f); break;
    case 'customers': data = reports.topCustomers(f); break;
    case 'suppliers': data = reports.supplierPerformance(); break;
    case 'revenue': data = reports.revenue(f); break;
    case 'funnel': data = reports.funnel(f); break;
    case 'parts-winners': data = reports.partsWinners(f); break;
    default: return res.status(404).json({ error: 'تقرير غير معروف' });
  }
  // تصدير CSV لو طُلب
  if (req.query.format === 'csv' && Array.isArray(data)) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.csv"`);
    return res.send(reports.toCSV(data));
  }
  res.json(data);
});

// ===== استقبال ردود الموردين (Webhook) =====
const { parseReply, parseMultiReply } = require('./reply_parser');
const { normalizePhone } = require('./phone');

// تحقق Meta من الـ webhook (GET) — مطلوب لربط الرابط في Meta
app.get('/api/webhook/reply', (req, res) => {
  const verifyToken = process.env.WA_VERIFY_TOKEN || 'carly_verify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge); // Meta تتوقّع إرجاع الـ challenge
  }
  return res.sendStatus(403);
});

// استقبال ردود الموردين من Meta (POST)
// يدعم: صيغة Meta الحقيقية (أزرار + نص) + الصيغة المبسّطة للاختبار
app.post('/api/webhook/reply', (req, res) => {
  // Meta تتطلب رد 200 سريعًا، نعالج ثم نرد
  try {
    // الصيغة المبسّطة للاختبار: { from, text, item_id }
    if (req.body.from && req.body.item_id) {
      return handleReply(req.body.from, req.body.text, req.body.item_id, res);
    }

    // صيغة Meta الحقيقية: بنية متداخلة
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return res.sendStatus(200); // إشعار حالة (تسليم/قراءة)، نتجاهله

    const from = message.from; // رقم المورد
    let text = '';
    let itemId = null;

    if (message.type === 'interactive' && message.interactive?.button_reply) {
      // ضغط زر: id مثل avail_5 أو unavail_5
      const btnId = message.interactive.button_reply.id;
      const m = btnId.match(/^(avail|unavail)_(\d+)$/);
      if (m) {
        itemId = parseInt(m[2], 10);
        text = m[1] === 'avail' ? 'متوفر' : 'غير متوفر';
      }
    } else if (message.type === 'text') {
      // رد نصي (سعر/أسعار) — نمرّر النص كاملًا، و handleReply يوزّعه على القطع الصحيحة
      // (يدعم: "15=220" متعدد الأسطر، أو أسطر أرقام بالترتيب)
      text = message.text.body;
      const normFrom = normalizePhone(from);
      // نمرّر آخر قطعة كاحتياطي فقط (لحالة السعر الواحد بدون رقم)
      const lastReq = db.prepare(`
        SELECT b.item_id FROM broadcasts b
        JOIN suppliers s ON s.id = b.supplier_id
        WHERE s.whatsapp = ? ORDER BY b.id DESC LIMIT 1
      `).get(normFrom);
      itemId = lastReq?.item_id || null;
    }

    // للنص: نمرّر دائمًا (حتى لو itemId فاضي، handleReply يوزّع بالرقم/الترتيب)
    if (from && (itemId || message.type === 'text')) return handleReply(from, text, itemId, res);
    return res.sendStatus(200);
  } catch (e) {
    console.error('webhook error:', e.message);
    return res.sendStatus(200); // نرد 200 دائمًا لئلا تعيد Meta الإرسال
  }
});

// المعالج المشترك: يحلّل الرد ويسجّل العرض
function handleReply(from, text, item_id, res) {
  const normFrom = normalizePhone(from);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE whatsapp = ?').get(normFrom);
  if (!supplier) {
    // تشخيص: رقم المورد لا يطابق أي مورد مسجّل (سبب شائع لعدم تسجيل الردود)
    console.log(`[webhook] رد من رقم "${from}" (مطبّع: "${normFrom}") — لا يوجد مورد مسجّل بهذا الرقم. تم تجاهل الرد.`);
    return res.json({ understood: false, reason: 'supplier_not_found', normalized: normFrom });
  }
  console.log(`[webhook] رد من المورد "${supplier.name}" (${normFrom}): "${(text||'').replace(/\n/g,' | ')}"`);

  const body = text || '';
  const multi = parseMultiReply(body);

  // حساب ثواني الرد لقطعة معيّنة
  const replySecondsFor = (iid) => {
    const it = db.prepare('SELECT created_at FROM request_items WHERE id = ?').get(iid);
    if (!it) return 0;
    const created = new Date(it.created_at + 'Z').getTime();
    return Math.max(0, Math.round((Date.now() - created) / 1000));
  };

  const recorded = []; // {item_id, price, available}
  let anyReady = false;

  // الحالة (أ): ردود مربوطة بالرقم "15=220" — الأدقّ، نسجّل كلًا في قطعته
  if (multi.keyed.length) {
    for (const k of multi.keyed) {
      // تأكد أن القطعة بُثّت فعلًا لهذا المورد (أمان)
      const wasBroadcast = db.prepare(
        'SELECT 1 FROM broadcasts WHERE item_id = ? AND supplier_id = ? LIMIT 1'
      ).get(k.item_id, supplier.id);
      if (!wasBroadcast) continue;
      const r = requestsLib.recordOfferFromReply({
        supplier_id: supplier.id, item_id: k.item_id,
        available: k.available, price: k.price, reply_seconds: replySecondsFor(k.item_id),
      });
      recorded.push({ item_id: k.item_id, price: k.price, available: k.available });
      if (r?.ready?.ready) anyReady = true;
    }
  }

  // الحالة (ب): أسطر بالترتيب (220 / 334 / 450) — نوزّعها على القطع المبثوثة بالترتيب
  // (تعمل فقط إن لم تكن هناك ردود مربوطة بالرقم، تفاديًا للازدواج)
  if (!multi.keyed.length && multi.ordered.length) {
    const pending = requestsLib.pendingItemsForSupplier(normFrom); // مرتّبة بترتيب البث
    if (multi.ordered.length === 1 && item_id) {
      // سعر واحد فقط + لدينا item_id محدّد (مثلًا من زر) → استخدمه مباشرة
      const p = multi.ordered[0];
      const r = requestsLib.recordOfferFromReply({
        supplier_id: supplier.id, item_id,
        available: p.available, price: p.price, reply_seconds: replySecondsFor(item_id),
      });
      recorded.push({ item_id, price: p.price, available: p.available });
      if (r?.ready?.ready) anyReady = true;
    } else {
      // عدة أسعار → وزّعها على القطع المعلّقة بالترتيب (حتى أقصر القائمتين)
      const n = Math.min(multi.ordered.length, pending.length);
      for (let i = 0; i < n; i++) {
        const p = multi.ordered[i];
        const iid = pending[i].id;
        const r = requestsLib.recordOfferFromReply({
          supplier_id: supplier.id, item_id: iid,
          available: p.available, price: p.price, reply_seconds: replySecondsFor(iid),
        });
        recorded.push({ item_id: iid, price: p.price, available: p.available });
        if (r?.ready?.ready) anyReady = true;
      }
    }
  }

  if (!recorded.length) {
    console.log(`[webhook] لم يُسجّل أي عرض من "${supplier.name}" — تعذّر فهم الأسعار.`);
    return res.json({ understood: false, hint: 'لم نتعرّف على سعر. أرسل: رقم القطعة=السعر (مثال: 15=220)' });
  }
  console.log(`[webhook] سُجّل ${recorded.length} عرض من "${supplier.name}": ` +
    recorded.map(r => `قطعة ${r.item_id}=${r.available ? r.price : 'لا'}`).join('، '));
  return res.json({ understood: true, recorded, any_ready: anyReady });
}

// ===== النسخ الاحتياطي (إدارة) =====
const backup = require('./backup');

app.post('/api/admin/backup/run', requireAdmin, async (req, res) => {
  const r = await backup.runBackup({ email: req.body.email !== false });
  res.json(r);
});

app.get('/api/admin/backup/download', requireAdmin, (req, res) => {
  res.download(backup.DB_PATH, 'carly-backup.db');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Carly server يعمل على المنفذ ${PORT}`);
  try { backup.startSchedule(); } catch (e) { console.error('فشل جدولة النسخ:', e.message); }
});

module.exports = app;
