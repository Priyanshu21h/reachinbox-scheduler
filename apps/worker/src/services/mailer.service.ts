import nodemailer from 'nodemailer';
import type { Sender } from '@rs/db';
import { logger } from '../logger.js';

export interface SendResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
  });

  const info = await transporter.sendMail({
    from: sender.fromEmail,
    to,
    subject,
    html: body,
    text: body,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.debug({ messageId: info.messageId, previewUrl, to }, 'Email sent');

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
