import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  completeEmailRegistration,
  completePasswordReset,
  loginWithEmail,
  requestEmailRegistration,
  requestPasswordReset,
} from '../../lib/api';

type LoginMode = 'login' | 'register' | 'forgot' | 'setup' | 'reset' | 'sent';

function errorMessage(error: unknown): string {
  if (isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const flow = searchParams.get('flow');
    const linkToken = searchParams.get('token');
    if ((flow === 'verify' || flow === 'reset') && linkToken) {
      setToken(linkToken);
      setMode(flow === 'verify' ? 'setup' : 'reset');
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const heading = {
    login: 'Login',
    register: 'Create your account',
    forgot: 'Reset your password',
    setup: 'Finish setting up',
    reset: 'Choose a new password',
    sent: 'Check your email',
  }[mode];

  const description = {
    login: 'Sign in to manage your email schedule.',
    register: 'Enter your email and we’ll send you a secure setup link.',
    forgot: 'We’ll send a password reset link if an account is eligible.',
    setup: 'Your email is verified. Add your name and choose a password.',
    reset: 'Choose a strong password for your ReachInbox account.',
    sent: 'If the address can be used for this action, a secure link is on its way.',
  }[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === 'login') {
        const user = await loginWithEmail({ email, password });
        queryClient.setQueryData(['me'], user);
        navigate('/dashboard', { replace: true });
      } else if (mode === 'register') {
        await requestEmailRegistration(email);
        setMode('sent');
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMode('sent');
      } else if (mode === 'setup') {
        if (password !== confirmPassword) {
          toast.error('Your passwords do not match');
          return;
        }
        const user = await completeEmailRegistration({ token, name, password });
        queryClient.setQueryData(['me'], user);
        navigate('/dashboard', { replace: true });
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          toast.error('Your passwords do not match');
          return;
        }
        await completePasswordReset({ token, password });
        toast.success('Password updated. Sign in with your new password.');
        setPassword('');
        setConfirmPassword('');
        setToken('');
        setMode('login');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const hasEmailField = ['login', 'register', 'forgot'].includes(mode);
  const hasPasswordField = ['login', 'setup', 'reset'].includes(mode);
  const showGoogle = mode === 'login' || mode === 'register';
  const submitLabel = {
    login: 'Login',
    register: 'Send verification link',
    forgot: 'Send reset link',
    setup: 'Create account',
    reset: 'Save new password',
    sent: 'Continue',
  }[mode];

  return (
    <main className="login-shell min-h-screen flex items-center justify-center p-5 sm:p-8">
      <section className="auth-card animate-slide-up" aria-labelledby="auth-heading">
        <a href="/login" className="auth-brand" aria-label="ReachInbox sign in">
          <span className="login-brand-icon auth-brand-icon" aria-hidden="true">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </span>
          <span>ReachInbox</span>
        </a>

        <h1 id="auth-heading">{heading}</h1>
        <p className="auth-description">{description}</p>

        {mode === 'sent' ? (
          <div className="auth-sent-panel">
            <span className="auth-sent-icon" aria-hidden="true">✓</span>
            <p>Check your inbox and spam folder. The link expires in 30 minutes.</p>
            <button type="button" className="auth-text-button" onClick={() => setMode('login')}>Back to login</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'setup' && (
              <label className="auth-label">Name
                <input className="auth-input" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              </label>
            )}

            {hasEmailField && (
              <label className="auth-label">Email ID
                <input className="auth-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
              </label>
            )}

            {hasPasswordField && (
              <label className="auth-label">{mode === 'login' ? 'Password' : 'Password'}
                <input className="auth-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'login' ? 1 : 12} maxLength={128} required />
                {mode !== 'login' && <small className="auth-hint">Use at least 12 characters.</small>}
              </label>
            )}

            {(mode === 'setup' || mode === 'reset') && (
              <label className="auth-label">Confirm password
                <input className="auth-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required />
              </label>
            )}

            {mode === 'login' && <button className="auth-text-button auth-forgot" type="button" onClick={() => setMode('forgot')}>Forgot password?</button>}

            <button type="submit" className="auth-submit" disabled={pending}>
              {pending && <span className="auth-spinner" aria-hidden="true" />}
              {pending ? 'Please wait…' : submitLabel}
            </button>
          </form>
        )}

        {showGoogle && (
          <>
            <div className="auth-divider"><span /> <small>or continue with</small> <span /></div>
            <a href="http://localhost:4000/auth/google" id="google-login-btn" className="google-signin auth-google-button">
              <GoogleMark />
              Continue with Google
            </a>
          </>
        )}

        <div className="auth-switch">
          {mode === 'login' && <>New to ReachInbox? <button type="button" onClick={() => setMode('register')}>Create an account</button></>}
          {mode === 'register' && <>Already have an account? <button type="button" onClick={() => setMode('login')}>Sign in</button></>}
          {(mode === 'forgot' || mode === 'setup' || mode === 'reset') && <button type="button" onClick={() => { setMode('login'); setToken(''); }}>Back to login</button>}
        </div>

        <p className="auth-terms">By continuing, you agree to our Terms and Privacy Policy.</p>
      </section>
    </main>
  );
}
