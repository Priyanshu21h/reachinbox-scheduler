import axios from 'axios';
import type {
  ApiResponse,
  UserDto,
  EmailDto,
  SenderDto,
  SlackStatusDto,
  ScheduleEmailDto,
  SenderCreateDto,
} from '@rs/shared';

const api = axios.create({
  baseURL: 'http://localhost:4000',
  withCredentials: true,
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getMe(): Promise<UserDto> {
  const { data } = await api.get<ApiResponse<UserDto>>('/auth/me');
  return data.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export async function requestEmailRegistration(email: string): Promise<void> {
  await api.post('/auth/email/register', { email });
}

export async function completeEmailRegistration(input: { token: string; name: string; password: string }): Promise<AuthUser> {
  const { data } = await api.post<ApiResponse<AuthUser>>('/auth/email/register/complete', input);
  return data.data;
}

export async function loginWithEmail(input: { email: string; password: string }): Promise<AuthUser> {
  const { data } = await api.post<ApiResponse<AuthUser>>('/auth/email/login', input);
  return data.data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/email/password-reset', { email });
}

export async function completePasswordReset(input: { token: string; password: string }): Promise<void> {
  await api.post('/auth/email/password-reset/complete', input);
}

// ─── Senders ──────────────────────────────────────────────────────────────────

export async function getSenders(): Promise<SenderDto[]> {
  const { data } = await api.get<ApiResponse<SenderDto[]>>('/senders');
  return data.data;
}

export async function createSender(dto: SenderCreateDto): Promise<SenderDto> {
  const { data } = await api.post<ApiResponse<SenderDto>>('/senders', dto);
  return data.data;
}

export async function createEtherealSender(): Promise<SenderDto> {
  const { data } = await api.post<ApiResponse<SenderDto>>('/senders/ethereal');
  return data.data;
}

export async function deleteSender(id: string): Promise<void> {
  await api.delete(`/senders/${id}`);
}

// ─── Emails ───────────────────────────────────────────────────────────────────

export interface PaginatedEmails {
  data: EmailDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmailQueryFilters {
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  includes?: string;
  excludes?: string;
  status?: 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  dateAfter?: string;
  dateBefore?: string;
  sizeOperator?: 'greater' | 'less';
  sizeBytes?: number;
  hasAttachment?: 'true' | 'false';
  starred?: 'true' | 'false';
}

export async function getScheduledEmails(page = 1, limit = 20, filters: EmailQueryFilters = {}): Promise<PaginatedEmails> {
  const { data } = await api.get<PaginatedEmails>('/emails/scheduled', {
    params: { page, limit, ...filters },
  });
  return data;
}

export async function getSentEmails(page = 1, limit = 20, filters: EmailQueryFilters = {}): Promise<PaginatedEmails> {
  const { data } = await api.get<PaginatedEmails>('/emails/sent', {
    params: { page, limit, ...filters },
  });
  return data;
}

export async function getAllEmails(page = 1, limit = 20, filters: EmailQueryFilters = {}): Promise<PaginatedEmails> {
  const { data } = await api.get<PaginatedEmails>('/emails/all', { params: { page, limit, ...filters } });
  return data;
}

export async function downloadEmailAttachment(emailId: string, attachmentId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`, { responseType: 'blob' });
  return data;
}

export async function setEmailStarred(emailId: string, starred: boolean): Promise<{ isStarred: boolean }> {
  const { data } = await api.patch<ApiResponse<{ isStarred: boolean }>>(`/emails/${encodeURIComponent(emailId)}/star`, { starred });
  return data.data;
}

export async function scheduleEmails(dto: ScheduleEmailDto): Promise<EmailDto[]> {
  const { data } = await api.post<ApiResponse<EmailDto[]>>('/emails/schedule', dto);
  return data.data;
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
  scheduled: number;
  sent: number;
  failed: number;
  queue: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<ApiResponse<DashboardStats>>('/stats');
  return data.data;
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export async function getSlackStatus(): Promise<SlackStatusDto> {
  const { data } = await api.get<ApiResponse<SlackStatusDto>>('/slack/status');
  return data.data;
}

export async function disconnectSlack(): Promise<void> {
  await api.delete('/slack/disconnect');
}

export { api };
