import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScheduledEmails } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

export default function ScheduledTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['scheduled-emails', page],
    queryFn: () => getScheduledEmails(page),
    refetchInterval: 10_000,
  });

  if (isLoading) return <TableSkeleton rows={6} />;

  if (isError) {
    return (
      <EmptyState
        title="Failed to load scheduled emails"
        description="Check your connection and try refreshing."
      />
    );
  }

  const emails = data?.data ?? [];
  const meta = data?.meta;

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        title="No scheduled emails"
        description="Click 'Compose New Email' to schedule your first email."
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left py-3 px-4 text-slate-400 font-medium">To</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Subject</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">From</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Scheduled</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr
                key={email.id}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-3 px-4 text-slate-200 font-medium truncate max-w-[200px]">
                  {email.toEmail}
                </td>
                <td className="py-3 px-4 text-slate-300 truncate max-w-[250px]">
                  {email.subject}
                </td>
                <td className="py-3 px-4 text-slate-400 text-xs">
                  {(email as unknown as { sender?: { fromEmail: string } }).sender?.fromEmail ?? '—'}
                </td>
                <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">
                  {new Date(email.scheduledAt).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <StatusBadge status={email.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4">
          <p className="text-xs text-slate-500">
            {meta.total} total · page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="text-xs py-1.5 px-3"
            >
              ← Prev
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
              className="text-xs py-1.5 px-3"
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
