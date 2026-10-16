import { prisma } from '../../core/db/index.js';
import { getEmailQueue } from '../../core/queue/index.js';
import { indexEmail } from '../../core/search/index.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/index.js';
import { logger } from '../../core/logger/index.js';
import type { ScheduleEmailDto } from '@rs/shared';
import type { Email, Sender } from '@rs/db';

export async function scheduleEmails(
  userId: string,
  dto: ScheduleEmailDto,
): Promise<Email[]> {
  const queue = getEmailQueue();

  // Resolve senders
  let senders: Sender[];
  if (dto.senderId) {
    const s = await prisma.sender.findUnique({ where: { id: dto.senderId } });
    if (!s || s.userId !== userId) {
      throw new AppError(404, 'NOT_FOUND', 'Sender not found');
    }
    senders = [s];
  } else {
    senders = await prisma.sender.findMany({ where: { userId } });
    if (senders.length === 0) {
      throw new AppError(
        400,
        'NO_SENDERS',
        'No senders configured. Create a sender first or use the /senders/ethereal endpoint.',
      );
    }
  }

  const startTime = new Date(dto.startTime);
  const now = Date.now();

  // Build email rows
  const emailRows = dto.recipients.map((toEmail, index) => {
    const senderIndex = index % senders.length;
    const sender = senders[senderIndex]!;
    const scheduledAt = new Date(startTime.getTime() + index * dto.delayBetweenMs);
    return {
      userId,
      senderId: sender.id,
      toEmail,
      subject: dto.subject,
      body: dto.body,
      scheduledAt,
    };
  });

  // DB transaction: insert all rows
  const emails = await prisma.$transaction(async (tx) => {
    const created: Email[] = [];
    for (const row of emailRows) {
      const email = await tx.email.create({ data: row });
      created.push(email);
    }
    return created;
  });

  logger.info({ count: emails.length, userId }, 'Scheduled emails inserted in DB');

  // BullMQ addBulk — jobId = email.id makes duplicate enqueues no-ops
  const jobs = emails.map((email) => ({
    name: 'send-email' as const,
    data: { emailId: email.id },
    opts: {
      jobId: email.id,
      delay: Math.max(0, email.scheduledAt.getTime() - now),
      attempts: env.MAX_ATTEMPTS,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 7 * 86400, count: 5000 },
    },
  }));

  await queue.addBulk(jobs);
  logger.info({ count: jobs.length }, 'BullMQ jobs enqueued');

  // Index in Elasticsearch (fire-and-forget)
  for (const email of emails) {
    indexEmail({
      id: email.id,
      userId: email.userId,
      senderId: email.senderId,
      toEmail: email.toEmail,
      subject: email.subject,
      body: email.body,
      status: email.status,
      scheduledAt: email.scheduledAt.toISOString(),
      sentAt: email.sentAt?.toISOString() ?? null,
      messageId: email.messageId,
      error: email.error,
      attempts: email.attempts,
      createdAt: email.createdAt.toISOString(),
    }).catch((err: unknown) =>
      logger.warn({ err, emailId: email.id }, 'ES indexing failed (non-critical)'),
    );
  }

  return emails;
}

export async function listScheduledEmails(
  userId: string,
  page: number,
  limit: number,
): Promise<{ emails: Email[]; total: number }> {
  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: { userId, status: { in: ['SCHEDULED', 'SENDING'] } },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { sender: { select: { id: true, fromEmail: true } } },
    }),
    prisma.email.count({
      where: { userId, status: { in: ['SCHEDULED', 'SENDING'] } },
    }),
  ]);
  return { emails, total };
}

export async function listSentEmails(
  userId: string,
  page: number,
  limit: number,
): Promise<{ emails: Email[]; total: number }> {
  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: { userId, status: { in: ['SENT', 'FAILED'] } },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { sender: { select: { id: true, fromEmail: true } } },
    }),
    prisma.email.count({
      where: { userId, status: { in: ['SENT', 'FAILED'] } },
    }),
  ]);
  return { emails, total };
}
