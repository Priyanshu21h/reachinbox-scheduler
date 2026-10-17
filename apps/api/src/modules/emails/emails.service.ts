import { prisma } from '../../core/db/index.js';
import { getEmailQueue } from '../../core/queue/index.js';
import { indexEmail } from '../../core/search/index.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/index.js';
import { logger } from '../../core/logger/index.js';
import type { EmailFilterDto, ScheduleEmailDto } from '@rs/shared';
import type { Prisma, Sender } from '@rs/db';
import { decryptBytes, encryptBytes } from '@rs/db';

const emailInclude = {
  sender: { select: { id: true, fromEmail: true } },
  attachments: {
    include: {
      attachment: { select: { id: true, fileName: true, contentType: true, sizeBytes: true } },
    },
  },
} satisfies Prisma.EmailInclude;

type EmailWithRelations = Prisma.EmailGetPayload<{ include: typeof emailInclude }>;
type EmailListItem = Omit<EmailWithRelations, 'attachments'> & {
  attachments: EmailWithRelations['attachments'][number]['attachment'][];
};

function exposeEmail(email: EmailWithRelations): EmailListItem {
  const { attachments, ...data } = email;
  return { ...data, attachments: attachments.map(({ attachment }) => attachment) };
}

export async function scheduleEmails(
  userId: string,
  dto: ScheduleEmailDto,
): Promise<EmailListItem[]> {
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
  const fileAttachments = dto.attachments.map((file) => ({
    fileName: file.fileName.replace(/[\\/\r\n\0]/g, '_').slice(0, 255),
    contentType: /^[\w.+-]+\/[\w.+-]+$/.test(file.contentType.split(';')[0]!.trim())
      ? file.contentType.split(';')[0]!.trim().slice(0, 128)
      : 'application/octet-stream',
    content: Buffer.from(file.contentBase64, 'base64'),
  }));
  const totalSizeBytes = Buffer.byteLength(dto.body, 'utf8') + fileAttachments.reduce((sum, file) => sum + file.content.byteLength, 0);

  // Build email rows; each uploaded blob is stored once and shared by this batch.
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
      hourlyLimit: dto.hourlyLimit,
      sizeBytes: totalSizeBytes,
    };
  });

  // DB transaction: insert all rows
  const emails = await prisma.$transaction(async (tx) => {
    const storedAttachments = await Promise.all(fileAttachments.map((file) => tx.storedAttachment.create({
      data: { userId, ...file, content: encryptBytes(file.content), sizeBytes: file.content.byteLength },
    })));
    const created: EmailWithRelations[] = [];
    for (const row of emailRows) {
      const email = await tx.email.create({
        data: {
          ...row,
          attachments: {
            create: storedAttachments.map((attachment) => ({ attachment: { connect: { id: attachment.id } } })),
          },
        },
        include: emailInclude,
      });
      created.push(email);
    }
    return created.map(exposeEmail);
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

export async function getEmailAttachment(userId: string, emailId: string, attachmentId: string) {
  const relation = await prisma.emailAttachment.findFirst({
    where: { emailId, attachmentId, email: { userId } },
    include: { attachment: true },
  });
  if (!relation) throw new AppError(404, 'NOT_FOUND', 'Attachment not found');
  return {
    fileName: relation.attachment.fileName,
    contentType: relation.attachment.contentType,
    content: decryptBytes(relation.attachment.content),
  };
}

export async function setEmailStarred(userId: string, emailId: string, starred: boolean): Promise<{ isStarred: boolean }> {
  const result = await prisma.email.updateMany({
    where: { id: emailId, userId },
    data: { isStarred: starred },
  });
  if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Email not found');
  return { isStarred: starred };
}

export async function listScheduledEmails(
  userId: string,
  page: number,
  limit: number,
  filters: Omit<EmailFilterDto, 'page' | 'limit'> = {},
): Promise<{ emails: EmailListItem[]; total: number }> {
  const where = buildEmailWhere(userId, 'scheduled', filters);
  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: emailInclude,
    }),
    prisma.email.count({ where }),
  ]);
  return { emails: emails.map(exposeEmail), total };
}

export async function listSentEmails(
  userId: string,
  page: number,
  limit: number,
  filters: Omit<EmailFilterDto, 'page' | 'limit'> = {},
): Promise<{ emails: EmailListItem[]; total: number }> {
  const where = buildEmailWhere(userId, 'sent', filters);
  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: emailInclude,
    }),
    prisma.email.count({ where }),
  ]);
  return { emails: emails.map(exposeEmail), total };
}

export async function listAllEmails(
  userId: string,
  page: number,
  limit: number,
  filters: Omit<EmailFilterDto, 'page' | 'limit'> = {},
): Promise<{ emails: EmailListItem[]; total: number }> {
  const where = buildEmailWhere(userId, 'all', filters);
  const [emails, total] = await Promise.all([
    prisma.email.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: emailInclude }),
    prisma.email.count({ where }),
  ]);
  return { emails: emails.map(exposeEmail), total };
}

function buildEmailWhere(
  userId: string,
  folder: 'scheduled' | 'sent' | 'all',
  filters: Omit<EmailFilterDto, 'page' | 'limit'>,
): Prisma.EmailWhereInput {
  const where: Prisma.EmailWhereInput = {
    userId,
    ...(folder === 'scheduled' ? { status: { in: ['SCHEDULED', 'SENDING'] } } : {}),
    ...(folder === 'sent' ? { status: { in: ['SENT', 'FAILED'] } } : {}),
  };
  const and: Prisma.EmailWhereInput[] = [];

  if (filters.status) where.status = filters.status;
  if (filters.from) where.sender = { fromEmail: { contains: filters.from, mode: 'insensitive' } };
  if (filters.to) where.toEmail = { contains: filters.to, mode: 'insensitive' };
  if (filters.subject) where.subject = { contains: filters.subject, mode: 'insensitive' };
  if (filters.q) {
    and.push({ OR: [
      { toEmail: { contains: filters.q, mode: 'insensitive' } },
      { subject: { contains: filters.q, mode: 'insensitive' } },
      { body: { contains: filters.q, mode: 'insensitive' } },
      { sender: { fromEmail: { contains: filters.q, mode: 'insensitive' } } },
    ] });
  }
  for (const word of (filters.includes ?? '').split(/\s+/).filter(Boolean).slice(0, 20)) {
    and.push({ OR: [
      { subject: { contains: word, mode: 'insensitive' } },
      { body: { contains: word, mode: 'insensitive' } },
    ] });
  }
  for (const word of (filters.excludes ?? '').split(/\s+/).filter(Boolean).slice(0, 20)) {
    and.push({ NOT: { OR: [
      { subject: { contains: word, mode: 'insensitive' } },
      { body: { contains: word, mode: 'insensitive' } },
    ] } });
  }

  if (filters.dateAfter || filters.dateBefore) {
    const dateRange = {
      ...(filters.dateAfter ? { gte: new Date(filters.dateAfter) } : {}),
      ...(filters.dateBefore ? { lte: new Date(filters.dateBefore) } : {}),
    };
    if (folder === 'all') {
      and.push({ OR: [
        { status: { in: ['SCHEDULED', 'SENDING'] }, scheduledAt: dateRange },
        { status: { in: ['SENT', 'FAILED'] }, sentAt: dateRange },
      ] });
    } else {
      Object.assign(where, { [folder === 'scheduled' ? 'scheduledAt' : 'sentAt']: dateRange });
    }
  }
  if (filters.sizeBytes !== undefined && filters.sizeOperator) {
    where.sizeBytes = filters.sizeOperator === 'greater' ? { gt: filters.sizeBytes } : { lt: filters.sizeBytes };
  }
  if (filters.hasAttachment !== undefined) {
    where.attachments = filters.hasAttachment ? { some: {} } : { none: {} };
  }
  if (filters.starred !== undefined) where.isStarred = filters.starred;
  if (and.length) where.AND = and;
  return where;
}
