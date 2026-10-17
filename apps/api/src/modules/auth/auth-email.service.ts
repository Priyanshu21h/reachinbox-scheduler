import nodemailer from 'nodemailer';
import { AppError } from '../../core/errors/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';

type AuthEmailKind = 'verify' | 'reset';

export function getAuthEmailConfig() {
  const { AUTH_EMAIL_SMTP_HOST, AUTH_EMAIL_SMTP_USER, AUTH_EMAIL_SMTP_PASS, AUTH_EMAIL_FROM } = env;
  if (!AUTH_EMAIL_SMTP_HOST || !AUTH_EMAIL_SMTP_USER || !AUTH_EMAIL_SMTP_PASS || !AUTH_EMAIL_FROM) {
    throw new AppError(503, 'AUTH_EMAIL_NOT_CONFIGURED', 'Email sign-in is unavailable until its SMTP settings are configured');
  }
  return { host: AUTH_EMAIL_SMTP_HOST, user: AUTH_EMAIL_SMTP_USER, pass: AUTH_EMAIL_SMTP_PASS, from: AUTH_EMAIL_FROM };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export async function sendAuthEmail(email: string, token: string, kind: AuthEmailKind): Promise<void> {
  const { host, user, pass, from } = getAuthEmailConfig();
  const { AUTH_EMAIL_SMTP_PORT } = env;

  const isVerification = kind === 'verify';
  const action = isVerification ? 'finish creating your ReachInbox account' : 'reset your ReachInbox password';
  const link = `${env.FRONTEND_URL}/login?flow=${isVerification ? 'verify' : 'reset'}&token=${encodeURIComponent(token)}`;
  const safeLink = escapeHtml(link);
  const transporter = nodemailer.createTransport({
    host,
    port: AUTH_EMAIL_SMTP_PORT,
    secure: AUTH_EMAIL_SMTP_PORT === 465,
    requireTLS: AUTH_EMAIL_SMTP_PORT !== 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: isVerification ? 'Verify your ReachInbox email' : 'Reset your ReachInbox password',
      text: `Use this secure link to ${action}: ${link}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
      html: `<main style="font-family:Arial,sans-serif;color:#202633;max-width:520px;margin:24px auto;padding:28px;border:1px solid #e8ebef;border-radius:12px"><h1 style="font-size:22px">${isVerification ? 'Finish setting up ReachInbox' : 'Reset your password'}</h1><p>Use the button below to ${action}.</p><p style="margin:28px 0"><a href="${safeLink}" style="padding:12px 18px;border-radius:8px;color:#fff;background:#08a64b;text-decoration:none">${isVerification ? 'Verify email' : 'Reset password'}</a></p><p style="font-size:13px;color:#687385">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p></main>`,
    });
  } catch (error) {
    logger.warn({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Authentication email delivery failed');
    throw new AppError(503, 'AUTH_EMAIL_DELIVERY_FAILED', 'Could not send the email right now. Please try again later');
  } finally {
    transporter.close();
  }
}
