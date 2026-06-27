// طبقة التقارير — مرنة بالفلاتر (فترة، ماركة، نوع، مورد، حالة)
const { db } = require('./db');

// بناء شرط WHERE من الفلاتر المشتركة
function buildFilter(f = {}) {
  const conds = [];
  const args = [];
  if (f.from) { conds.push("r.created_at >= ?"); args.push(f.from); }
  if (f.to) { conds.push("r.created_at <= ?"); args.push(f.to + ' 23:59:59'); }
  if (f.brand) { conds.push("r.brand = ?"); args.push(f.brand); }
  if (f.condition) { conds.push("ri.part_condition = ?"); args.push(f.condition); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return { where, args };
}

// أكثر الماركات طلبًا
function topBrands(f = {}) {
  const { where, args } = buildFilter(f);
  return db.prepare(`
    SELECT r.brand, COUNT(DISTINCT r.id) AS requests, COUNT(ri.id) AS items
    FROM requests r JOIN request_items ri ON ri.request_id = r.id
    ${where} GROUP BY r.brand ORDER BY items DESC
  `).all(...args);
}

// أكثر القطع طلبًا
function topParts(f = {}) {
  const { where, args } = buildFilter(f);
  return db.prepare(`
    SELECT ri.part_name, COUNT(*) AS count
    FROM requests r JOIN request_items ri ON ri.request_id = r.id
    ${where} GROUP BY ri.part_name ORDER BY count DESC LIMIT 50
  `).all(...args);
}

// توزيع نوع القطعة (أصلي/تجاري/مستعمل)
function conditionBreakdown(f = {}) {
  const { where, args } = buildFilter(f);
  return db.prepare(`
    SELECT ri.part_condition, COUNT(*) AS count
    FROM requests r JOIN request_items ri ON ri.request_id = r.id
    ${where} GROUP BY ri.part_condition ORDER BY count DESC
  `).all(...args);
}

// أكثر العملاء نشاطًا
function topCustomers(f = {}) {
  const { where, args } = buildFilter(f);
  return db.prepare(`
    SELECT c.whatsapp, c.is_workshop, COUNT(DISTINCT r.id) AS requests
    FROM customers c JOIN requests r ON r.customer_id = c.id
    JOIN request_items ri ON ri.request_id = r.id
    ${where} GROUP BY c.id ORDER BY requests DESC LIMIT 50
  `).all(...args);
}

// أداء الموردين
function supplierPerformance() {
  return db.prepare(`
    SELECT s.name, s.whatsapp, s.brands, s.won_count, s.balance,
           s.avg_rating, s.score, COUNT(o.id) AS offers_made
    FROM suppliers s LEFT JOIN offers o ON o.supplier_id = s.id
    GROUP BY s.id ORDER BY s.won_count DESC
  `).all();
}

// ملخص الإيرادات
function revenue(f = {}) {
  const conds = ["t.type = 'lead_fee'"];
  const args = [];
  if (f.from) { conds.push("t.created_at >= ?"); args.push(f.from); }
  if (f.to) { conds.push("t.created_at <= ?"); args.push(f.to + ' 23:59:59'); }
  const where = 'WHERE ' + conds.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS leads, COALESCE(SUM(t.amount),0) AS revenue FROM transactions t ${where}`).get(...args);
  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', t.created_at) AS month, COUNT(*) AS leads, SUM(t.amount) AS revenue
    FROM transactions t ${where} GROUP BY month ORDER BY month DESC
  `).all(...args);
  return { total, byMonth };
}

// قمع التحويل: كم طلب، كم تلقى عرضًا، كم اختار العميل
function funnel(f = {}) {
  const { where, args } = buildFilter(f);
  const totalItems = db.prepare(`
    SELECT COUNT(ri.id) AS n FROM requests r JOIN request_items ri ON ri.request_id = r.id ${where}
  `).get(...args).n;
  const withOffers = db.prepare(`
    SELECT COUNT(DISTINCT ri.id) AS n FROM requests r JOIN request_items ri ON ri.request_id = r.id
    JOIN offers o ON o.item_id = ri.id ${where}
  `).get(...args).n;
  const chosen = db.prepare(`
    SELECT COUNT(ri.id) AS n FROM requests r JOIN request_items ri ON ri.request_id = r.id
    ${where ? where + ' AND' : 'WHERE'} ri.winner_supplier_id IS NOT NULL
  `).get(...args).n;
  return { total_items: totalItems, with_offers: withOffers, chosen };
}

// تحويل أي مصفوفة كائنات إلى CSV
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return '\uFEFF' + lines.join('\n'); // BOM لدعم العربية في Excel
}

// تقرير كامل: كل قطعة طُلبت + الماركة + من فاز بها + سعره
function partsWinners(f = {}) {
  const where = [];
  const args = [];
  if (f.from) { where.push("r.created_at >= ?"); args.push(f.from); }
  if (f.to) { where.push("r.created_at <= ?"); args.push(f.to + ' 23:59:59'); }
  if (f.brand) { where.push("r.brand = ?"); args.push(f.brand); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(`
    SELECT
      r.created_at AS التاريخ,
      r.brand AS الماركة,
      r.model AS الموديل,
      ri.part_name AS القطعة,
      ri.part_condition AS النوع,
      ri.status AS الحالة,
      COALESCE(sup.name, '—') AS المورد_الفائز,
      wo.price AS السعر_الفائز,
      (SELECT COUNT(*) FROM offers o WHERE o.item_id = ri.id) AS عدد_العروض
    FROM request_items ri
    JOIN requests r ON r.id = ri.request_id
    LEFT JOIN suppliers sup ON sup.id = ri.winner_supplier_id
    LEFT JOIN offers wo ON wo.item_id = ri.id AND wo.supplier_id = ri.winner_supplier_id
    ${clause}
    ORDER BY r.created_at DESC
  `).all(...args);
}

module.exports = {
  topBrands, topParts, conditionBreakdown, topCustomers,
  supplierPerformance, revenue, funnel, partsWinners, toCSV
};
