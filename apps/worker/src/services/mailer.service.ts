import nodemailer from 'nodemailer';
import type { Sender } from '@rs/db';
import { logger } from '../logger.js';
import { decryptSecret } from '@rs/db';
import { env } from '../config/env.js';

export interface SendResult {
  messageId: string;
}

export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string,
  attachments: { filename: string; contentType: string; content: Uint8Array }[] = [],
): Promise<SendResult> {
  const allowedHosts = env.SMTP_ALLOWED_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (!allowedHosts.includes(sender.smtpHost.toLowerCase())) {
    throw new Error('SMTP host is not on the configured allowlist');
  }
  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    requireTLS: sender.smtpPort !== 465,
    tls: { minVersion: 'TLSv1.2' },
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: {
      user: sender.smtpUser,
      pass: decryptSecret(sender.smtpPass),
    },
  });

  const info = await transporter.sendMail({
    from: sender.fromEmail,
    to,
    subject,
    html: body,
    text: body,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(attachment.content),
    })),
  });

  // Ethereal preview URLs are bearer links; never put them in logs.
  logger.debug({ messageId: info.messageId }, 'Email sent');

  return {
    messageId: info.messageId,
  };
}
