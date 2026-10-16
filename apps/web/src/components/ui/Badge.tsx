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
    default: 'bg-white/10 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    danger: 'bg-red-500/20 text-red-300 border border-red-500/30',
    info: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
