import { prisma } from '@rs/db';
import { logger } from '../logger/index.js';

export { prisma };

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to PostgreSQL via Prisma');
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from PostgreSQL');
}
