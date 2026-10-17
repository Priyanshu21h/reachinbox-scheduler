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

function readAttachment(file: File): Promise<{ fileName: string; contentType: string; contentBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      resolve({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8_000_000;

export default function ComposeModal({ isOpen, onClose }: ComposeModalProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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
  const [isFileHovering, setIsFileHovering] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

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
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] }).catch(() => {});
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
    setAttachments([]);
  }

  function parseRecipientFile(file?: File) {
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const emails = results.data
          .flatMap((row) => Object.values(row ?? {}))
          .flatMap((value) => (value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
          .map((email) => email.toLowerCase());
        const unique = [...new Set(emails)];
        setRecipients(unique);
        setFileEmailCount(unique.length);
        if (unique.length) toast.success(`${unique.length} email address(es) detected from file`);
        else toast.error('No valid email addresses found in that file');
      },
      error: () => toast.error('Failed to parse CSV file'),
    });
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    parseRecipientFile(e.target.files?.[0]);
    e.target.value = '';
  }

  function handleDropFile(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsFileHovering(false);
    const file = e.dataTransfer.files[0];
    if (file && !/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Choose a CSV or TXT file');
      return;
    }
    parseRecipientFile(file);
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

  function addAttachmentFiles(files: FileList | File[]) {
    const next = [...attachments, ...Array.from(files)];
    if (next.length > MAX_ATTACHMENTS) {
      toast.error(`Add up to ${MAX_ATTACHMENTS} attachments`);
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_BYTES) {
      toast.error('Attachments must total 8 MB or less');
      return;
    }
    setAttachments(next);
  }

  function setQuickSchedule(hour?: number) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    if (hour !== undefined) date.setHours(hour, 0, 0, 0);
    setForm((current) => ({ ...current, startTime: getLocalDatetimeValue(date) }));
  }

  async function handleSubmit(e: React.FormEvent) {
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

    setIsPreparingAttachments(true);
    try {
      const encodedAttachments = await Promise.all(attachments.map(readAttachment));
      const dto: ScheduleEmailDto = {
      subject: form.subject,
      body: form.body,
      recipients: unique,
      startTime: new Date(form.startTime).toISOString(),
      delayBetweenMs: parseInt(form.delayBetweenMs, 10),
      hourlyLimit: parseInt(form.hourlyLimit, 10),
      senderId: form.senderId || undefined,
        attachments: encodedAttachments,
      };

      await scheduleMutation.mutateAsync(dto);
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith('Request failed')) toast.error(error.message);
    } finally {
      setIsPreparingAttachments(false);
    }
  }

  const totalRecipients = recipients.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compose New Email" size="wide" panelClassName="compose-landscape-modal">
      <form onSubmit={handleSubmit} className="compose-horizontal-form">
        <div className="compose-top-tools">
          <div className="compose-top-hint">Write your message and choose when it should be delivered.</div>
          <div className="compose-top-actions">
            <div className="compose-attachments compose-attachments-inline">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                onChange={(event) => {
                  if (event.target.files) addAttachmentFiles(event.target.files);
                  event.target.value = '';
                }}
                className="hidden"
                aria-label="Choose email attachments"
              />
              <button type="button" className="compose-attachment-button" onClick={() => attachmentInputRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m21.4 11.1-8.5 8.5a5.2 5.2 0 0 1-7.4-7.4l9.2-9.1a3.5 3.5 0 0 1 5 5L10.5 17a1.8 1.8 0 0 1-2.5-2.5l8.1-8.1"/></svg>
                Attach
              </button>
              {attachments.length > 0 && <span className="compose-attachment-count">{attachments.length}</span>}
            </div>
            <div className="compose-schedule-anchor">
              <button type="button" className={`compose-schedule-trigger ${scheduleOpen ? 'is-open' : ''}`} onClick={() => setScheduleOpen((open) => !open)} aria-expanded={scheduleOpen}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2"/></svg>
                <span>Send later<small>{new Date(form.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></span>
              </button>
              {scheduleOpen && (
                <div className="compose-schedule-popover">
                  <strong>Schedule delivery</strong>
                  <label htmlFor="compose-start-time">Pick date &amp; time</label>
                  <Input id="compose-start-time" type="datetime-local" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} required />
                  <div className="compose-quick-times">
                    <button type="button" onClick={() => setQuickSchedule()}>Tomorrow</button>
                    <button type="button" onClick={() => setQuickSchedule(10)}>Tomorrow, 10:00 AM</button>
                    <button type="button" onClick={() => setQuickSchedule(11)}>Tomorrow, 11:00 AM</button>
                    <button type="button" onClick={() => setQuickSchedule(15)}>Tomorrow, 3:00 PM</button>
                  </div>
                  <div className="compose-schedule-actions"><button type="button" onClick={() => setScheduleOpen(false)}>Done</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="compose-sender-field">
          <label htmlFor="compose-sender" className="compose-inline-label">From</label>
          <div className="compose-sender-control">
            <select id="compose-sender" className="input-field" value={form.senderId} onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value }))}>
              <option value="">Round-robin (all senders)</option>
              {senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.fromEmail}</option>)}
            </select>
            {senders.length === 0 && <Button type="button" variant="secondary" onClick={() => createEtherealMutation.mutate()} isLoading={createEtherealMutation.isPending} id="create-ethereal-btn">+ Ethereal</Button>}
          </div>
          {senders.length === 0 && <p className="compose-empty-sender">No senders yet. Create a free Ethereal test sender.</p>}
        </div>
        <div className="compose-recipient-field">
          <label htmlFor="compose-recipient-input" className="compose-inline-label">To</label>
          <div className="compose-recipient-control">
            <input id="compose-recipient-input" className="input-field" placeholder="recipient@example.com" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} onKeyDown={handleRecipientInputKeyDown} onBlur={addManualRecipient} />
            <div
              className={`compose-recipient-upload ${isFileHovering ? 'is-hovering' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setIsFileHovering(true); }}
              onDragLeave={() => setIsFileHovering(false)}
              onDrop={handleDropFile}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="recipient-file" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>
              <span>{fileEmailCount > 0 ? `${fileEmailCount} found` : 'Upload list'}</span>
            </div>
          </div>
          {totalRecipients > 0 && <div className="compose-recipient-summary"><span>{totalRecipients} recipient{totalRecipients === 1 ? '' : 's'} added</span><button type="button" onClick={() => { setRecipients([]); setFileEmailCount(0); }}>Clear</button></div>}
        </div>
        {/* Subject */}
        <div className="compose-subject-field">
          <label htmlFor="compose-subject" className="compose-inline-label">Subject</label>
          <Input
          id="compose-subject"
          placeholder="Your email subject..."
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          required
          />
        </div>

        {/* Body */}
        <div className="compose-body-field">
          <label htmlFor="compose-body" className="compose-inline-label">Message</label>
          <Textarea
          id="compose-body"
          placeholder="Write your email content here..."
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={10}
          required
          />
        </div>

        {attachments.length > 0 && <div className="compose-attachments compose-attachment-details">
          <span className="compose-attachment-hint">Up to 5 files · 8 MB total</span>
          {attachments.length > 0 && (
            <ul className="compose-attachment-list">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <span>{file.name} <small>{(file.size / 1024).toFixed(0)} KB</small></span>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>}

        {/* Schedule settings */}
        <div className="compose-delivery-grid">
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

        {/* Actions */}
        <div className="compose-action-row">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={scheduleMutation.isPending || isPreparingAttachments}
            id="schedule-submit-btn"
          >
            Schedule {totalRecipients > 0 ? `${totalRecipients} email${totalRecipients === 1 ? '' : 's'}` : 'Email'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
