import { prisma } from '../../core/db/index.js';
import type { SenderCreateDto, SenderUpdateDto } from '@rs/shared';
import { NotFoundError, ForbiddenError } from '../../core/errors/index.js';
import nodemailer from 'nodemailer';

export async function listSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSender(id: string, userId: string) {
  const sender = await prisma.sender.findUnique({ where: { id } });
  if (!sender) throw new NotFoundError('Sender');
  if (sender.userId !== userId) throw new ForbiddenError();
  return sender;
}

export async function createSender(userId: string, dto: SenderCreateDto) {
  return prisma.sender.create({
    data: { userId, ...dto },
  });
}

export async function updateSender(id: string, userId: string, dto: SenderUpdateDto) {
  await getSender(id, userId); // ownership check
  return prisma.sender.update({ where: { id }, data: dto });
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
      smtpPass: testAccount.pass,
      hourlyLimit: null,
    },
  });
}
