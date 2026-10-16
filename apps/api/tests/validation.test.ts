import { describe, it, expect } from 'vitest';
import { ScheduleEmailSchema, SenderCreateSchema, SearchEmailsSchema } from '@rs/shared';

describe('API DTO Validation', () => {
  describe('ScheduleEmailSchema', () => {
    it('accepts valid schedule requests with multiple recipients', () => {
      const valid = {
        recipients: ['user1@example.com', 'user2@example.com'],
        subject: 'Product Update',
        body: '<p>Hello world!</p>',
        startTime: new Date(Date.now() + 60000).toISOString(),
        delayBetweenMs: 2000,
      };

      const result = ScheduleEmailSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid recipient email addresses', () => {
      const invalid = {
        recipients: ['not-an-email'],
        subject: 'Hello',
        body: 'Body',
        startTime: new Date().toISOString(),
        delayBetweenEmailsMs: 1000,
      };

      const result = ScheduleEmailSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects negative delay between emails', () => {
      const invalid = {
        recipients: ['test@example.com'],
        subject: 'Hello',
        body: 'Body',
        startTime: new Date().toISOString(),
        delayBetweenMs: -500,
      };

      const result = ScheduleEmailSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SenderCreateSchema', () => {
    it('validates custom SMTP credentials', () => {
      const valid = {
        fromEmail: 'sender@mycompany.com',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'ethereal_user',
        smtpPass: 'ethereal_pass',
        hourlyLimit: 50,
      };

      const result = SenderCreateSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid SMTP port', () => {
      const invalid = {
        fromEmail: 'sender@mycompany.com',
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 999999, // out of range
        smtpUser: 'ethereal_user',
        smtpPass: 'ethereal_pass',
      };

      const result = SenderCreateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SearchEmailsSchema', () => {
    it('coerces string page and limit parameters to integers', () => {
      const query = {
        page: '2',
        limit: '25',
        q: 'urgent',
        status: 'SCHEDULED',
      };

      const result = SearchEmailsSchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(25);
        expect(result.data.q).toBe('urgent');
        expect(result.data.status).toBe('SCHEDULED');
      }
    });
  });
});
