import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSentEmails, type EmailQueryFilters } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import EmailPreviewList from '../dashboard/EmailPreviewList';

interface SentTableProps {
  filters?: EmailQueryFilters;
}

export default function SentTable({ filters = {} }: SentTableProps) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sent-emails', page, filters],
    queryFn: () => getSentEmails(page, 20, filters),
    refetchInterval: 15_000,
  });

  const emails = data?.data ?? [];
  const meta = data?.meta;
  const visibleEmails = emails;

  if (isLoading) return <TableSkeleton rows={6} />;

  if (isError) {
    return <div className="mail-inline-message" role="alert">Couldn’t load sent emails. Check your connection and refresh.</div>;
  }

  if (visibleEmails.length === 0) {
    const hasActiveFilters = Object.values(filters).some((value) => value !== undefined && value !== '');
    return <div className="mail-inline-message">{hasActiveFilters ? 'No sent emails match your current search or filters. Clear the filters to see all sent mail.' : 'No sent emails yet.'}</div>;
  }

  return (
    <div>
      <EmailPreviewList emails={visibleEmails} kind="sent" />

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
