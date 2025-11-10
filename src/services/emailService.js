import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

function ensureTransporter() {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP configuration missing (SMTP_HOST/SMTP_USER/SMTP_PASS).');
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  return transporter;
}

export async function sendEmail(to, subject, text) {
  const mailer = ensureTransporter();

  await mailer.sendMail({
    from: `"${env.APP_NAME}" <${env.SMTP_FROM_EMAIL || env.SMTP_USER}>`,
    to,
    subject,
    text
  });
}
