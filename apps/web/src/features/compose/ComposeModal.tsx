import { useState, useRef, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { getSenders, scheduleEmails, createEtherealSender } from '../../lib/api';
import type { ScheduleEmailDto } from '@rs/shared';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ComposeModal({ isOpen, onClose }: ComposeModalProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    subject: '',
    body: '',
    startTime: getLocalDatetimeValue(new Date(Date.now() + 5 * 60_000)),
    delayBetweenMs: '2000',
    hourlyLimit: '200',
    senderId: '',
  });

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [fileEmailCount, setFileEmailCount] = useState(0);

  const { data: senders = [] } = useQuery({
    queryKey: ['senders'],
    queryFn: getSenders,
    enabled: isOpen,
  });

  const createEtherealMutation = useMutation({
    mutationFn: createEtherealSender,
    onSuccess: (sender) => {
      qc.invalidateQueries({ queryKey: ['senders'] }).catch(() => {});
      setForm((f) => ({ ...f, senderId: sender.id }));
      toast.success(`Ethereal sender created: ${sender.fromEmail}`);
    },
    onError: () => toast.error('Failed to create Ethereal sender'),
  });

  const scheduleMutation = useMutation({
    mutationFn: scheduleEmails,
    onSuccess: (emails) => {
      toast.success(`${emails.length} email(s) scheduled!`);
      qc.invalidateQueries({ queryKey: ['scheduled-emails'] }).catch(() => {});
      onClose();
      resetForm();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to schedule emails';
      toast.error(msg);
    },
  });

  function resetForm() {
    setForm({
      subject: '',
      body: '',
      startTime: getLocalDatetimeValue(new Date(Date.now() + 5 * 60_000)),
      delayBetweenMs: '2000',
      hourlyLimit: '200',
      senderId: '',
    });
    setRecipients([]);
    setRecipientInput('');
    setFileEmailCount(0);
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const emails: string[] = [];
        results.data.forEach((row) => {
          Object.values(row).forEach((val) => {
            const trimmed = val.trim();
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
              emails.push(trimmed);
            }
          });
        });
        // Also try treating file as plain text if no CSV columns match
        if (emails.length === 0 && results.data.length > 0) {
          results.data.forEach((row) => {
            const first = Object.values(row)[0]?.trim() ?? '';
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) emails.push(first);
          });
        }
        const unique = [...new Set(emails)];
        setRecipients(unique);
        setFileEmailCount(unique.length);
        toast.success(`${unique.length} email address(es) detected from file`);
      },
      error: () => toast.error('Failed to parse CSV file'),
    });
    e.target.value = '';
  }

  function handleRecipientInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addManualRecipient();
    }
  }

  function addManualRecipient() {
    const emails = recipientInput
      .split(/[,\n\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (emails.length > 0) {
      setRecipients((prev) => [...new Set([...prev, ...emails])]);
      setRecipientInput('');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allRecipients = [...recipients];
    if (recipientInput.trim()) {
      const extras = recipientInput.split(/[,\n\s]+/).map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      allRecipients.push(...extras);
    }
    const unique = [...new Set(allRecipients)];
    if (unique.length === 0) {
      toast.error('Add at least one recipient');
      return;
    }

    const dto: ScheduleEmailDto = {
      subject: form.subject,
      body: form.body,
      recipients: unique,
      startTime: new Date(form.startTime).toISOString(),
      delayBetweenMs: parseInt(form.delayBetweenMs, 10),
      hourlyLimit: parseInt(form.hourlyLimit, 10),
      senderId: form.senderId || undefined,
    };

    scheduleMutation.mutate(dto);
  }

  const totalRecipients = recipients.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compose New Email" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Subject */}
        <Input
          id="compose-subject"
          label="Subject"
          placeholder="Your email subject..."
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          required
        />

        {/* Body */}
        <Textarea
          id="compose-body"
          label="Email Body"
          placeholder="Write your email content here..."
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={5}
          required
        />

        {/* Recipients */}
        <div>
          <label className="label">Recipients</label>
          <div className="space-y-2">
            {/* File upload */}
            <div
              className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-brand-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                id="recipient-file"
              />
              <svg className="w-6 h-6 mx-auto mb-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm text-slate-400">
                {fileEmailCount > 0
                  ? <span className="text-brand-400 font-medium">{fileEmailCount} email address(es) detected from file</span>
                  : 'Drop CSV/TXT or click to upload'}
              </p>
            </div>

            {/* Manual input */}
            <div className="flex gap-2">
              <input
                id="compose-recipient-input"
                className="input-field flex-1"
                placeholder="type@email.com, another@email.com"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientInputKeyDown}
                onBlur={addManualRecipient}
              />
            </div>

            {totalRecipients > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-400 font-medium">{totalRecipients} recipient(s) total</span>
                <button
                  type="button"
                  onClick={() => { setRecipients([]); setFileEmailCount(0); }}
                  className="text-slate-500 hover:text-red-400 transition-colors text-xs"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Schedule settings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            id="compose-start-time"
            label="Start Time"
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            required
          />
          <Input
            id="compose-delay"
            label="Delay between (ms)"
            type="number"
            min="0"
            value={form.delayBetweenMs}
            onChange={(e) => setForm((f) => ({ ...f, delayBetweenMs: e.target.value }))}
          />
          <Input
            id="compose-hourly-limit"
            label="Hourly limit"
            type="number"
            min="1"
            value={form.hourlyLimit}
            onChange={(e) => setForm((f) => ({ ...f, hourlyLimit: e.target.value }))}
          />
        </div>

        {/* Sender */}
        <div>
          <label htmlFor="compose-sender" className="label">Sender</label>
          <div className="flex gap-2">
            <select
              id="compose-sender"
              className="input-field flex-1"
              value={form.senderId}
              onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value }))}
            >
              <option value="">Round-robin (all senders)</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.fromEmail}</option>
              ))}
            </select>
            {senders.length === 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => createEtherealMutation.mutate()}
                isLoading={createEtherealMutation.isPending}
                id="create-ethereal-btn"
              >
                + Ethereal
              </Button>
            )}
          </div>
          {senders.length === 0 && (
            <p className="text-xs text-amber-400 mt-1">
              ⚠ No senders. Click "+ Ethereal" to create a free test sender.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={scheduleMutation.isPending}
            id="schedule-submit-btn"
          >
            Schedule {totalRecipients > 0 ? `${totalRecipients} email(s)` : 'Email'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
