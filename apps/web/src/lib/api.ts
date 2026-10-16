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

export async function getScheduledEmails(page = 1, limit = 20): Promise<PaginatedEmails> {
  const { data } = await api.get<PaginatedEmails>('/emails/scheduled', {
    params: { page, limit },
  });
  return data;
}

export async function getSentEmails(page = 1, limit = 20): Promise<PaginatedEmails> {
  const { data } = await api.get<PaginatedEmails>('/emails/sent', {
    params: { page, limit },
  });
  return data;
}

export async function scheduleEmails(dto: ScheduleEmailDto): Promise<EmailDto[]> {
  const { data } = await api.post<ApiResponse<EmailDto[]>>('/emails/schedule', dto);
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
