import { Client } from '@elastic/elasticsearch';
import { env } from '../../config/env.js';
import { logger } from '../logger/index.js';

let esClient: Client | null = null;

export function getEsClient(): Client {
  if (!esClient) {
    esClient = new Client({ node: env.ES_NODE });
    logger.info('Elasticsearch client initialized');
  }
  return esClient;
}

const EMAILS_INDEX = 'emails';

export async function ensureEmailsIndex(): Promise<void> {
  const client = getEsClient();
  const exists = await client.indices.exists({ index: EMAILS_INDEX });

  if (!exists) {
    await client.indices.create({
      index: EMAILS_INDEX,
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            toEmail: { type: 'keyword' },
            subject: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            messageId: { type: 'keyword' },
            error: { type: 'text' },
            attempts: { type: 'integer' },
            createdAt: { type: 'date' },
          },
        },
      },
    });
    logger.info(`Created Elasticsearch index "${EMAILS_INDEX}"`);
  }
}

export interface EmailEsDoc {
  id: string;
  userId: string;
  senderId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  messageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
}

export async function indexEmail(doc: EmailEsDoc): Promise<void> {
  try {
    const client = getEsClient();
    await client.index({
      index: EMAILS_INDEX,
      id: doc.id,
      document: doc,
    });
  } catch (err) {
    logger.error({ err, emailId: doc.id }, 'Failed to index email in Elasticsearch');
  }
}

export async function updateEmailInIndex(
  id: string,
  partial: Partial<EmailEsDoc>,
): Promise<void> {
  try {
    const client = getEsClient();
    await client.update({
      index: EMAILS_INDEX,
      id,
      doc: partial,
    });
  } catch (err) {
    logger.error({ err, emailId: id }, 'Failed to update email in Elasticsearch');
  }
}

export async function searchEmails(params: {
  userId: string;
  q?: string;
  status?: string;
  page: number;
  limit: number;
}): Promise<{ hits: EmailEsDoc[]; total: number }> {
  const client = getEsClient();
  const from = (params.page - 1) * params.limit;

  const must: object[] = [{ term: { userId: params.userId } }];

  if (params.status) {
    must.push({ term: { status: params.status } });
  }

  if (params.q) {
    must.push({
      multi_match: {
        query: params.q,
        fields: ['subject', 'body', 'toEmail'],
      },
    });
  }

  const res = await client.search<EmailEsDoc>({
    index: EMAILS_INDEX,
    body: {
      query: { bool: { must } },
      sort: [{ scheduledAt: { order: 'desc' } }],
      from,
      size: params.limit,
    },
  });

  const hits = res.hits.hits
    .map((h) => h._source)
    .filter((s): s is EmailEsDoc => s !== undefined);

  const total =
    typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);

  return { hits, total };
}

export { EMAILS_INDEX };
