// النسخ الاحتياطي — نسخة محلية مدوّرة + إرسال إيميل + جدولة دورية
const fs = require('node:fs');
const path = require('node:path');
const { sendBackup } = require('./email_backup');
const { logEvent, getSetting } = require('./db');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'carly.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const KEEP = 7; // عدد النسخ المحفوظة (تدوير)

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// إنشاء نسخة محلية + تدوير القديمة + إرسال إيميل
async function runBackup({ email = true } = {}) {
  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `carly-${stamp}.db`);

  // نسخة آمنة (نسخ الملف)
  fs.copyFileSync(DB_PATH, dest);

  // تدوير: احتفظ بآخر KEEP نسخة فقط
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
  while (files.length > KEEP) {
    const old = files.shift();
    fs.unlinkSync(path.join(BACKUP_DIR, old));
  }

  let emailResult = null;
  if (email) {
    try { emailResult = await sendBackup(dest); }
    catch (e) { emailResult = { ok: false, error: e.message }; }
  }

  logEvent('backup', { detail: { file: path.basename(dest), email: emailResult } });
  return { ok: true, file: path.basename(dest), size: fs.statSync(dest).size, email: emailResult };
}

// جدولة دورية (افتراضي يومي = 24 ساعة)
let timer = null;
function startSchedule() {
  const hours = parseFloat(getSetting('backup_interval_hours')) || 24;
  if (timer) clearInterval(timer);
  timer = setInterval(() => runBackup({ email: true }).catch(e => console.error('backup error', e)), hours * 3600 * 1000);
  console.log(`جدولة النسخ الاحتياطي: كل ${hours} ساعة`);
}

module.exports = { runBackup, startSchedule, DB_PATH };
