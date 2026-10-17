import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logs can include SQL bind values such as credentials and email addresses.
    log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
export { encryptSecret, decryptSecret, encryptBytes, decryptBytes, migrateStoredSecrets } from './secrets.js';
