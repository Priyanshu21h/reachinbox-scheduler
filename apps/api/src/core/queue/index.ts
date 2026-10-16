import { Queue, QueueEvents } from 'bullmq';
import { EMAIL_QUEUE, type SendEmailJobData } from '@rs/shared';
import { getRedis } from '../redis/index.js';
import { logger } from '../logger/index.js';

let emailQueueInstance: Queue<SendEmailJobData> | null = null;
let emailQueueEventsInstance: QueueEvents | null = null;

export function getEmailQueue(): Queue<SendEmailJobData> {
  if (!emailQueueInstance) {
    emailQueueInstance = new Queue<SendEmailJobData>(EMAIL_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 7 * 86400, count: 5000 },
      },
    });
    logger.info(`BullMQ queue "${EMAIL_QUEUE}" initialized`);
  }
  return emailQueueInstance;
}

export function getEmailQueueEvents(): QueueEvents {
  if (!emailQueueEventsInstance) {
    emailQueueEventsInstance = new QueueEvents(EMAIL_QUEUE, {
      connection: getRedis(),
    });
  }
  return emailQueueEventsInstance;
}

export async function closeQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
    logger.info('Email queue closed');
  }
  if (emailQueueEventsInstance) {
    await emailQueueEventsInstance.close();
    emailQueueEventsInstance = null;
  }
}
