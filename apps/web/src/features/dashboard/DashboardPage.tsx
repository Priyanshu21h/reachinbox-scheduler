import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL, getDashboardStats, logout, type EmailQueryFilters } from '../../lib/api';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import SlackControl from '../slack/SlackControl';
import ComposeModal from '../compose/ComposeModal';
import ScheduledTable from '../scheduled/ScheduledTable';
import SentTable from '../sent/SentTable';
import AllEmailsTable from './AllEmailsTable';

type Tab = 'scheduled' | 'sent';
type MailScope = 'current' | 'all' | Tab;
type StatusFilter = '' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';

interface FilterDraft {
  from: string;
  to: string;
  subject: string;
  includes: string;
  excludes: string;
  status: StatusFilter;
  dateWithin: 'any' | '1d' | '7d' | '30d' | 'custom';
  customDate: string;
  sizeOperator: 'greater' | 'less';
  sizeValue: string;
  sizeUnit: 'KB' | 'MB';
  hasAttachment: boolean;
  starred: boolean;
  scope: MailScope;
}

const emptyFilterDraft: FilterDraft = {
  from: '', to: '', subject: '', includes: '', excludes: '', status: '',
  dateWithin: 'any', customDate: '', sizeOperator: 'greater', sizeValue: '',
  sizeUnit: 'MB', hasAttachment: false, starred: false, scope: 'current',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem('reachinbox-theme') === 'dark');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(emptyFilterDraft);
  const [appliedFilters, setAppliedFilters] = useState<EmailQueryFilters>({});
  const [appliedScope, setAppliedScope] = useState<MailScope>('current');

  const viewScope = appliedScope === 'current' ? activeTab : appliedScope;
  const queryFilters = useMemo<EmailQueryFilters>(() => ({
    ...appliedFilters,
    ...(search.trim() ? { q: search.trim() } : {}),
  }), [appliedFilters, search]);

  useEffect(() => {
    const theme = darkTheme ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('reachinbox-theme', theme);
  }, [darkTheme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get('slack');
    const slackError = params.get('slack_error');
    if (slackParam === 'connected') {
      toast.success('Slack connected successfully!');
      void qc.invalidateQueries({ queryKey: ['slack-status'] });
      params.delete('slack');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    } else if (slackError) {
      toast.error(`Slack connection failed: ${slackError}`);
      params.delete('slack_error');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
  }, [qc]);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 10_000,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.clear();
      window.location.replace('/login');
    },
    onError: () => toast.error('Logout failed. Please try again.'),
  });

  const refresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['scheduled-emails'] }),
        qc.invalidateQueries({ queryKey: ['sent-emails'] }),
        qc.invalidateQueries({ queryKey: ['all-emails'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-stats'] }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 550)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    setAppliedScope('current');
    setFilterDraft((current) => ({ ...current, scope: 'current', status: '' }));
    setAppliedFilters((current) => {
      const next = { ...current };
      delete next.status;
      return next;
    });
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const filters: EmailQueryFilters = {
      ...(filterDraft.from.trim() ? { from: filterDraft.from.trim() } : {}),
      ...(filterDraft.to.trim() ? { to: filterDraft.to.trim() } : {}),
      ...(filterDraft.subject.trim() ? { subject: filterDraft.subject.trim() } : {}),
      ...(filterDraft.includes.trim() ? { includes: filterDraft.includes.trim() } : {}),
      ...(filterDraft.excludes.trim() ? { excludes: filterDraft.excludes.trim() } : {}),
      ...(filterDraft.status ? { status: filterDraft.status } : {}),
      ...(filterDraft.hasAttachment ? { hasAttachment: 'true' as const } : {}),
      ...(filterDraft.starred ? { starred: 'true' as const } : {}),
    };

    const now = new Date();
    if (filterDraft.dateWithin !== 'any') {
      if (filterDraft.dateWithin === 'custom' && filterDraft.customDate) {
        const start = new Date(`${filterDraft.customDate}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filters.dateAfter = start.toISOString();
        filters.dateBefore = end.toISOString();
      } else if (filterDraft.dateWithin !== 'custom') {
        const days = Number.parseInt(filterDraft.dateWithin, 10);
        filters.dateAfter = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const size = Number.parseFloat(filterDraft.sizeValue);
    if (Number.isFinite(size) && size >= 0) {
      filters.sizeOperator = filterDraft.sizeOperator;
      filters.sizeBytes = Math.round(size * (filterDraft.sizeUnit === 'MB' ? 1_000_000 : 1_000));
    }

    setAppliedFilters(filters);
    setAppliedScope(filterDraft.scope);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setFilterDraft(emptyFilterDraft);
    setAppliedFilters({});
    setAppliedScope('current');
    setSearch('');
    setFilterOpen(false);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'scheduled', label: 'Scheduled', count: stats?.scheduled },
    { id: 'sent', label: 'Sent', count: stats?.sent },
  ];

  return (
    <div className="mail-app min-h-screen">
      <aside className="mail-sidebar">
        <a href="/dashboard" className="mail-brand" aria-label="ReachInbox home">
          <span className="mail-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="m4 7 8 6 8-6"/></svg>
          </span>
          <span>ReachInbox</span>
        </a>

        <Button id="compose-btn" onClick={() => setComposeOpen(true)} className="mail-compose-button">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M12 5v14m7-7H5" /></svg>
          Compose
        </Button>

        <div className="mail-nav-caption">MAILBOX</div>
        <nav className="mail-nav" aria-label="Email folders">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => changeTab(tab.id)} className={`mail-nav-item ${activeTab === tab.id ? 'is-active' : ''}`} aria-current={activeTab === tab.id ? 'page' : undefined}>
              <span className="flex items-center gap-3">
                {tab.id === 'scheduled' ? (
                  <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 2"/></svg>
                ) : (
                  <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m3 11 18-8-8 18-2-8-8-2Z"/><path strokeLinecap="round" d="m11 13 5-5"/></svg>
                )}
                {tab.label}
              </span>
              <span className="mail-nav-count">{tab.count ?? '—'}</span>
            </button>
          ))}
        </nav>

        <div className="mail-sidebar-bottom"><div className="mail-sidebar-note">Email delivery, at your pace.</div></div>
      </aside>

      <div className="mail-workspace">
        <header className="mail-topbar">
          <div className="mail-search-tools">
            <div className="mail-search-wrap">
              <svg className="mail-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m16 16 4 4"/></svg>
              <input
                aria-label="Search emails"
                className="mail-search"
                placeholder="Search mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && <button type="button" className="mail-clear-search" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
            </div>
            <div className="mail-filter-anchor">
              <button type="button" className={`mail-filter-button ${filterOpen || Object.keys(appliedFilters).length ? 'is-active' : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-label="Open advanced search" aria-expanded={filterOpen} title="Show search options">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 5h16l-6.2 7.1v5.4l-3.6 1.8v-7.2L4 5Z"/></svg>
              </button>
              {filterOpen && (
                <form className="mail-filter-popover" onSubmit={applyFilters}>
                  <div className="mail-filter-field"><label htmlFor="filter-from">From</label><input id="filter-from" value={filterDraft.from} onChange={(event) => setFilterDraft({ ...filterDraft, from: event.target.value })} /></div>
                  <div className="mail-filter-field"><label htmlFor="filter-to">To</label><input id="filter-to" value={filterDraft.to} onChange={(event) => setFilterDraft({ ...filterDraft, to: event.target.value })} /></div>
                  <div className="mail-filter-field"><label htmlFor="filter-subject">Subject</label><input id="filter-subject" value={filterDraft.subject} onChange={(event) => setFilterDraft({ ...filterDraft, subject: event.target.value })} /></div>
                  <div className="mail-filter-field"><label htmlFor="filter-includes">Includes the words</label><input id="filter-includes" value={filterDraft.includes} onChange={(event) => setFilterDraft({ ...filterDraft, includes: event.target.value })} /></div>
                  <div className="mail-filter-field"><label htmlFor="filter-excludes">Doesn’t have</label><input id="filter-excludes" value={filterDraft.excludes} onChange={(event) => setFilterDraft({ ...filterDraft, excludes: event.target.value })} /></div>
                  <div className="mail-filter-field"><label htmlFor="filter-size-op">Size</label><div className="mail-filter-size"><select id="filter-size-op" value={filterDraft.sizeOperator} onChange={(event) => setFilterDraft({ ...filterDraft, sizeOperator: event.target.value as FilterDraft['sizeOperator'] })}><option value="greater">greater than</option><option value="less">less than</option></select><input aria-label="Size value" type="number" min="0" step="any" value={filterDraft.sizeValue} onChange={(event) => setFilterDraft({ ...filterDraft, sizeValue: event.target.value })} /><select aria-label="Size unit" value={filterDraft.sizeUnit} onChange={(event) => setFilterDraft({ ...filterDraft, sizeUnit: event.target.value as FilterDraft['sizeUnit'] })}><option>KB</option><option>MB</option></select></div></div>
                  <div className="mail-filter-field"><label htmlFor="filter-date">Date within</label><div className="mail-filter-date"><select id="filter-date" value={filterDraft.dateWithin} onChange={(event) => setFilterDraft({ ...filterDraft, dateWithin: event.target.value as FilterDraft['dateWithin'] })}><option value="any">Any time</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="custom">Specific day</option></select>{filterDraft.dateWithin === 'custom' && <input aria-label="Choose date" type="date" value={filterDraft.customDate} onChange={(event) => setFilterDraft({ ...filterDraft, customDate: event.target.value })} />}</div></div>
                  <div className="mail-filter-field"><label htmlFor="filter-scope">Search</label><select id="filter-scope" value={filterDraft.scope} onChange={(event) => setFilterDraft({ ...filterDraft, scope: event.target.value as MailScope })}><option value="current">Current folder</option><option value="all">All mail</option><option value="scheduled">Scheduled</option><option value="sent">Sent</option></select></div>
                  <div className="mail-filter-field"><label htmlFor="filter-status">Status</label><select id="filter-status" value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value as StatusFilter })}><option value="">Any status</option><option value="SCHEDULED">Scheduled</option><option value="SENDING">Sending</option><option value="SENT">Sent</option><option value="FAILED">Failed</option></select></div>
                  <label className="mail-filter-checkbox"><input type="checkbox" checked={filterDraft.hasAttachment} onChange={(event) => setFilterDraft({ ...filterDraft, hasAttachment: event.target.checked })} />Has attachment</label>
                  <label className="mail-filter-checkbox"><input type="checkbox" checked={filterDraft.starred} onChange={(event) => setFilterDraft({ ...filterDraft, starred: event.target.checked })} />Starred</label>
                  <div className="mail-filter-actions"><button type="button" onClick={clearFilters} className="mail-filter-clear">Clear</button><button type="submit" className="mail-filter-submit">Search</button></div>
                </form>
              )}
            </div>
            <button type="button" onClick={() => void refresh()} className={`mail-refresh-button ${isRefreshing ? 'is-refreshing' : ''}`} title={isRefreshing ? 'Refreshing emails…' : 'Refresh emails'} aria-label={isRefreshing ? 'Refreshing emails' : 'Refresh emails'} aria-busy={isRefreshing} disabled={isRefreshing}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7v5h-5M4 17v-5h5"/><path strokeLinecap="round" strokeLinejoin="round" d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></svg>
            </button>
          </div>

          <div className="mail-top-actions">
            <SlackControl />
            {user?.isAdmin && (
              <a className="mail-admin-link" href={`${API_BASE_URL}/admin/queues`} target="_blank" rel="noreferrer" title="Open Bull Board queue monitor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 19h16M7 16V8m5 8V5m5 11v-5"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M3 5h4v4H3zm7 8h4v4h-4zm7-5h4v4h-4z"/></svg>
                <span>Queue monitor</span>
              </a>
            )}
            <div className="relative">
              <button id="user-menu-btn" type="button" onClick={() => setUserMenuOpen((open) => !open)} className="mail-profile-button" aria-expanded={userMenuOpen}>
                <Avatar src={user?.avatarUrl} name={user?.name ?? 'User'} size="sm" />
                <span className="mail-profile-copy"><strong>{user?.name}</strong><small>{user?.email}</small></span>
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m7 10 5 5 5-5"/></svg>
              </button>
              {userMenuOpen && (
                <div className="mail-user-menu">
                  <div className="mail-user-details"><strong>{user?.name}</strong><span>{user?.email}</span></div>
                  <button id="logout-btn" type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending} aria-busy={logoutMutation.isPending}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10 17l5-5-5-5m5 5H3m9-8h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5"/></svg>
                    {logoutMutation.isPending ? 'Signing out…' : 'Log out'}
                  </button>
                </div>
              )}
            </div>
            <button type="button" aria-label={`Switch to ${darkTheme ? 'light' : 'dark'} theme`} title={`Switch to ${darkTheme ? 'light' : 'dark'} theme`} onClick={() => setDarkTheme((current) => !current)} className="mail-theme-toggle">
              {darkTheme ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.6 8.6 0 1 0 12 12Z"/></svg>
              )}
            </button>
          </div>
        </header>

        <main className="mail-main">
          <section className="mail-inbox" aria-label={`${viewScope} emails`}>
            <div className="mail-list-content">
              {viewScope === 'all'
                ? <AllEmailsTable filters={queryFilters} />
                : viewScope === 'scheduled'
                  ? <ScheduledTable filters={queryFilters} />
                  : <SentTable filters={queryFilters} />}
            </div>
          </section>
        </main>
      </div>

      <ComposeModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} />
      {userMenuOpen && <button type="button" className="mail-menu-dismiss" onClick={() => setUserMenuOpen(false)} aria-label="Close profile menu" />}
    </div>
  );
}
