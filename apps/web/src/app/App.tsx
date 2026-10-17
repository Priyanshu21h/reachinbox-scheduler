import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from '../lib/queryClient';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../features/auth/LoginPage';
import DashboardPage from '../features/dashboard/DashboardPage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#059669', secondary: '#ffffff' },
          },
          error: {
            iconTheme: { primary: '#e11d48', secondary: '#ffffff' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
