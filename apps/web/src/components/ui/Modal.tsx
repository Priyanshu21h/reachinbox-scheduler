import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide';
  panelClassName?: string;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  wide: 'max-w-6xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', panelClassName = '' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/35 animate-fade-in" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[calc(100vh-1rem)] max-h-[calc(100dvh-1rem)] w-full ${sizes[size]} flex-col overflow-hidden glass-card shadow-xl shadow-slate-900/10 animate-slide-up sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100dvh-2rem)] ${panelClassName}`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between p-4 sm:p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <Button
            variant="ghost"
            onClick={onClose}
            id="modal-close-btn"
            className="p-1.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
