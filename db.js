// طبقة قاعدة البيانات — SQLite المدمجة في Node 22+
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'carly.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL UNIQUE,
    brands TEXT DEFAULT '',          -- ماركات مفصولة بفواصل: تويوتا,نيسان
    origins TEXT DEFAULT '',         -- مناشئ مفصولة بفواصل (تُستنتج من الماركات)
    conditions TEXT DEFAULT '',      -- أنواع: جديد أصلي,جديد تجاري,مستعمل
    status TEXT DEFAULT 'active',    -- active | reserve | inactive
    won_count INTEGER DEFAULT 0,
    balance REAL DEFAULT 0,
    allow_negative INTEGER DEFAULT 1,
    avg_reply_seconds REAL DEFAULT 0,
    avg_rating REAL DEFAULT 0,
    completion_rate REAL DEFAULT 0,
    score REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT '',
    is_workshop INTEGER DEFAULT 0,   -- 1 إذا كان العميل ورشة
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    brand TEXT,
    model TEXT,
    year INTEGER,
    vin TEXT DEFAULT '',
    status TEXT DEFAULT 'open',      -- open | collecting | chosen | closed
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    part_name TEXT,
    part_condition TEXT,             -- جديد أصلي | جديد تجاري | مستعمل
    image_url TEXT DEFAULT '',
    status TEXT DEFAULT 'open',      -- open | collecting | chosen | closed
    winner_supplier_id INTEGER,
    deadline TEXT DEFAULT '',        -- موعد انتهاء مهلة التسعير (ISO) — يُحسب لحظة البث
    expected_count INTEGER DEFAULT 0,-- عدد الموردين الذين أُرسل لهم الطلب (المتوقَّع ردهم)
    note TEXT DEFAULT '',            -- توضيح اختياري للقطعة (يمين/يسار، أمامي/خلفي...)
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (request_id) REFERENCES requests(id)
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    supplier_id INTEGER,
    price REAL,
    available INTEGER DEFAULT 1,
    reply_seconds INTEGER DEFAULT 0,
    customer_rating INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES request_items(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    request_id INTEGER,
    amount REAL,
    type TEXT,                       -- lead_fee | subscription | refund | topup | free
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- سجل كل الأحداث (أساس التقارير العميقة والأرشفة)
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,                       -- request_created | broadcast | offer_received | winner_chosen | lead_charged | otp_sent | login | backup
    request_id INTEGER,
    item_id INTEGER,
    supplier_id INTEGER,
    customer_id INTEGER,
    amount REAL DEFAULT 0,
    detail TEXT DEFAULT '',          -- JSON أو نص حر
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- توكن دائم لكل مورد (لرابط لوحته) + جلسات OTP
  CREATE TABLE IF NOT EXISTS supplier_sessions (
    token TEXT PRIMARY KEY,
    supplier_id INTEGER,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp TEXT,
    code TEXT,
    expires_at TEXT,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- تتبّع البث: أي قطعة أُرسلت لأي مورد (لربط الرد النصي بالقطعة)
  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    supplier_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ===== ترقية آمنة: إضافة أعمدة جديدة لقواعد البيانات الموجودة مسبقًا =====
// (CREATE TABLE IF NOT EXISTS لا يضيف أعمدة لجدول موجود، فنضيفها يدويًا)
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migration] أُضيف العمود ${table}.${column}`);
  }
}
ensureColumn('request_items', 'deadline', "TEXT DEFAULT ''");
ensureColumn('request_items', 'expected_count', 'INTEGER DEFAULT 0');
ensureColumn('request_items', 'note', "TEXT DEFAULT ''");
ensureColumn('requests', 'offers_notified', 'INTEGER DEFAULT 0');
const DEFAULT_SETTINGS = {
  free_leads: '2',              // أول طلبين فائزين مجانًا لكل مورد
  lead_fee: '5',               // رسوم الـ Lead للقطعة الأولى بالدرهم
  lead_fee_extra_percent: '40',// نسبة رسم كل قطعة إضافية من الأساسي (40% من 5 = 2)
  debt_cap: '50',              // سقف الدين قبل إيقاف المورد
  launch_free_until: '',       // فارغ = مرحلة الإطلاق منتهية (مربوط بالهدف لا بالتاريخ)
  launch_free_active: '1',     // 1 = الإطلاق المجاني فعّال (كل شيء مجاني)
  max_suppliers_per_brand: '8',
  score_weight_rating: '0.5',  // وزن تقييم العميل
  score_weight_completion: '0.3',
  score_weight_speed: '0.2',
  countdown_seconds: '90',
  countdown_per_item: '30',     // ثوانٍ إضافية لكل قطعة بعد الأولى
  countdown_max: '240',         // الحد الأقصى لمهلة التسعير بالثواني
  quorum_percent: '60',         // نسبة الأغلبية لإيقاف العداد مبكرًا (٪ من الموردين)
  quorum_min_seconds: '60',     // أقل وقت يمر قبل السماح بالإيقاف بالأغلبية (ثانية)
  offer_validity_minutes: '30', // مدة صلاحية العروض للعميل قبل انتهاء الطلب (دقيقة)
  backup_interval_hours: '24',  // فترة النسخ الاحتياطي التلقائي بالساعات
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, String(value), String(value));
}

// تسجيل حدث في سجل الأحداث (للأرشفة والتقارير)
function logEvent(type, fields = {}) {
  db.prepare(`
    INSERT INTO events (type, request_id, item_id, supplier_id, customer_id, amount, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    type,
    fields.request_id ?? null,
    fields.item_id ?? null,
    fields.supplier_id ?? null,
    fields.customer_id ?? null,
    fields.amount ?? 0,
    fields.detail ? (typeof fields.detail === 'string' ? fields.detail : JSON.stringify(fields.detail)) : ''
  );
}

module.exports = { db, getSetting, setSetting, logEvent };
