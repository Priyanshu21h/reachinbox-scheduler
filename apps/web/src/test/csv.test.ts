import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';

describe('CSV Recipient Parsing', () => {
  it('extracts recipient email addresses from CSV rows', () => {
    const csvContent = `email,name
alice@example.com,Alice
bob@example.com,Bob
charlie@example.com,Charlie`;

    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    expect(parsed.data).toHaveLength(3);

    const emails = (parsed.data as Array<Record<string, string>>)
      .map((row) => row['email'] || row['Email'] || '')
      .filter((e): e is string => Boolean(e) && e.includes('@'));

    expect(emails).toEqual([
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
    ]);
  });

  it('handles headerless CSV with single column', () => {
    const csvContent = `user1@example.com\nuser2@example.com\nuser3@example.com`;
    const parsed = Papa.parse(csvContent, { header: false, skipEmptyLines: true });

    const emails = (parsed.data as string[][])
      .flat()
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    expect(emails).toHaveLength(3);
    expect(emails[0]).toBe('user1@example.com');
  });
});
