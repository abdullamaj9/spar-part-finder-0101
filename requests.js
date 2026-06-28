// منطق الطلبات والعروض
const { db, getSetting, logEvent } = require('./db');
const { eligibleSuppliers, getSupplier } = require('./suppliers');

// إنشاء سلة طلب + قطعها
function createRequest({ customer_id, brand, model, year, vin, items }) {
  const reqInfo = db.prepare(`
    INSERT INTO requests (customer_id, brand, model, year, vin, status)
    VALUES (?, ?, ?, ?, ?, 'collecting')
  `).run(customer_id, brand, model, year || null, vin || '', );
  const requestId = reqInfo.lastInsertRowid;

  const itemStmt = db.prepare(`
    INSERT INTO request_items (request_id, part_name, part_condition, image_url, note, status)
    VALUES (?, ?, ?, ?, ?, 'collecting')
  `);
  const itemIds = [];
  for (const it of items) {
    const info = itemStmt.run(requestId, it.part_name, it.part_condition, it.image_url || '', it.note || '');
    itemIds.push(info.lastInsertRowid);
  }
  return { requestId, itemIds };
}

// تحديد الموردين لكل قطعة (حسب ماركة السلة + نوع القطعة)
function broadcastTargets(requestId) {
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  const items = db.prepare('SELECT * FROM request_items WHERE request_id = ?').all(requestId);
  return items.map(item => ({
    item,
    suppliers: eligibleSuppliers(req.brand, item.part_condition),
  }));
}

// ===== منطق التايمر المتدرّج =====
// المهلة = الأساس (90) + (عدد القطع في السلة - 1) × لكل قطعة (30)، بحد أقصى (240).
// ملاحظة: المهلة محسوبة على مستوى السلة كاملة (كل قطعها لها نفس الموعد).
function computeDeadlineSeconds(itemCount) {
  const base = parseInt(getSetting('countdown_seconds'), 10) || 90;
  const per = parseInt(getSetting('countdown_per_item'), 10) || 30;
  const max = parseInt(getSetting('countdown_max'), 10) || 240;
  const total = base + Math.max(0, itemCount - 1) * per;
  return Math.min(total, max);
}

// يُستدعى لحظة بثّ الطلب للموردين: يضبط لكل قطعة موعد الانتهاء وعدد الموردين المتوقَّع.
// لا يسجّل broadcasts (server.js يسجّلها عند نجاح الإرسال فقط). يستقبل خريطة
// sentCounts: { item_id: عدد الموردين الذين وصلهم الطلب فعليًا }.
function startTimers(requestId, itemIds, sentCounts = {}) {
  const itemCount = itemIds.length;
  const seconds = computeDeadlineSeconds(itemCount);
  const deadline = new Date(Date.now() + seconds * 1000).toISOString();

  const setDl = db.prepare(`
    UPDATE request_items SET deadline = ?, expected_count = ?, status = 'collecting' WHERE id = ?
  `);
  for (const itemId of itemIds) {
    const expected = sentCounts[itemId] || 0;
    setDl.run(deadline, expected, itemId);
    logEvent('broadcast', { request_id: requestId, item_id: itemId,
      detail: { expected, deadline, seconds } });
  }
  db.prepare("UPDATE requests SET status = 'collecting' WHERE id = ?").run(requestId);
  return { deadline, seconds, items: itemCount };
}

// كم مورد ردّ فعليًا على هذه القطعة (عروض فريدة لكل مورد)
function offerCountForItem(itemId) {
  const row = db.prepare(
    'SELECT COUNT(DISTINCT supplier_id) AS n FROM offers WHERE item_id = ?'
  ).get(itemId);
  return row ? row.n : 0;
}

// الفحص اللحظي: هل القطعة جاهزة لعرض النتائج؟
// جاهزة إذا: (أ) ردّ كل الموردين المتوقَّعين، أو (ب) انتهت المهلة.
// لا تُقفل قطعة سبق حسمها يدويًا. تُرجع حالة القطعة.
function checkItemReady(itemId) {
  const item = db.prepare('SELECT * FROM request_items WHERE id = ?').get(itemId);
  if (!item) return { ready: false, reason: 'not_found' };
  if (item.status === 'chosen' || item.status === 'closed') {
    return { ready: true, reason: item.status, status: item.status };
  }

  const replied = offerCountForItem(itemId);
  const expected = item.expected_count || 0;
  const allReplied = expected > 0 && replied >= expected;

  const now = Date.now();
  const dl = item.deadline ? new Date(item.deadline).getTime() : 0;
  const timeUp = dl > 0 && now >= dl;

  if (allReplied || timeUp) {
    // القطعة جاهزة: العروض صارت متاحة للعميل ليختار. نعلّمها 'ready'.
    db.prepare("UPDATE request_items SET status = 'ready' WHERE id = ? AND status = 'collecting'").run(itemId);
    logEvent('offer_received', { item_id: itemId,
      detail: { ready: true, reason: allReplied ? 'all_replied' : 'time_up', replied, expected } });
    return { ready: true, reason: allReplied ? 'all_replied' : 'time_up', replied, expected, status: 'ready' };
  }

  const secondsLeft = dl > 0 ? Math.max(0, Math.round((dl - now) / 1000)) : null;
  return { ready: false, replied, expected, seconds_left: secondsLeft, deadline: item.deadline, status: item.status };
}

// حالة السلة كاملة: جاهزة لعرض النتائج لو كل قطعها جاهزة
function requestStatus(requestId) {
  const items = db.prepare('SELECT id FROM request_items WHERE request_id = ?').all(requestId);
  if (!items.length) return { ready: false, items: [] };
  const states = items.map(i => ({ item_id: i.id, ...checkItemReady(i.id) }));
  const ready = states.every(s => s.ready);
  // أقصى وقت متبقٍ بين القطع (للعداد التنازلي في الواجهة)
  const lefts = states.map(s => s.seconds_left).filter(v => typeof v === 'number');
  const seconds_left = lefts.length ? Math.max(...lefts) : 0;
  return { ready, seconds_left, items: states };
}

// كل القطع التي بُثّت لمورد معيّن وما زالت تجمع عروضًا (مرتّبة بترتيب البث)
// تُستخدم لتوزيع ردود الأسعار المتعددة على القطع الصحيحة.
function pendingItemsForSupplier(supplierWhatsapp) {
  return db.prepare(`
    SELECT DISTINCT ri.id, ri.part_name, b.id AS broadcast_id
    FROM broadcasts b
    JOIN suppliers s ON s.id = b.supplier_id
    JOIN request_items ri ON ri.id = b.item_id
    WHERE s.whatsapp = ?
      AND ri.status IN ('collecting','open','ready')
    ORDER BY b.id ASC
  `).all(supplierWhatsapp);
}

// تسجيل عرض من مورد لقطعة
function recordOffer({ item_id, supplier_id, price, available, reply_seconds }) {
  const info = db.prepare(`
    INSERT INTO offers (item_id, supplier_id, price, available, reply_seconds)
    VALUES (?, ?, ?, ?, ?)
  `).run(item_id, supplier_id, price, available ? 1 : 0, reply_seconds || 0);
  return info.lastInsertRowid;
}

// عروض قطعة معيّنة (متوفرة فقط، مرتبة بالسعر ثم السرعة)
function offersForItem(itemId) {
  return db.prepare(`
    SELECT o.*, s.name AS supplier_name, s.score AS supplier_score, s.avg_rating
    FROM offers o JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.item_id = ? AND o.available = 1
    ORDER BY o.price ASC, o.reply_seconds ASC
  `).all(itemId);
}

// ملخص "السلة لكل مورد": لكل مورد قدّم عرضًا في هذه السلة،
// كم قطعة يغطي ومجموع أسعاره. مرتب بالتغطية الأعلى ثم الأرخص.
function supplierBaskets(requestId) {
  const items = db.prepare('SELECT id, part_name FROM request_items WHERE request_id = ?').all(requestId);
  const itemIds = items.map(i => i.id);
  const totalItems = itemIds.length;
  if (!totalItems) return { total_items: 0, baskets: [] };

  const placeholders = itemIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT o.supplier_id, o.item_id, o.price, s.name AS supplier_name, s.avg_rating
    FROM offers o JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.item_id IN (${placeholders}) AND o.available = 1
  `).all(...itemIds);

  // أرخص عرض لكل (مورد، قطعة)
  const best = {}; // sid -> { name, items: {itemId: price} }
  for (const r of rows) {
    if (!best[r.supplier_id]) best[r.supplier_id] = { name: r.supplier_name, rating: r.avg_rating, items: {} };
    const cur = best[r.supplier_id].items[r.item_id];
    if (cur === undefined || r.price < cur) best[r.supplier_id].items[r.item_id] = r.price;
  }

  const baskets = Object.entries(best).map(([sid, b]) => {
    const covered = Object.keys(b.items).length;
    const total = Object.values(b.items).reduce((a, p) => a + p, 0);
    return {
      supplier_id: parseInt(sid, 10), supplier_name: b.name, rating: b.rating,
      covered, total_items: totalItems, sum: Math.round(total * 100) / 100,
      items: b.items,
    };
  });

  // الأعلى تغطية أولًا، ثم الأرخص مجموعًا
  baskets.sort((a, b) => b.covered - a.covered || a.sum - b.sum);
  return { total_items: totalItems, baskets };
}

// حساب الرسم المُجمّع لمورد فاز بعدة قطع في نفس الصفقة
// أول قطعة: الرسم الكامل. كل إضافية: نسبة من الأساسي. يُقرّب لأقرب 0.5
function computeSupplierFee(itemCount) {
  const leadFee = parseFloat(getSetting('lead_fee')) || 5;
  const extraPct = parseFloat(getSetting('lead_fee_extra_percent')) || 40;
  const extraFee = Math.round((leadFee * extraPct / 100) * 2) / 2; // قطعة إضافية
  const total = leadFee + Math.max(0, itemCount - 1) * extraFee;
  return { leadFee, extraFee, total: Math.round(total * 2) / 2 };
}

// العميل يختار عروضًا لقطعة واحدة أو أكثر دفعة واحدة (الصفقة).
// choices: [{ item_id, offer_id }, ...]
// يجمع القطع حسب المورد، ويخصم رسمًا مُجمّعًا لكل مورد، وخصم مجانية واحدًا لكل مورد.
function chooseWinners(choices) {
  const launchFree = getSetting('launch_free_active') === '1';
  const fl = parseInt(getSetting('free_leads'), 10);
  const freeLeads = Number.isNaN(fl) ? 2 : fl;

  // التحقق وتجميع العروض حسب المورد
  const bySupplier = {}; // supplier_id -> { items: [itemId], offers: [offerId] }
  for (const ch of choices) {
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(ch.offer_id);
    if (!offer || offer.item_id !== ch.item_id) return { error: 'عرض غير صالح للقطعة ' + ch.item_id };
    const sid = offer.supplier_id;
    if (!bySupplier[sid]) bySupplier[sid] = { items: [], offers: [] };
    bySupplier[sid].items.push(ch.item_id);
    bySupplier[sid].offers.push(ch.offer_id);
  }

  const results = [];
  for (const [sidStr, grp] of Object.entries(bySupplier)) {
    const sid = parseInt(sidStr, 10);
    const supplier = getSupplier(sid);
    const fee = computeSupplierFee(grp.items.length);

    // استنتاج request_id (السلة) من أول قطعة
    const firstItem = db.prepare('SELECT request_id FROM request_items WHERE id = ?').get(grp.items[0]);
    const requestId = firstItem ? firstItem.request_id : null;

    let charged = 0;
    let txType = 'free';
    if (launchFree) {
      txType = 'free';                       // مرحلة الإطلاق: مجاني
    } else if (supplier.won_count < freeLeads) {
      txType = 'free';                       // ضمن المجانية (الصفقة = خصم مجانية واحد)
    } else {
      charged = fee.total;                   // الرسم المُجمّع للصفقة
      txType = 'lead_fee';
    }

    // تعليم كل قطع المورد كـ"محسومة" + فائزها
    const markItem = db.prepare('UPDATE request_items SET status = ?, winner_supplier_id = ? WHERE id = ?');
    for (const itemId of grp.items) markItem.run('chosen', sid, itemId);

    // الصفقة = فوز واحد (خصم مجانية واحد) بغض النظر عن عدد القطع
    db.prepare('UPDATE suppliers SET won_count = won_count + 1, balance = balance - ? WHERE id = ?')
      .run(charged, sid);
    db.prepare('INSERT INTO transactions (supplier_id, request_id, amount, type) VALUES (?, ?, ?, ?)')
      .run(sid, requestId, charged, txType);

    // تسجيل الأحداث
    logEvent('winner_chosen', { request_id: requestId, supplier_id: sid, amount: charged,
      detail: { items_won: grp.items.length, item_ids: grp.items } });
    if (charged > 0) logEvent('lead_charged', { request_id: requestId, supplier_id: sid, amount: charged });

    results.push({
      supplier_id: sid, name: supplier.name, whatsapp: supplier.whatsapp,
      items_won: grp.items.length, charged, txType, request_id: requestId,
      fee_breakdown: { first: fee.leadFee, each_extra: fee.extraFee },
      free_remaining: Math.max(0, freeLeads - (supplier.won_count + 1)),
    });
  }

  return { winners: results, total_charged: results.reduce((a, r) => a + r.charged, 0) };
}

// تسجيل عرض من رد مورد عبر الواتساب
// itemId معروف من سياق المحادثة (يُمرّر عبر معرّف الطلب في الرسالة)
function recordOfferFromReply({ supplier_id, item_id, available, price, reply_seconds }) {
  // منع التكرار: لو سبق للمورد عرض على نفس القطعة، نحدّثه
  const existing = db.prepare('SELECT id FROM offers WHERE item_id = ? AND supplier_id = ?').get(item_id, supplier_id);
  let offerId;
  if (existing) {
    db.prepare('UPDATE offers SET price = ?, available = ?, reply_seconds = ? WHERE id = ?')
      .run(price, available ? 1 : 0, reply_seconds || 0, existing.id);
    logEvent('offer_received', { item_id, supplier_id, amount: price || 0, detail: 'updated' });
    offerId = existing.id;
  } else {
    const info = db.prepare(`
      INSERT INTO offers (item_id, supplier_id, price, available, reply_seconds)
      VALUES (?, ?, ?, ?, ?)
    `).run(item_id, supplier_id, price, available ? 1 : 0, reply_seconds || 0);
    logEvent('offer_received', { item_id, supplier_id, amount: price || 0 });
    offerId = info.lastInsertRowid;
  }
  // فحص لحظي: هل ردّ كل الموردين الآن؟ لو نعم، القطعة تصبح جاهزة فورًا (يوقف الانتظار)
  const ready = checkItemReady(item_id);
  return { offer_id: offerId, ready };
}

module.exports = {
  createRequest, broadcastTargets, recordOffer, recordOfferFromReply,
  offersForItem, chooseWinners, computeSupplierFee, supplierBaskets,
  computeDeadlineSeconds, startTimers, checkItemReady, requestStatus, offerCountForItem,
  pendingItemsForSupplier
};
