import type { EmailStatus } from '@rs/shared';

interface BadgeProps {
  status: EmailStatus;
}

const statusConfig: Record<EmailStatus, { label: string; className: string; dot: string }> = {
  SCHEDULED: { label: 'Scheduled', className: 'badge-scheduled', dot: 'bg-blue-400' },
  SENDING: { label: 'Sending', className: 'badge-sending', dot: 'bg-amber-400 animate-pulse' },
  SENT: { label: 'Sent', className: 'badge-sent', dot: 'bg-emerald-400' },
  FAILED: { label: 'Failed', className: 'badge-failed', dot: 'bg-red-400' },
};

export function StatusBadge({ status }: BadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={config.className}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface GenericBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ children, variant = 'default' }: GenericBadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-blue-50 text-blue-700 border border-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
