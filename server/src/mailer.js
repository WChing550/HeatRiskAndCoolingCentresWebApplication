import 'dotenv/config';
import nodemailer from 'nodemailer';

// True when SMTP_USER / SMTP_PASS are still empty or the example placeholders.
const notConfigured = () => {
  const u = process.env.SMTP_USER || '';
  const p = process.env.SMTP_PASS || '';
  return !process.env.SMTP_HOST || !u || !p || u.startsWith('youractual') || p.startsWith('your16');
};

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 587 uses STARTTLS automatically
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends one email. THROWS if sending fails, so callers can decide what to do.
 * In development, when SMTP is not configured yet, the email is printed to the
 * server terminal instead (so you can still click the link while testing).
 */
export async function sendMail({ to, subject, html, text }) {
  if (notConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS).');
    }
    console.log(`\n[mail:dev] SMTP not configured - email NOT sent. Would have sent to ${to}:\n  Subject: ${subject}\n  ${text}\n`);
    return { dev: true };
  }
  const info = await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
  console.log(`[mail] sent "${subject}" to ${to} (${info.messageId})`);
  return info;
}

// Call once at startup so a wrong App Password shows up immediately.
export function verifyMailer() {
  if (notConfigured()) {
    console.warn('[mail] SMTP not configured yet - emails will be printed in this terminal instead of sent.');
    return;
  }
  getTransporter()
    .verify()
    .then(() => console.log('[mail] SMTP ready'))
    .catch((err) => console.error('[mail] SMTP error:', err.message));
}
