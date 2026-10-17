import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const EmailStatusEnum = z.enum(['SCHEDULED', 'SENDING', 'SENT', 'FAILED']);
export type EmailStatus = z.infer<typeof EmailStatusEnum>;

// ─── Queue ───────────────────────────────────────────────────────────────────

export const EMAIL_QUEUE = 'email-queue' as const;

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const ScheduleEmailSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  recipients: z
    .array(z.string().email())
    .min(1)
    .max(1_000),
  startTime: z.string().datetime(),
  delayBetweenMs: z.number().int().min(0).max(3_600_000).default(2000),
  hourlyLimit: z.number().int().min(1).max(10_000).default(200),
  senderId: z.string().cuid().optional(),
  attachments: z.array(z.object({
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(128),
    contentBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).max(11_200_000),
  })).max(5).default([]).refine((items) => items.reduce((sum, item) => sum + Math.floor(item.contentBase64.length * 3 / 4), 0) <= 8_000_000, 'Attachments must total 8 MB or less'),
});

export type ScheduleEmailDto = z.infer<typeof ScheduleEmailSchema>;

export const SenderCreateSchema = z.object({
  fromEmail: z.string().email(),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
  hourlyLimit: z.number().int().min(1).max(10_000).optional(),
});

export type SenderCreateDto = z.infer<typeof SenderCreateSchema>;

export const SenderUpdateSchema = SenderCreateSchema.partial();
export type SenderUpdateDto = z.infer<typeof SenderUpdateSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const EmailFilterSchema = PaginationSchema.extend({
  q: z.string().trim().max(320).optional(),
  from: z.string().trim().max(320).optional(),
  to: z.string().trim().max(320).optional(),
  subject: z.string().trim().max(500).optional(),
  includes: z.string().trim().max(1000).optional(),
  excludes: z.string().trim().max(1000).optional(),
  status: EmailStatusEnum.optional(),
  dateAfter: z.string().datetime().optional(),
  dateBefore: z.string().datetime().optional(),
  sizeOperator: z.enum(['greater', 'less']).optional(),
  sizeBytes: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  hasAttachment: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  starred: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

export type EmailFilterDto = z.infer<typeof EmailFilterSchema>;

export const SetEmailStarredSchema = z.object({ starred: z.boolean() });
export type SetEmailStarredDto = z.infer<typeof SetEmailStarredSchema>;

export type PaginationDto = z.infer<typeof PaginationSchema>;

export const SearchEmailsSchema = PaginationSchema.extend({
  q: z.string().optional(),
  status: EmailStatusEnum.optional(),
});

export type SearchEmailsDto = z.infer<typeof SearchEmailsSchema>;

// ─── Job Payload ─────────────────────────────────────────────────────────────

export interface SendEmailJobData {
  emailId: string;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Domain DTOs (returned from API) ─────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface SenderDto {
  id: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hourlyLimit: number | null;
  createdAt: string;
}

export interface EmailDto {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  attempts: number;
  sizeBytes: number;
  isStarred: boolean;
  attachments: { id: string; fileName: string; contentType: string; sizeBytes: number }[];
  messageId: string | null;
  error: string | null;
  createdAt: string;
  sender: {
    id: string;
    fromEmail: string;
  };
}

export interface SlackStatusDto {
  connected: boolean;
  channel: string | null;
  teamName: string | null;
}

export interface DashboardStatsDto {
  queue: {
    waiting: number;
    delayed: number;
    active: number;
    failed: number;
  };
  scheduled: number;
  sent: number;
  failed: number;
  workers: number;
}
