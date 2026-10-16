import { Client } from '@elastic/elasticsearch';
import { logger } from './logger.js';

let esClient: Client | null = null;

function getEs(): Client {
  if (!esClient) {
    esClient = new Client({
      node: process.env['ES_NODE'] ?? 'http://localhost:9200',
    });
  }
  return esClient;
}

export function updateEmailInEs(
  id: string,
  partial: Record<string, unknown>,
): void {
  getEs()
    .update({ index: 'emails', id, doc: partial })
    .catch((err: unknown) =>
      logger.warn({ err, emailId: id }, 'ES update failed (non-critical)'),
    );
}
