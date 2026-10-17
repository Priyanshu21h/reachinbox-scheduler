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
  const base = 'inline-flex items-center justify-center gap-2 transition-colors duration-150 font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 border border-slate-200',
    ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-2',
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
