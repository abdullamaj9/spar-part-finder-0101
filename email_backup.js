// طبقة الإيميل للنسخ الاحتياطي — mock (اختبار) / gmail (إنتاج)
// المفاتيح من متغيرات البيئة، لا تُكتب في الكود إطلاقًا
const fs = require('node:fs');
const path = require('node:path');

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'mock';   // mock | gmail
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || ''; // يُضبط على Render فقط
const BACKUP_TO = process.env.BACKUP_EMAIL || 'carllymotors@gmail.com';

async function sendBackup(dbPath) {
  const filename = `carly-backup-${new Date().toISOString().slice(0, 10)}.db`;

  if (EMAIL_PROVIDER === 'mock') {
    const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    console.log(`[Email mock] نسخة احتياطية (${size} بايت) كانت سترسل إلى ${BACKUP_TO} باسم ${filename}`);
    return { ok: true, mock: true, to: BACKUP_TO, filename };
  }

  if (EMAIL_PROVIDER === 'gmail') {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: GMAIL_USER,
      to: BACKUP_TO,
      subject: `نسخة احتياطية كارلي — ${new Date().toLocaleString('ar')}`,
      text: 'مرفق النسخة الاحتياطية لقاعدة بيانات كارلي.',
      attachments: [{ filename, path: dbPath }],
    });
    return { ok: true, to: BACKUP_TO, filename };
  }

  throw new Error('مزوّد إيميل غير معروف: ' + EMAIL_PROVIDER);
}

module.exports = { sendBackup, BACKUP_TO, EMAIL_PROVIDER };
