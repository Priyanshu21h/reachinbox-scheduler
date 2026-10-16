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
    .max(10_000),
  startTime: z.string().datetime(),
  delayBetweenMs: z.number().int().min(0).max(3_600_000).default(2000),
  hourlyLimit: z.number().int().min(1).max(10_000).default(200),
  senderId: z.string().cuid().optional(),
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
