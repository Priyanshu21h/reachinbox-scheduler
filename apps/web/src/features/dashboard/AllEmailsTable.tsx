import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllEmails, type EmailQueryFilters } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import EmailPreviewList from './EmailPreviewList';

export default function AllEmailsTable({ filters }: { filters: EmailQueryFilters }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['all-emails', page, filters],
    queryFn: () => getAllEmails(page, 20, filters),
    refetchInterval: 15_000,
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError) return <div className="mail-inline-message" role="alert">Couldn’t load emails. Check your connection and refresh.</div>;
  if (!data?.data.length) return <div className="mail-inline-message">No emails match these filters.</div>;

  return (
    <div>
      <EmailPreviewList emails={data.data} kind="all" />
      {data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-3">
          <p className="text-xs text-slate-500">{data.meta.total} total · page {data.meta.page} of {data.meta.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPage((current) => current - 1)} disabled={page <= 1} className="text-xs py-1.5 px-3">← Prev</Button>
            <Button variant="secondary" onClick={() => setPage((current) => current + 1)} disabled={page >= data.meta.totalPages} className="text-xs py-1.5 px-3">Next →</Button>
          </div>
        </div>
      )}
    </div>
  );
}
