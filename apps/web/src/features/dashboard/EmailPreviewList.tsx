import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EmailDto } from '@rs/shared';
import toast from 'react-hot-toast';
import { StatusBadge } from '../../components/ui/Badge';
import { downloadEmailAttachment, setEmailStarred } from '../../lib/api';

interface EmailPreviewListProps {
  emails: EmailDto[];
  kind: 'scheduled' | 'sent' | 'all';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function recipientDisplayName(emailAddress: string): string {
  const localPart = emailAddress.split('@')[0] ?? '';
  const words = localPart
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\d+/g, ' ')
    .split(/[._+-]+/)
    .filter(Boolean);
  if (!words.length) return emailAddress;
  return words.map((word) => `${word[0]!.toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`).join(' ');
}

function EmailMessageView({ email, onClose }: { email: EmailDto; onClose: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const isScheduled = email.status === 'SCHEDULED' || email.status === 'SENDING';
  const messageDate = isScheduled ? email.scheduledAt : email.sentAt ?? email.createdAt;
  const senderName = email.sender.fromEmail.split('@')[0] || email.sender.fromEmail;

  const download = async (attachment: EmailDto['attachments'][number]) => {
    setDownloadingId(attachment.id);
    try {
      const blob = await downloadEmailAttachment(email.id, attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download this attachment. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="mail-message-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mail-message-view" role="dialog" aria-modal="true" aria-label={`Email: ${email.subject || 'No subject'}`}>
        <div className="mail-message-toolbar">
          <button type="button" onClick={onClose} className="mail-message-back" aria-label="Back to email list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Back</span>
          </button>
          <StatusBadge status={email.status} />
        </div>
        <div className="mail-message-content">
          <h1 className="mail-message-subject">{email.subject || '(no subject)'}</h1>
          <div className="mail-message-sender-row">
            <div className="mail-message-avatar" aria-hidden="true">{senderName.slice(0, 1).toUpperCase()}</div>
            <div className="mail-message-sender-copy">
              <strong>{senderName}</strong>
              <span>&lt;{email.sender.fromEmail}&gt;</span>
              <button type="button" className="mail-message-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
                to {email.toEmail} <span aria-hidden="true">{detailsOpen ? '▴' : '▾'}</span>
              </button>
            </div>
            <time dateTime={messageDate}>{new Date(messageDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
          </div>
          {detailsOpen && (
            <dl className="mail-message-details">
              <div><dt>from:</dt><dd>{senderName} &lt;{email.sender.fromEmail}&gt;</dd></div>
              <div><dt>to:</dt><dd>{email.toEmail}</dd></div>
              <div><dt>date:</dt><dd>{new Date(messageDate).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</dd></div>
              <div><dt>subject:</dt><dd>{email.subject || '(no subject)'}</dd></div>
              <div><dt>status:</dt><dd>{email.status.toLowerCase()}</dd></div>
              <div><dt>size:</dt><dd>{formatBytes(email.sizeBytes)}</dd></div>
            </dl>
          )}
          <div className="mail-message-body">{email.body || '(This email has no body.)'}</div>
          {email.error && <div className="mail-message-error" role="note">Delivery note: {email.error}</div>}
          {email.attachments.length > 0 && (
            <section className="mail-message-attachments" aria-label="Attachments">
              <h2>{email.attachments.length} attachment{email.attachments.length === 1 ? '' : 's'}</h2>
              <div className="mail-message-attachment-list">
                {email.attachments.map((attachment) => (
                  <button key={attachment.id} type="button" className="mail-message-attachment" onClick={() => void download(attachment)} disabled={downloadingId === attachment.id}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m21.4 11.1-8.5 8.5a5.2 5.2 0 0 1-7.4-7.4l9.2-9.1a3.5 3.5 0 0 1 5 5L10.5 17a1.8 1.8 0 0 1-2.5-2.5l8.1-8.1" /></svg>
                    <span><strong>{attachment.fileName}</strong><small>{downloadingId === attachment.id ? 'Preparing download…' : `${attachment.contentType} · ${formatBytes(attachment.sizeBytes)}`}</small></span>
                    <span className="mail-message-download-label">Download</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

export default function EmailPreviewList({ emails, kind }: EmailPreviewListProps) {
  const [openedEmail, setOpenedEmail] = useState<EmailDto | null>(null);
  const queryClient = useQueryClient();
  const starMutation = useMutation({
    mutationFn: ({ emailId, starred }: { emailId: string; starred: boolean }) => setEmailStarred(emailId, starred),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] }),
        queryClient.invalidateQueries({ queryKey: ['sent-emails'] }),
        queryClient.invalidateQueries({ queryKey: ['all-emails'] }),
      ]);
    },
    onError: () => toast.error('Could not update the star. Please try again.'),
  });

  return (
    <>
      <div className="mail-preview-list" role="region" aria-label="Email messages">
        {emails.map((email) => {
          const isScheduled = kind === 'scheduled' || (kind === 'all' && (email.status === 'SCHEDULED' || email.status === 'SENDING'));
          const time = isScheduled ? email.scheduledAt : email.sentAt;
          const preview = email.body.replace(/\s+/g, ' ').trim();

          return (
            <article className="mail-preview-row" role="listitem" key={email.id}>
              <button className="mail-preview-open" type="button" onClick={() => setOpenedEmail(email)} aria-label={`Open email to ${email.toEmail}: ${email.subject || 'no subject'}`}>
                <span className="mail-preview-recipient" title={email.toEmail}>To: <strong>{recipientDisplayName(email.toEmail)}</strong></span>
                <span className="mail-preview-content">
                  <span className="mail-preview-title">
                    {isScheduled ? (
                      <span className="mail-time-pill"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.4" strokeLinecap="round"/></svg>{time ? new Date(time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Scheduled'}</span>
                    ) : <StatusBadge status={email.status} />}
                    <strong className="mail-preview-subject">{email.subject || '(no subject)'}</strong>
                    {isScheduled && <span className="mail-preview-state">· {email.status === 'SENDING' ? 'Sending' : 'Scheduled'}</span>}
                    {email.attachments.length > 0 && <span className="mail-attachment-indicator" title={`${email.attachments.length} attachment(s)`} aria-label={`${email.attachments.length} attachment(s)`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="m21.4 11.1-8.5 8.5a5.2 5.2 0 0 1-7.4-7.4l9.2-9.1a3.5 3.5 0 0 1 5 5L10.5 17a1.8 1.8 0 0 1-2.5-2.5l8.1-8.1"/></svg></span>}
                    {preview && <span className="mail-preview-snippet">— {preview}</span>}
                  </span>
                  <span className="mail-preview-mobile-meta"><StatusBadge status={email.status} />{time && <time dateTime={time}>{new Date(time).toLocaleString()}</time>}</span>
                </span>
                <time className="mail-preview-time" dateTime={time ?? undefined}>{!isScheduled && email.status === 'FAILED' ? 'Not sent' : time ? new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</time>
              </button>
              <button
                type="button"
                className={`mail-star-button ${email.isStarred ? 'is-starred' : ''}`}
                onClick={() => starMutation.mutate({ emailId: email.id, starred: !email.isStarred })}
                disabled={starMutation.isPending && starMutation.variables?.emailId === email.id}
                aria-label={email.isStarred ? 'Remove star' : 'Star email'}
                aria-pressed={email.isStarred}
                title={email.isStarred ? 'Remove star' : 'Star email'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3Z" /></svg>
              </button>
            </article>
          );
        })}
      </div>
      {openedEmail && <EmailMessageView email={openedEmail} onClose={() => setOpenedEmail(null)} />}
    </>
  );
}
