export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Card */}
        <div className="glass-card p-8 shadow-2xl shadow-black/50">
          {/* Logo / Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-4 shadow-lg shadow-brand-900/50">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">ReachInbox</h1>
            <p className="text-slate-400 text-sm mt-1">Email Scheduler</p>
          </div>

          {/* Tagline */}
          <div className="text-center mb-8">
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Welcome back</h2>
            <p className="text-sm text-slate-400">
              Schedule, send, and track emails with precision.
            </p>
          </div>

          {/* Google OAuth button */}
          <a
            href="http://localhost:4000/auth/google"
            id="google-login-btn"
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50
                       text-gray-800 font-semibold py-3 px-6 rounded-xl transition-all duration-200
                       active:scale-95 shadow-lg shadow-black/20"
          >
            {/* Google logo SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          {/* Footer */}
          <p className="text-center text-xs text-slate-500 mt-6">
            By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </div>

        {/* Decorative dots */}
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-brand-600/5 blur-xl" />
        <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-brand-800/10 blur-xl" />
      </div>
    </div>
  );
}
