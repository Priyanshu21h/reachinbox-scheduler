import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../lib/api';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import SlackControl from '../slack/SlackControl';
import ComposeModal from '../compose/ComposeModal';
import ScheduledTable from '../scheduled/ScheduledTable';
import SentTable from '../sent/SentTable';

type Tab = 'scheduled' | 'sent';

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [composeOpen, setComposeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      qc.clear();
      window.location.href = '/';
    },
    onError: () => toast.error('Logout failed'),
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-surface-900/50 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-100">ReachInbox</span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <SlackControl />

            {/* Compose button */}
            <Button
              id="compose-btn"
              onClick={() => setComposeOpen(true)}
              className="text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Compose
            </Button>

            {/* User menu */}
            <div className="relative">
              <button
                id="user-menu-btn"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-colors"
              >
                <Avatar src={user?.avatarUrl} name={user?.name ?? 'U'} size="sm" />
                <span className="hidden sm:block text-sm text-slate-300 max-w-[120px] truncate">
                  {user?.name}
                </span>
                <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 glass-card shadow-xl shadow-black/50 py-1 z-50">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-sm font-medium text-slate-100 truncate">{user?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <button
                    id="logout-btn"
                    onClick={() => logoutMutation.mutate()}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-2xl font-bold text-slate-100">Email Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your scheduled and sent emails
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Queue', icon: '⏰', href: 'http://localhost:4000/admin/queues' },
            { label: 'Scheduled', icon: '📅', tab: 'scheduled' as Tab },
            { label: 'Sent', icon: '✉️', tab: 'sent' as Tab },
            { label: 'Workers', icon: '⚡', text: 'Active' },
          ].map((item, i) => (
            <div key={i} className="glass-card p-4">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="glass-card overflow-hidden animate-slide-up">
          {/* Tab navigation */}
          <div className="flex items-center border-b border-white/5 px-4">
            {(['scheduled', 'sent'] as Tab[]).map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-4 text-sm font-medium capitalize transition-all duration-200 border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'text-brand-400 border-brand-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                {tab === 'scheduled' ? 'Scheduled Emails' : 'Sent Emails'}
              </button>
            ))}

            <div className="ml-auto">
              <a
                href="http://localhost:4000/admin/queues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Bull Board
              </a>
            </div>
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'scheduled' ? <ScheduledTable /> : <SentTable />}
          </div>
        </div>
      </main>

      {/* Compose Modal */}
      <ComposeModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} />

      {/* Close user menu on outside click */}
      {userMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  );
}
