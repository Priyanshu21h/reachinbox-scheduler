import { prisma } from '../../core/db/index.js';
import type { SenderCreateDto, SenderUpdateDto } from '@rs/shared';
import { NotFoundError, ForbiddenError } from '../../core/errors/index.js';
import nodemailer from 'nodemailer';
import { encryptSecret } from '@rs/db';
import { env } from '../../config/env.js';

function allowedSmtpHost(host: string): boolean {
  const allowed = env.SMTP_ALLOWED_HOSTS.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(host.trim().toLowerCase());
}

function toSenderDto(sender: {
  id: string; fromEmail: string; smtpHost: string; smtpPort: number; smtpUser: string;
  hourlyLimit: number | null; createdAt: Date;
}) {
  return { ...sender, createdAt: sender.createdAt.toISOString() };
}

export async function listSenders(userId: string) {
  const senders = await prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return senders.map(toSenderDto);
}

export async function getSender(id: string, userId: string) {
  const sender = await prisma.sender.findUnique({ where: { id } });
  if (!sender) throw new NotFoundError('Sender');
  if (sender.userId !== userId) throw new ForbiddenError();
  return toSenderDto(sender);
}

export async function createSender(userId: string, dto: SenderCreateDto) {
  if (!allowedSmtpHost(dto.smtpHost)) throw new ForbiddenError('SMTP host is not allowed');
  return prisma.sender.create({
    data: { userId, ...dto, smtpPass: encryptSecret(dto.smtpPass) },
    select: { id: true, fromEmail: true, smtpHost: true, smtpPort: true, smtpUser: true, hourlyLimit: true, createdAt: true },
  });
}

export async function updateSender(id: string, userId: string, dto: SenderUpdateDto) {
  const sender = await prisma.sender.findUnique({ where: { id } });
  if (!sender) throw new NotFoundError('Sender');
  if (sender.userId !== userId) throw new ForbiddenError();
  if (dto.smtpHost && !allowedSmtpHost(dto.smtpHost)) throw new ForbiddenError('SMTP host is not allowed');
  const data = { ...dto, ...(dto.smtpPass ? { smtpPass: encryptSecret(dto.smtpPass) } : {}) };
  return prisma.sender.update({ where: { id }, data, select: { id: true, fromEmail: true, smtpHost: true, smtpPort: true, smtpUser: true, hourlyLimit: true, createdAt: true } });
}

export async function deleteSender(id: string, userId: string): Promise<void> {
  await getSender(id, userId); // ownership check
  await prisma.sender.delete({ where: { id } });
}

export async function createEtherealSender(userId: string) {
  const testAccount = await nodemailer.createTestAccount();
  return prisma.sender.create({
    data: {
      userId,
      fromEmail: testAccount.user,
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: testAccount.user,
      smtpPass: encryptSecret(testAccount.pass),
      hourlyLimit: null,
    },
    select: { id: true, fromEmail: true, smtpHost: true, smtpPort: true, smtpUser: true, hourlyLimit: true, createdAt: true },
  });
}
