import { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  isLoading?: boolean;
}

export default function Button({
  variant = 'primary',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 transition-all duration-200 font-medium rounded-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 shadow-lg shadow-brand-900/40',
    secondary: 'bg-surface-800 hover:bg-surface-700 text-slate-200 px-5 py-2.5 border border-white/10',
    ghost: 'text-slate-400 hover:text-slate-100 hover:bg-white/5 px-3 py-2',
    danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 px-5 py-2.5',
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
