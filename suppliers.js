// منطق الموردين
const { db, getSetting } = require('./db');
const { originForBrand } = require('./brands');

function csvClean(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

// استنتاج المناشئ تلقائيًا من قائمة الماركات
function deriveOrigins(brandsCsv) {
  const set = new Set();
  for (const b of csvClean(brandsCsv)) {
    const o = originForBrand(b);
    if (o) set.add(o);
  }
  return [...set].join(',');
}

function addSupplier({ name, whatsapp, brands, conditions, status }) {
  const origins = deriveOrigins(brands);
  const stmt = db.prepare(`
    INSERT INTO suppliers (name, whatsapp, brands, origins, conditions, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    name.trim(),
    whatsapp.trim(),
    csvClean(brands).join(','),
    origins,
    csvClean(conditions).join(','),
    status || 'active'
  );
  return getSupplier(info.lastInsertRowid);
}

function updateSupplier(id, fields) {
  const cur = getSupplier(id);
  if (!cur) return null;
  const brands = fields.brands !== undefined ? csvClean(fields.brands).join(',') : cur.brands;
  const origins = fields.brands !== undefined ? deriveOrigins(fields.brands) : cur.origins;
  const conditions = fields.conditions !== undefined ? csvClean(fields.conditions).join(',') : cur.conditions;
  db.prepare(`
    UPDATE suppliers SET name=?, whatsapp=?, brands=?, origins=?, conditions=?, status=? WHERE id=?
  `).run(
    fields.name ?? cur.name,
    fields.whatsapp ?? cur.whatsapp,
    brands, origins, conditions,
    fields.status ?? cur.status,
    id
  );
  return getSupplier(id);
}

function getSupplier(id) {
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

function listSuppliers(filter = {}) {
  let sql = 'SELECT * FROM suppliers WHERE 1=1';
  const args = [];
  if (filter.status) { sql += ' AND status = ?'; args.push(filter.status); }
  sql += ' ORDER BY score DESC, created_at DESC';
  return db.prepare(sql).all(...args);
}

function deleteSupplier(id) {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
}

// الموردون المؤهلون لاستقبال طلب معيّن: يطابقون الماركة + النوع + نشطون
// مرتبون بالـ Score، ومحدودون بسقف الماركة
function eligibleSuppliers(brand, condition) {
  const max = parseInt(getSetting('max_suppliers_per_brand'), 10) || 8;
  const all = db.prepare("SELECT * FROM suppliers WHERE status = 'active' ORDER BY score DESC").all();
  const matched = all.filter(s => {
    const brands = csvClean(s.brands);
    const conds = csvClean(s.conditions);
    const brandOk = brands.includes(brand);
    const condOk = condition ? conds.includes(condition) : true;
    return brandOk && condOk;
  });
  return matched.slice(0, max);
}

// حساب درجة الأداء من العروض التاريخية
function recomputeScore(supplierId) {
  const wRating = parseFloat(getSetting('score_weight_rating')) || 0.5;
  const wComp = parseFloat(getSetting('score_weight_completion')) || 0.3;
  const wSpeed = parseFloat(getSetting('score_weight_speed')) || 0.2;

  const stats = db.prepare(`
    SELECT
      AVG(NULLIF(reply_seconds,0)) AS avg_reply,
      AVG(NULLIF(customer_rating,0)) AS avg_rating,
      COUNT(*) AS total_offers
    FROM offers WHERE supplier_id = ?
  `).get(supplierId);

  const avgReply = stats.avg_reply || 90;
  const avgRating = stats.avg_rating || 0;

  // نسبة الالتزام: كم فاز وأتمّ مقابل كم فاز
  const sup = getSupplier(supplierId);
  const completion = sup && sup.won_count > 0 ? Math.min(1, (sup.won_count) / (sup.won_count)) : 0;

  // تطبيع: السرعة كلما أقل أفضل (90ث = أسوأ، 5ث = أفضل)
  const speedNorm = Math.max(0, Math.min(1, (90 - avgReply) / 85));
  const ratingNorm = avgRating / 5;

  const score = (ratingNorm * wRating + completion * wComp + speedNorm * wSpeed) * 100;

  db.prepare('UPDATE suppliers SET avg_reply_seconds=?, avg_rating=?, completion_rate=?, score=? WHERE id=?')
    .run(avgReply, avgRating, completion, Math.round(score * 10) / 10, supplierId);

  return getSupplier(supplierId);
}

module.exports = {
  addSupplier, updateSupplier, getSupplier, listSuppliers,
  deleteSupplier, eligibleSuppliers, recomputeScore, deriveOrigins, csvClean
};
