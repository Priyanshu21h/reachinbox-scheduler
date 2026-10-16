"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchEmailsSchema = exports.PaginationSchema = exports.SenderUpdateSchema = exports.SenderCreateSchema = exports.ScheduleEmailSchema = exports.EMAIL_QUEUE = exports.EmailStatusEnum = void 0;
const zod_1 = require("zod");
// ─── Enums ───────────────────────────────────────────────────────────────────
exports.EmailStatusEnum = zod_1.z.enum(['SCHEDULED', 'SENDING', 'SENT', 'FAILED']);
// ─── Queue ───────────────────────────────────────────────────────────────────
exports.EMAIL_QUEUE = 'email-queue';
// ─── Schemas ─────────────────────────────────────────────────────────────────
exports.ScheduleEmailSchema = zod_1.z.object({
    subject: zod_1.z.string().min(1).max(500),
    body: zod_1.z.string().min(1).max(100_000),
    recipients: zod_1.z
        .array(zod_1.z.string().email())
        .min(1)
        .max(10_000),
    startTime: zod_1.z.string().datetime(),
    delayBetweenMs: zod_1.z.number().int().min(0).max(3_600_000).default(2000),
    hourlyLimit: zod_1.z.number().int().min(1).max(10_000).default(200),
    senderId: zod_1.z.string().cuid().optional(),
});
exports.SenderCreateSchema = zod_1.z.object({
    fromEmail: zod_1.z.string().email(),
    smtpHost: zod_1.z.string().min(1),
    smtpPort: zod_1.z.number().int().min(1).max(65535),
    smtpUser: zod_1.z.string().min(1),
    smtpPass: zod_1.z.string().min(1),
    hourlyLimit: zod_1.z.number().int().min(1).max(10_000).optional(),
});
exports.SenderUpdateSchema = exports.SenderCreateSchema.partial();
exports.PaginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
exports.SearchEmailsSchema = exports.PaginationSchema.extend({
    q: zod_1.z.string().optional(),
    status: exports.EmailStatusEnum.optional(),
});
//# sourceMappingURL=index.js.map