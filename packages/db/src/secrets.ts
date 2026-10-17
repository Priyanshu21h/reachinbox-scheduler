import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const encoded = process.env['CREDENTIALS_ENCRYPTION_KEY'];
  if (!encoded) throw new Error('CREDENTIALS_ENCRYPTION_KEY is required');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be base64 encoding of 32 random bytes');
  }
  return key;
}

export function encryptSecret(value: string): string {
  if (value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // supports one-time migration of existing plaintext rows
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
  if (payload.length < 29) throw new Error('Stored credential has an invalid encrypted format');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptBytes(value: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBytes(value: Uint8Array): Buffer {
  const payload = Buffer.from(value);
  if (payload.length < 28) throw new Error('Stored attachment has an invalid encrypted format');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

/** Encrypt legacy plaintext credentials after deployment without changing their values. */
export async function migrateStoredSecrets(prisma: PrismaClient): Promise<void> {
  const senders = await prisma.sender.findMany({ select: { id: true, smtpPass: true } });
  for (const sender of senders) {
    if (!sender.smtpPass.startsWith(PREFIX)) {
      await prisma.sender.updateMany({
        where: { id: sender.id, smtpPass: sender.smtpPass },
        data: { smtpPass: encryptSecret(sender.smtpPass) },
      });
    }
  }

  const connections = await prisma.slackConnection.findMany({ select: { id: true, webhookUrl: true } });
  for (const connection of connections) {
    if (!connection.webhookUrl.startsWith(PREFIX)) {
      await prisma.slackConnection.updateMany({
        where: { id: connection.id, webhookUrl: connection.webhookUrl },
        data: { webhookUrl: encryptSecret(connection.webhookUrl) },
      });
    }
  }
}
