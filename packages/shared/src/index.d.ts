import { z } from 'zod';
export declare const EmailStatusEnum: z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED"]>;
export type EmailStatus = z.infer<typeof EmailStatusEnum>;
export declare const EMAIL_QUEUE: "email-queue";
export declare const ScheduleEmailSchema: z.ZodObject<{
    subject: z.ZodString;
    body: z.ZodString;
    recipients: z.ZodArray<z.ZodString, "many">;
    startTime: z.ZodString;
    delayBetweenMs: z.ZodDefault<z.ZodNumber>;
    hourlyLimit: z.ZodDefault<z.ZodNumber>;
    senderId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    body: string;
    subject: string;
    recipients: string[];
    startTime: string;
    delayBetweenMs: number;
    hourlyLimit: number;
    senderId?: string | undefined;
}, {
    body: string;
    subject: string;
    recipients: string[];
    startTime: string;
    delayBetweenMs?: number | undefined;
    hourlyLimit?: number | undefined;
    senderId?: string | undefined;
}>;
export type ScheduleEmailDto = z.infer<typeof ScheduleEmailSchema>;
export declare const SenderCreateSchema: z.ZodObject<{
    fromEmail: z.ZodString;
    smtpHost: z.ZodString;
    smtpPort: z.ZodNumber;
    smtpUser: z.ZodString;
    smtpPass: z.ZodString;
    hourlyLimit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    hourlyLimit?: number | undefined;
}, {
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    hourlyLimit?: number | undefined;
}>;
export type SenderCreateDto = z.infer<typeof SenderCreateSchema>;
export declare const SenderUpdateSchema: z.ZodObject<{
    fromEmail: z.ZodOptional<z.ZodString>;
    smtpHost: z.ZodOptional<z.ZodString>;
    smtpPort: z.ZodOptional<z.ZodNumber>;
    smtpUser: z.ZodOptional<z.ZodString>;
    smtpPass: z.ZodOptional<z.ZodString>;
    hourlyLimit: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    hourlyLimit?: number | undefined;
    fromEmail?: string | undefined;
    smtpHost?: string | undefined;
    smtpPort?: number | undefined;
    smtpUser?: string | undefined;
    smtpPass?: string | undefined;
}, {
    hourlyLimit?: number | undefined;
    fromEmail?: string | undefined;
    smtpHost?: string | undefined;
    smtpPort?: number | undefined;
    smtpUser?: string | undefined;
    smtpPass?: string | undefined;
}>;
export type SenderUpdateDto = z.infer<typeof SenderUpdateSchema>;
export declare const PaginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
}, {
    page?: number | undefined;
    limit?: number | undefined;
}>;
export type PaginationDto = z.infer<typeof PaginationSchema>;
export declare const SearchEmailsSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
} & {
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["SCHEDULED", "SENDING", "SENT", "FAILED"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | undefined;
    q?: string | undefined;
}, {
    status?: "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    q?: string | undefined;
}>;
export type SearchEmailsDto = z.infer<typeof SearchEmailsSchema>;
export interface SendEmailJobData {
    emailId: string;
}
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
//# sourceMappingURL=index.d.ts.map
