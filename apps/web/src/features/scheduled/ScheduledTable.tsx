import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScheduledEmails, type EmailQueryFilters } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import EmailPreviewList from '../dashboard/EmailPreviewList';

interface ScheduledTableProps {
  filters?: EmailQueryFilters;
}

export default function ScheduledTable({ filters = {} }: ScheduledTableProps) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['scheduled-emails', page, filters],
    queryFn: () => getScheduledEmails(page, 20, filters),
    refetchInterval: 10_000,
  });

  const emails = data?.data ?? [];
  const meta = data?.meta;
  const visibleEmails = emails;

  if (isLoading) return <TableSkeleton rows={6} />;

  if (isError) {
    return <div className="mail-inline-message" role="alert">Couldn’t load scheduled emails. Check your connection and refresh.</div>;
  }

  if (visibleEmails.length === 0) {
    return <div className="mail-inline-message">{emails.length === 0 ? 'No scheduled emails yet.' : 'No emails match this search.'}</div>;
  }

  return (
    <div>
      <EmailPreviewList emails={visibleEmails} kind="scheduled" />

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
